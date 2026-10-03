/**
 * Politique de rotation des sauvegardes automatiques — correction Phase
 * Finale, Bloc 5 : remplace l'ancien plafond plat (10 sauvegardes les
 * plus récentes, sans distinction) par une politique à paliers
 * (grandfather-father-son) : 14 quotidiennes, puis 8 hebdomadaires, puis
 * 12 mensuelles. Fonction PURE (aucune I/O, aucune dépendance SQLite) —
 * testable indépendamment de `BackupService`, appelée par
 * `purgerAnciennesSauvegardesAutomatiques()`.
 *
 * ALGORITHME (séquentiel, jamais un double comptage d'une même fenêtre
 * temporelle) :
 *  1. Les N (14) sauvegardes les plus récentes sont conservées telles
 *     quelles ("quotidien").
 *  2. Parmi les suivantes (plus anciennes), une seule par semaine
 *     distincte est conservée, jusqu'à M (8) semaines distinctes
 *     ("hebdomadaire") — dès qu'une nouvelle semaine distincte
 *     dépasserait ce palier, le parcours s'arrête : tout ce qui suit est
 *     nécessairement plus ancien.
 *  3. Uniquement à PARTIR de ce point d'arrêt (jamais un second passage
 *     sur les mêmes entrées déjà couvertes par le palier hebdomadaire),
 *     une seule sauvegarde par mois distinct est conservée, jusqu'à K
 *     (12) mois distincts ("mensuel").
 *  4. Tout le reste est éligible à suppression par l'appelant.
 *
 * Découpage semaine/mois volontairement simple (UTC, jours depuis le
 * 1er janvier / année-mois) — suffisant pour du regroupement de
 * rotation technique, jamais présenté comme une numérotation ISO 8601
 * stricte des semaines.
 */

export interface EntreeRotation {
  chemin: string;
  createdAt: string;
}

export interface PolitiqueRotation {
  quotidien: number;
  hebdomadaire: number;
  mensuel: number;
}

export const POLITIQUE_ROTATION_PAR_DEFAUT: PolitiqueRotation = {
  quotidien: 14,
  hebdomadaire: 8,
  mensuel: 12,
};

function cleSemaine(date: Date): string {
  const debutAnnee = Date.UTC(date.getUTCFullYear(), 0, 1);
  const joursEcoules = Math.floor((date.getTime() - debutAnnee) / 86_400_000);
  const semaine = Math.floor(joursEcoules / 7);
  return `${date.getUTCFullYear()}-S${semaine}`;
}

function cleMois(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Renvoie l'ensemble des chemins à CONSERVER — tout chemin absent de ce résultat est éligible à suppression. */
export function calculerSauvegardesAConserver(
  entrees: EntreeRotation[],
  politique: PolitiqueRotation = POLITIQUE_ROTATION_PAR_DEFAUT
): Set<string> {
  // Toujours retriées ici, jamais supposées déjà triées par l'appelant.
  const triees = [...entrees].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const conserves = new Set<string>();

  const quotidiennes = triees.slice(0, politique.quotidien);
  for (const e of quotidiennes) conserves.add(e.chemin);

  const resteApresQuotidien = triees.slice(politique.quotidien);

  const semainesGardees = new Set<string>();
  let indexArretHebdo = resteApresQuotidien.length;
  for (let i = 0; i < resteApresQuotidien.length; i++) {
    const e = resteApresQuotidien[i]!;
    const cle = cleSemaine(new Date(e.createdAt));
    if (semainesGardees.has(cle)) continue;
    if (semainesGardees.size >= politique.hebdomadaire) {
      indexArretHebdo = i;
      break;
    }
    semainesGardees.add(cle);
    conserves.add(e.chemin);
  }

  const resteApresHebdo = resteApresQuotidien.slice(indexArretHebdo);
  const moisGardes = new Set<string>();
  for (const e of resteApresHebdo) {
    const cle = cleMois(new Date(e.createdAt));
    if (moisGardes.has(cle)) continue;
    if (moisGardes.size >= politique.mensuel) break;
    moisGardes.add(cle);
    conserves.add(e.chemin);
  }

  return conserves;
}
