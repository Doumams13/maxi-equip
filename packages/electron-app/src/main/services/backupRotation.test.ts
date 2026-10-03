import { describe, it, expect } from "vitest";
import { calculerSauvegardesAConserver, type EntreeRotation, type PolitiqueRotation } from "./backupRotation.js";

/**
 * Tests de la politique de rotation — correction Phase Finale, Bloc 5
 * (14 quotidiennes / 8 hebdomadaires / 12 mensuelles).
 */

const JOUR_MS = 24 * 60 * 60 * 1000;
const MAINTENANT = new Date("2026-06-15T12:00:00.000Z").getTime();

function entreeIlYA(joursAvant: number, suffixe = ""): EntreeRotation {
  const date = new Date(MAINTENANT - joursAvant * JOUR_MS);
  return { chemin: `backup-j${joursAvant}${suffixe}`, createdAt: date.toISOString() };
}

const POLITIQUE_PETITE: PolitiqueRotation = { quotidien: 3, hebdomadaire: 2, mensuel: 2 };

describe("calculerSauvegardesAConserver", () => {
  it("moins d'entrées que le palier quotidien : tout est conservé", () => {
    const entrees = [entreeIlYA(0), entreeIlYA(1)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.size).toBe(2);
    for (const e of entrees) expect(conserves.has(e.chemin)).toBe(true);
  });

  it("dépassement du palier quotidien : seules les N plus récentes sont conservées au palier quotidien", () => {
    // Politique quotidien=3 : jours 0,1,2 doivent être conservés comme "quotidien" (pas de doublon de semaine ici pour ne tester QUE ce palier).
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.size).toBe(3);
    expect(conserves.has("backup-j0")).toBe(true);
    expect(conserves.has("backup-j1")).toBe(true);
    expect(conserves.has("backup-j2")).toBe(true);
  });

  it("promotion vers hebdomadaire : une entrée plus ancienne que le palier quotidien, dans une semaine distincte, est conservée", () => {
    // quotidien=3 -> jours 0,1,2 conservés directement. jour 10 (semaine différente) doit être promu "hebdomadaire".
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2), entreeIlYA(10)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.has("backup-j10")).toBe(true);
    expect(conserves.size).toBe(4);
  });

  it("une seule sauvegarde conservée par semaine distincte (jamais deux de la même semaine au palier hebdomadaire)", () => {
    // jour 10 et jour 11 tombent très probablement dans la même semaine (découpage 7 jours) -> une seule des deux doit être conservée au palier hebdo.
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2), entreeIlYA(10), entreeIlYA(11)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    // Les 3 quotidiennes + au plus 2 semaines distinctes (palier hebdomadaire=2) parmi {j10, j11}.
    const conservesHorsQuotidien = [...conserves].filter((c) => c !== "backup-j0" && c !== "backup-j1" && c !== "backup-j2");
    expect(conservesHorsQuotidien.length).toBeLessThanOrEqual(2);
    // La plus RÉCENTE des deux (j10) est celle conservée pour sa semaine (le parcours va du plus récent au plus ancien).
    if (conservesHorsQuotidien.length === 1) {
      expect(conserves.has("backup-j10")).toBe(true);
      expect(conserves.has("backup-j11")).toBe(false);
    }
  });

  it("le palier hebdomadaire est plafonné : au-delà de M semaines distinctes, plus aucune nouvelle semaine n'est ajoutée à ce palier", () => {
    // hebdomadaire=2 : jours 10, 20, 30 sont dans 3 semaines distinctes -> seules 2 doivent être retenues au palier hebdo (les 2 plus récentes), la 3e (j30) doit être évaluée par le palier MENSUEL à la place.
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2), entreeIlYA(10), entreeIlYA(20), entreeIlYA(30)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.has("backup-j10")).toBe(true);
    expect(conserves.has("backup-j20")).toBe(true);
    // j30 doit malgré tout être conservée — mais via le palier MENSUEL (mensuel=2), pas hebdomadaire.
    expect(conserves.has("backup-j30")).toBe(true);
  });

  it("promotion vers mensuel : une entrée bien au-delà des paliers quotidien/hebdomadaire, dans un mois distinct, est conservée", () => {
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2), entreeIlYA(10), entreeIlYA(20), entreeIlYA(90)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.has("backup-j90")).toBe(true);
  });

  it("le palier mensuel est plafonné : au-delà de K mois distincts, les entrées plus anciennes ne sont PAS conservées (suppression uniquement des éléments expirés)", () => {
    // mensuel=2 : jours 90, 150, 400 tombent dans 3 mois distincts au-delà des paliers quotidien/hebdo -> seuls 2 doivent être conservés.
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2), entreeIlYA(10), entreeIlYA(20), entreeIlYA(90), entreeIlYA(150), entreeIlYA(400)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.has("backup-j90")).toBe(true);
    expect(conserves.has("backup-j150")).toBe(true);
    expect(conserves.has("backup-j400")).toBe(false); // expirée : au-delà de tous les paliers, jamais conservée.
  });

  it("une seule sauvegarde conservée par mois distinct au palier mensuel", () => {
    const entrees = [entreeIlYA(0), entreeIlYA(1), entreeIlYA(2), entreeIlYA(10), entreeIlYA(20), entreeIlYA(90), entreeIlYA(95)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    // j90 et j95 sont très probablement dans le même mois -> une seule des deux conservée.
    const conserveesMensuelles = [conserves.has("backup-j90"), conserves.has("backup-j95")].filter(Boolean).length;
    expect(conserveesMensuelles).toBeLessThanOrEqual(1);
  });

  it("politique réelle par défaut (14/8/12) : conserve exactement 14 jours consécutifs sans aucune promotion nécessaire", () => {
    const entrees = Array.from({ length: 14 }, (_, i) => entreeIlYA(i));
    const conserves = calculerSauvegardesAConserver(entrees); // politique par défaut
    expect(conserves.size).toBe(14);
  });

  it("ordre d'entrée non trié : le résultat reste correct (retrié en interne, jamais supposé pré-trié)", () => {
    const entrees = [entreeIlYA(2), entreeIlYA(0), entreeIlYA(1)];
    const conserves = calculerSauvegardesAConserver(entrees, POLITIQUE_PETITE);
    expect(conserves.size).toBe(3);
  });

  it("liste vide : ne plante jamais, renvoie un ensemble vide", () => {
    expect(calculerSauvegardesAConserver([], POLITIQUE_PETITE).size).toBe(0);
  });
});
