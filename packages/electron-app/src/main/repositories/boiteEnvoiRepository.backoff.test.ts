import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { runMigrations } from "../db/migrate.js";
import { BoiteEnvoiRepository, calculerDelaiBackoffMs, DELAI_BACKOFF_BASE_MS, DELAI_BACKOFF_PLAFOND_MS } from "./boiteEnvoiRepository.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.8, chantier B — backoff
 * réel des tentatives de synchronisation. Base réelle (jamais un mock de
 * repository), horloge contrôlée via `vi.useFakeTimers()`/`vi.setSystemTime`
 * (jamais un test dépendant du temps réel).
 */

describe("calculerDelaiBackoffMs — pur, sans base de données", () => {
  it("croît de façon exponentielle à chaque tentative supplémentaire", () => {
    expect(calculerDelaiBackoffMs(1)).toBe(DELAI_BACKOFF_BASE_MS);
    expect(calculerDelaiBackoffMs(2)).toBe(DELAI_BACKOFF_BASE_MS * 2);
    expect(calculerDelaiBackoffMs(3)).toBe(DELAI_BACKOFF_BASE_MS * 4);
    expect(calculerDelaiBackoffMs(4)).toBe(DELAI_BACKOFF_BASE_MS * 8);
  });

  it("atteint le plafond et ne le dépasse jamais, même pour un très grand nombre de tentatives", () => {
    expect(calculerDelaiBackoffMs(10)).toBe(DELAI_BACKOFF_PLAFOND_MS);
    expect(calculerDelaiBackoffMs(100)).toBe(DELAI_BACKOFF_PLAFOND_MS);
    expect(calculerDelaiBackoffMs(1000)).toBe(DELAI_BACKOFF_PLAFOND_MS);
  });
});

describe("BoiteEnvoiRepository — backoff réel (Phase 5, sous-phase 5.8, chantier B)", () => {
  let db: Database.Database;
  let boiteEnvoi: BoiteEnvoiRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    boiteEnvoi = new BoiteEnvoiRepository(db);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it("le premier échec programme une nouvelle tentative (next_attempt_at = maintenant + délai de base)", () => {
    const id = boiteEnvoi.creer("entree", "entite-test", { test: true });

    boiteEnvoi.enregistrerErreur(id, "panne réseau");

    const entree = boiteEnvoi.findById(id)!;
    expect(entree.status).toBe("error");
    expect(entree.attempts).toBe(1);
    expect(entree.nextAttemptAt).toBe(new Date(Date.now() + DELAI_BACKOFF_BASE_MS).toISOString());
  });

  it("les échecs successifs augmentent progressivement le délai (exponentiel)", () => {
    const id = boiteEnvoi.creer("entree", "entite-test", { test: true });

    boiteEnvoi.enregistrerErreur(id, "échec 1");
    const delai1 = new Date(boiteEnvoi.findById(id)!.nextAttemptAt!).getTime() - Date.now();

    boiteEnvoi.enregistrerErreur(id, "échec 2");
    const delai2 = new Date(boiteEnvoi.findById(id)!.nextAttemptAt!).getTime() - Date.now();

    boiteEnvoi.enregistrerErreur(id, "échec 3");
    const delai3 = new Date(boiteEnvoi.findById(id)!.nextAttemptAt!).getTime() - Date.now();

    expect(delai1).toBe(DELAI_BACKOFF_BASE_MS);
    expect(delai2).toBe(DELAI_BACKOFF_BASE_MS * 2);
    expect(delai3).toBe(DELAI_BACKOFF_BASE_MS * 4);
    expect(boiteEnvoi.findById(id)!.attempts).toBe(3);
  });

  it("le délai atteint un plafond et ne le dépasse jamais, quel que soit le nombre d'échecs", () => {
    const id = boiteEnvoi.creer("entree", "entite-test", { test: true });

    for (let i = 0; i < 10; i++) {
      boiteEnvoi.enregistrerErreur(id, `échec ${i + 1}`);
    }

    const delaiFinal = new Date(boiteEnvoi.findById(id)!.nextAttemptAt!).getTime() - Date.now();
    expect(delaiFinal).toBe(DELAI_BACKOFF_PLAFOND_MS);
    expect(boiteEnvoi.findById(id)!.attempts).toBe(10);
  });

  it("une nouvelle opération (jamais encore en échec) conserve le comportement normal : next_attempt_at NULL, toujours éligible immédiatement", () => {
    const id = boiteEnvoi.creer("entree", "entite-test", { test: true });

    const entree = boiteEnvoi.findById(id)!;
    expect(entree.status).toBe("pending");
    expect(entree.nextAttemptAt).toBeNull();
    expect(boiteEnvoi.listerPretesPourEnvoi().map((e) => e.id)).toContain(id);
  });

  it("une entrée dont next_attempt_at est dans le futur n'est JAMAIS renvoyée prématurément par listerPretesPourEnvoi()", () => {
    const id = boiteEnvoi.creer("entree", "entite-test", { test: true });
    boiteEnvoi.enregistrerErreur(id, "panne réseau"); // next_attempt_at = maintenant + 30s.

    // Juste AVANT l'échéance : toujours pas éligible.
    vi.setSystemTime(new Date(Date.now() + DELAI_BACKOFF_BASE_MS - 1000));
    expect(boiteEnvoi.listerPretesPourEnvoi().map((e) => e.id)).not.toContain(id);
  });

  it("une entrée redevenue éligible (next_attempt_at atteint ou dépassé) est de nouveau renvoyée normalement par listerPretesPourEnvoi()", () => {
    const id = boiteEnvoi.creer("entree", "entite-test", { test: true });
    boiteEnvoi.enregistrerErreur(id, "panne réseau"); // next_attempt_at = maintenant + 30s.

    // Exactement à l'échéance.
    vi.setSystemTime(new Date(Date.now() + DELAI_BACKOFF_BASE_MS));
    expect(boiteEnvoi.listerPretesPourEnvoi().map((e) => e.id)).toContain(id);
  });

  it("une entrée 'pending' ordinaire (jamais en erreur) reste toujours éligible, aux côtés d'une entrée 'error' pas encore échue, qui elle reste exclue", () => {
    const idPending = boiteEnvoi.creer("entree", "entite-pending", { test: true });
    const idError = boiteEnvoi.creer("entree", "entite-error", { test: true });
    boiteEnvoi.enregistrerErreur(idError, "panne réseau");

    const pretes = boiteEnvoi.listerPretesPourEnvoi().map((e) => e.id);
    expect(pretes).toContain(idPending);
    expect(pretes).not.toContain(idError);
  });
});
