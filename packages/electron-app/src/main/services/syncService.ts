import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "../repositories/syncRepository.js";
import { getConfigurationSync } from "./syncConfig.js";

/**
 * Moteur de synchronisation — Phase 3.7. Indépendant de l'interface
 * (Partie 2) : ne connaît ni IPC ni React, uniquement des dépôts locaux
 * et `fetch` natif (déjà disponible dans ce runtime Node/Electron —
 * aucune nouvelle dépendance réseau ajoutée).
 *
 * ORDRE STRICT (Partie 17), respecté exactement :
 *   1. Verrou → 2. Push → 3. Traitement confirmations → 4. Lecture
 *   curseur → 5. Pull → 6. Conservation technique → 7. Mise à jour
 *   curseur (6+7 atomiques, voir SyncRepository) → 8. Résultat →
 *   9. Libération verrou (toujours, même en cas d'erreur — try/finally).
 */

export interface ResultatSynchronisation {
  success: boolean;
  push?: { envoyees: number; confirmees: number };
  pull?: { recues: number };
  etape?: "configuration" | "push" | "pull";
  message?: string;
}

interface ReponsePush {
  results: { entityId: string; statut: "cree" | "deja_traite" }[];
}
interface ReponsePull {
  operations: { curseur: number; entityType: string; entityId: string; payload: unknown; recuLe: string }[];
  cursor: number;
  hasMore?: boolean;
}

export class SyncService {
  // Partie 3 : verrou d'instance — un seul SyncService est instancié
  // (main/index.ts), donc ce booléen protège réellement contre deux
  // appels IPC concurrents, jamais seulement une convention côté écran.
  private synchronisationEnCours = false;

  constructor(
    private readonly boiteEnvoiRepository: BoiteEnvoiRepository,
    private readonly syncRepository: SyncRepository,
    /**
     * Phase 4.1, Partie 4/17 : seul le type "demande" doit être
     * réellement appliqué aux données métier lors d'un PULL — tous les
     * autres types (vente/entree/transfert/annulation) restent
     * uniquement journalisés dans `sync_recu`, exactement comme depuis
     * la Phase 3.7, jamais modifié ici. Callback optionnel (jamais un
     * couplage direct à DemandeService, qui resterait alors indépendant
     * et testable seul) — une erreur de traitement d'UNE demande
     * n'interrompt jamais le reste du PULL (Partie 17 : ne pas casser
     * PUSH/PULL/idempotence).
     */
    private readonly traiterDemandeRecue?: (payload: unknown, sourceEntityId: string) => void
  ) {}

  async executerSynchronisation(): Promise<ResultatSynchronisation> {
    if (this.synchronisationEnCours) {
      return { success: false, etape: "push", message: "Une synchronisation est déjà en cours." };
    }
    this.synchronisationEnCours = true;

    try {
      const config = getConfigurationSync();
      if (!config.jwt) {
        return { success: false, etape: "configuration", message: "Aucun jeton de synchronisation configuré (MAXI_EQUIP_SYNC_JWT)." };
      }

      const resultatPush = await this.effectuerPush(config.apiUrl, config.jwt);
      if (!resultatPush.success) return resultatPush;

      const resultatPull = await this.effectuerPull(config.apiUrl, config.jwt);
      if (!resultatPull.success) return resultatPull;

      return { success: true, push: resultatPush.push, pull: resultatPull.pull };
    } finally {
      this.synchronisationEnCours = false;
    }
  }

  /** Expose l'état du verrou pour l'IPC (Partie 3 : protection également côté interface, jamais seulement dans le moteur). */
  estEnCours(): boolean {
    return this.synchronisationEnCours;
  }

  private async effectuerPush(apiUrl: string, jwt: string): Promise<ResultatSynchronisation> {
    const aEnvoyer = this.boiteEnvoiRepository.listerPretesPourEnvoi();
    if (aEnvoyer.length === 0) {
      return { success: true, push: { envoyees: 0, confirmees: 0 } };
    }

    let reponse: Response;
    try {
      reponse = await fetch(`${apiUrl}/v1/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          operations: aEnvoyer.map((e) => ({ entityType: e.entityType, entityId: e.entityId, payload: JSON.parse(e.payloadJson) })),
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, etape: "push", message: `Impossible de contacter le serveur de synchronisation : ${message}` };
    }

    if (reponse.status === 401 || reponse.status === 403) {
      return { success: false, etape: "push", message: "Authentification refusée par le serveur (jeton invalide ou expiré)." };
    }
    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => "");
      for (const entree of aEnvoyer) {
        this.boiteEnvoiRepository.enregistrerErreur(entree.id, `Réponse serveur ${reponse.status} : ${texte.slice(0, 500)}`);
      }
      return { success: false, etape: "push", message: `Le serveur a refusé la synchronisation (HTTP ${reponse.status}).` };
    }

    let corps: ReponsePush;
    try {
      corps = (await reponse.json()) as ReponsePush;
    } catch {
      for (const entree of aEnvoyer) {
        this.boiteEnvoiRepository.enregistrerErreur(entree.id, "Réponse serveur illisible (JSON invalide).");
      }
      return { success: false, etape: "push", message: "Réponse du serveur invalide." };
    }

    let confirmees = 0;
    const parEntite = new Map(corps.results.map((r) => [r.entityId, r.statut]));
    for (const entree of aEnvoyer) {
      const statut = parEntite.get(entree.entityId);
      if (statut === "cree" || statut === "deja_traite") {
        this.boiteEnvoiRepository.mettreAJourStatut(entree.id, "confirmed");
        confirmees++;
      } else {
        this.boiteEnvoiRepository.enregistrerErreur(entree.id, "Aucune confirmation reçue du serveur pour cette opération.");
      }
    }

    return { success: true, push: { envoyees: aEnvoyer.length, confirmees } };
  }

  private async effectuerPull(apiUrl: string, jwt: string): Promise<ResultatSynchronisation> {
    let curseur = this.syncRepository.getDernierCurseur();
    let totalRecues = 0;

    // Pagination : le serveur peut tronquer sa réponse (hasMore: true).
    // On continue de paginer jusqu'à ce que hasMore soit false ou absent.
    do {
      let reponse: Response;
      try {
        reponse = await fetch(`${apiUrl}/v1/sync/pull?since=${curseur}`, { headers: { Authorization: `Bearer ${jwt}` } });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
        return { success: false, etape: "pull", message: `Impossible de contacter le serveur pour le PULL : ${message}` };
      }

      if (reponse.status === 401 || reponse.status === 403) {
        return { success: false, etape: "pull", message: "Authentification refusée par le serveur lors du PULL." };
      }
      if (!reponse.ok) {
        return { success: false, etape: "pull", message: `Le serveur a refusé le PULL (HTTP ${reponse.status}).` };
      }

      let corps: ReponsePull;
      try {
        corps = (await reponse.json()) as ReponsePull;
        if (!Array.isArray(corps.operations)) throw new Error("format inattendu");
      } catch {
        return { success: false, etape: "pull", message: "Réponse du serveur invalide lors du PULL — aucune donnée locale modifiée." };
      }

      if (corps.operations.length > 0) {
        try {
          this.syncRepository.enregistrerOperationsRecues(
            corps.operations.map((o) => ({ entityType: o.entityType, entityId: o.entityId, payload: o.payload, curseurServeur: o.curseur }))
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erreur inconnue.";
          return { success: false, etape: "pull", message: `Échec de l'enregistrement technique des opérations reçues : ${message}` };
        }

        // Application réelle aux données métier — UNIQUEMENT pour "demande"
        // (Partie 4/17). Chaque échec individuel est isolé : une demande
        // dont le traitement échoue ne doit jamais bloquer le reste de la page.
        if (this.traiterDemandeRecue) {
          for (const operation of corps.operations) {
            if (operation.entityType !== "demande") continue;
            try {
              this.traiterDemandeRecue(operation.payload, operation.entityId);
            } catch {
              // Volontairement silencieux ici — la donnée reste disponible dans sync_recu, jamais perdue.
            }
          }
        }

        totalRecues += corps.operations.length;
        curseur = corps.cursor;
      }

      if (!corps.hasMore) break;
    } while (true);

    return { success: true, pull: { recues: totalRecues } };
  }
}
