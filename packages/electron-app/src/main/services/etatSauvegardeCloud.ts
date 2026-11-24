import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * État de la sauvegarde cloud (2026-11-24) — correction "les sauvegardes
 * B2 échouaient en silence depuis un mois" : jusqu'ici, chaque échec
 * d'envoi n'était écrit que dans la console (jamais visible au magasin).
 * On mémorise désormais la dernière réussite et le dernier échec dans un
 * petit fichier du dossier de l'application (survit aux redémarrages),
 * lu par l'indicateur de la barre du haut (voir IndicateurSauvegardeCloud).
 *
 * Ne contient AUCUNE donnée sensible (dates + message d'erreur), jamais
 * bloquant : toute erreur de lecture/écriture est ignorée.
 */
export interface EtatSauvegardeCloud {
  derniereReussite: string | null;
  dernierEchec: { date: string; message: string } | null;
}

function chemin(): string | null {
  try {
    return join(app.getPath("userData"), "etat-sauvegarde-cloud.json");
  } catch {
    return null;
  }
}

export function lireEtatSauvegardeCloud(): EtatSauvegardeCloud {
  const c = chemin();
  if (!c || !existsSync(c)) return { derniereReussite: null, dernierEchec: null };
  try {
    const brut = JSON.parse(readFileSync(c, "utf-8")) as Partial<EtatSauvegardeCloud>;
    return { derniereReussite: brut.derniereReussite ?? null, dernierEchec: brut.dernierEchec ?? null };
  } catch {
    return { derniereReussite: null, dernierEchec: null };
  }
}

function ecrire(etat: EtatSauvegardeCloud): void {
  const c = chemin();
  if (!c) return;
  try {
    writeFileSync(c, JSON.stringify(etat, null, 2), "utf-8");
  } catch {
    // Jamais bloquant (même principe que le reste de la sauvegarde cloud).
  }
}

export function noterReussiteSauvegardeCloud(date = new Date().toISOString()): void {
  const etat = lireEtatSauvegardeCloud();
  ecrire({ ...etat, derniereReussite: date });
}

export function noterEchecSauvegardeCloud(message: string, date = new Date().toISOString()): void {
  const etat = lireEtatSauvegardeCloud();
  ecrire({ ...etat, dernierEchec: { date, message } });
}

/** Initialisation unique (installation existante sans historique local) : date de la sauvegarde la plus récente réellement présente dans le cloud. */
export function initialiserDerniereReussiteSiInconnue(dateCloud: string | null): void {
  const etat = lireEtatSauvegardeCloud();
  if (etat.derniereReussite || !dateCloud) return;
  ecrire({ ...etat, derniereReussite: dateCloud });
}

/** Seuil au-delà duquel l'absence de nouvelle sauvegarde est signalée (le PC Shop sauvegarde normalement au moins une fois par jour d'activité). */
export const SEUIL_ALERTE_JOURS = 3;

export interface DiagnosticSauvegardeCloud extends EtatSauvegardeCloud {
  configuree: boolean;
  /** Vrai si un échec est plus récent que la dernière réussite, ou si la dernière réussite date de plus de SEUIL_ALERTE_JOURS jours. */
  probleme: boolean;
}

export function diagnostiquer(etat: EtatSauvegardeCloud, configuree: boolean, maintenant = Date.now()): DiagnosticSauvegardeCloud {
  if (!configuree) return { ...etat, configuree, probleme: false };
  const echecPlusRecent = !!etat.dernierEchec && (!etat.derniereReussite || etat.dernierEchec.date > etat.derniereReussite);
  const tropAncienne = !!etat.derniereReussite && maintenant - new Date(etat.derniereReussite).getTime() > SEUIL_ALERTE_JOURS * 86_400_000;
  return { ...etat, configuree, probleme: echecPlusRecent || tropAncienne };
}
