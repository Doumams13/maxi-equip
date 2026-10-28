import { describe, it, expect, vi } from "vitest";
import { PosteEventBus } from "./posteEventBus.js";

/**
 * Tests réels (logique pure, aucune dépendance HTTP) — système
 * multiposte fiable (2026-10-28), Phase F.
 */
describe("PosteEventBus", () => {
  it("diffuser() notifie toutes les connexions enregistrées, quel que soit le poste", () => {
    const bus = new PosteEventBus();
    const notifierA = vi.fn();
    const notifierB = vi.fn();
    bus.enregistrer("poste-a", { notifier: notifierA, fermer: vi.fn() });
    bus.enregistrer("poste-b", { notifier: notifierB, fermer: vi.fn() });

    bus.diffuser({ type: "vente" });

    expect(notifierA).toHaveBeenCalledWith({ type: "vente" });
    expect(notifierB).toHaveBeenCalledWith({ type: "vente" });
  });

  it("un poste avec plusieurs connexions (ex. deux fenêtres) reçoit le signal sur chacune", () => {
    const bus = new PosteEventBus();
    const notifier1 = vi.fn();
    const notifier2 = vi.fn();
    bus.enregistrer("poste-a", { notifier: notifier1, fermer: vi.fn() });
    bus.enregistrer("poste-a", { notifier: notifier2, fermer: vi.fn() });

    bus.diffuser({ type: "entree" });

    expect(notifier1).toHaveBeenCalledTimes(1);
    expect(notifier2).toHaveBeenCalledTimes(1);
    expect(bus.compterConnexions("poste-a")).toBe(2);
  });

  it("le désabonnement retiré par enregistrer() arrête réellement les notifications futures", () => {
    const bus = new PosteEventBus();
    const notifier = vi.fn();
    const desabonner = bus.enregistrer("poste-a", { notifier, fermer: vi.fn() });

    desabonner();
    bus.diffuser({ type: "sortie" });

    expect(notifier).not.toHaveBeenCalled();
    expect(bus.compterConnexions("poste-a")).toBe(0);
  });

  it("fermerPoste() appelle fermer() sur CHAQUE connexion ouverte de ce poste, jamais celles d'un autre", () => {
    const bus = new PosteEventBus();
    const fermerA = vi.fn();
    const fermerB = vi.fn();
    bus.enregistrer("poste-bloque", { notifier: vi.fn(), fermer: fermerA });
    bus.enregistrer("poste-bloque", { notifier: vi.fn(), fermer: fermerA });
    bus.enregistrer("poste-autre", { notifier: vi.fn(), fermer: fermerB });

    bus.fermerPoste("poste-bloque");

    expect(fermerA).toHaveBeenCalledTimes(2);
    expect(fermerB).not.toHaveBeenCalled();
  });

  it("fermerPoste() sur un poste sans connexion active : ne fait rien, jamais une exception", () => {
    const bus = new PosteEventBus();
    expect(() => bus.fermerPoste("jamais-connecte")).not.toThrow();
  });

  it("diffuser() sans aucune connexion : ne fait rien, jamais une exception", () => {
    const bus = new PosteEventBus();
    expect(() => bus.diffuser({ type: "transfert" })).not.toThrow();
  });
});
