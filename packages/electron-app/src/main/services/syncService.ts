import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { SyncRepository } from "../repositories/syncRepository.js";
import { getConfigurationSync } from "./syncConfig.js";
import type { ImageService } from "./imageService.js";

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

/**
 * Correction "synchronisation bloquée après plusieurs tâches" (2026-10-12) —
 * sans timeout, une requête `fetch` qui ne reçoit jamais de réponse (connexion
 * qui reste ouverte sans répondre) ne résout ni ne rejette jamais sa promesse.
 * Le `finally` qui libère `synchronisationEnCours` n'est alors jamais atteint,
 * et toute tentative suivante échoue avec "Une synchronisation est déjà en
 * cours" jusqu'au redémarrage complet de l'application.
 */
const DELAI_MAX_REQUETE_MS = 20_000;
const DELAI_MAX_REQUETE_IMAGE_MS = 45_000;

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

  /**
   * Correction "photos de carreaux absentes sur poste restauré/secondaire"
   * (2026-10-24) — réglé via un SETTER plutôt qu'un paramètre de
   * constructeur : `ImageService` a besoin de la fenêtre principale
   * (`BrowserWindow`), construite APRÈS `SyncService` dans `main/index.ts`
   * (ordre inchangé, jamais réorganisé pour ce seul besoin). Optionnel —
   * un `SyncService` sans image défini (ex. tests existants) synchronise
   * exactement comme avant, simplement sans rattrapage d'images.
   */
  private imageService?: ImageService;

  definirImageService(imageService: ImageService): void {
    this.imageService = imageService;
  }

  /**
   * Correction "vente sur un poste annexe non répercutée sur le PC Shop
   * après 10+ minutes" (2026-10-27) — même raisonnement que le setter
   * d'images ci-dessus (optionnel, réglé via SETTER plutôt qu'un
   * paramètre de constructeur pour ne pas perturber l'ordre de
   * construction de main/index.ts ni les tests existants qui
   * construisent `SyncService` avec 3 arguments).
   *
   * Types structurels minimaux (jamais `StockRepository`/
   * `ValidationStockDistanteService` importés ici) — ce fichier reste
   * testable sans aucun runtime Electron, convention de ce projet (voir
   * syncService.test.ts : `vi.mock("electron")` n'est jamais utilisé).
   */
  private rattrapageStock?: {
    stockRepository: { appliquerValeursAbsolues(lignes: { produitId: string; emplacementId: string; quantite: number }[]): void };
    validationStockDistanteService: {
      recupererStockCentral(): Promise<
        { success: true; lignes: { produitId: string; emplacementId: string; quantite: number }[] } | { success: false; message: string }
      >;
    };
  };

  definirRattrapageStock(
    stockRepository: { appliquerValeursAbsolues(lignes: { produitId: string; emplacementId: string; quantite: number }[]): void },
    validationStockDistanteService: {
      recupererStockCentral(): Promise<
        { success: true; lignes: { produitId: string; emplacementId: string; quantite: number }[] } | { success: false; message: string }
      >;
    }
  ): void {
    this.rattrapageStock = { stockRepository, validationStockDistanteService };
  }

  /**
   * Correction "visibilité croisée Factures/Historique entre postes"
   * (2026-10-27), Phase 0a — même raisonnement/même forme que les deux
   * setters ci-dessus (optionnel, types structurels minimaux, jamais
   * `EmplacementRepository`/`EmplacementSyncService` importés ici).
   * Préalable bloquant aux phases suivantes : sans id de dépôt partagé
   * entre postes, rien de ce qui en dépend ne peut fonctionner.
   */
  private rattrapageEmplacements?: {
    emplacementRepository: {
      creerDepuisServeur(emplacement: { id: string; nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean; actif: boolean }): void;
    };
    emplacementSyncService: {
      recupererEmplacementsActifs(): Promise<
        | { success: true; emplacements: { id: string; nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean; actif: boolean }[] }
        | { success: false; message: string }
      >;
    };
  };

  definirRattrapageEmplacements(
    emplacementRepository: {
      creerDepuisServeur(emplacement: { id: string; nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean; actif: boolean }): void;
    },
    emplacementSyncService: {
      recupererEmplacementsActifs(): Promise<
        | { success: true; emplacements: { id: string; nom: string; type: "shop" | "depot"; ville: string; estPointDeVente: boolean; actif: boolean }[] }
        | { success: false; message: string }
      >;
    }
  ): void {
    this.rattrapageEmplacements = { emplacementRepository, emplacementSyncService };
  }

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

      if (this.imageService) {
        try {
          await this.imageService.synchroniserImagesManquantes(config.apiUrl, config.jwt);
        } catch (err) {
          // Jamais faire échouer la synchronisation métier (déjà réussie à ce stade) pour un rattrapage de photos — retenté au prochain cycle.
          // eslint-disable-next-line no-console
          console.error("[sync] rattrapage des images manquantes impossible :", err instanceof Error ? err.message : err);
        }
      }

      if (this.rattrapageEmplacements) {
        try {
          const resultat = await this.rattrapageEmplacements.emplacementSyncService.recupererEmplacementsActifs();
          if (resultat.success) {
            for (const e of resultat.emplacements) this.rattrapageEmplacements.emplacementRepository.creerDepuisServeur(e);
          }
        } catch (err) {
          // Même principe que les rattrapages ci-dessus — jamais faire échouer la synchronisation pour ça, retenté au prochain cycle.
          // eslint-disable-next-line no-console
          console.error("[sync] rattrapage des dépôts impossible :", err instanceof Error ? err.message : err);
        }
      }

      if (this.rattrapageStock) {
        try {
          const resultat = await this.rattrapageStock.validationStockDistanteService.recupererStockCentral();
          if (resultat.success) {
            this.rattrapageStock.stockRepository.appliquerValeursAbsolues(resultat.lignes);
          }
        } catch (err) {
          // Même principe que le rattrapage d'images ci-dessus — jamais faire échouer la synchronisation pour ça, retenté au prochain cycle.
          // eslint-disable-next-line no-console
          console.error("[sync] rattrapage du stock partagé impossible :", err instanceof Error ? err.message : err);
        }
      }

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
    const toutesLesEntrees = this.boiteEnvoiRepository.listerPretesPourEnvoi();
    if (toutesLesEntrees.length === 0) {
      return { success: true, push: { envoyees: 0, confirmees: 0 } };
    }

    // Correction "Intégration Site Phase 5, Partie 2 (pipeline
    // catalogue)" — les images suivent un chemin SÉPARÉ
    // (POST /v1/app/images/sync, une requête par image : un fichier réel
    // dépasse largement la limite générique appliquée au lot JSON
    // /v1/sync/push, voir validationSync.ts). Tous les autres types
    // (vente/annulation/entree/sortie/transfert/parametres_entreprise/
    // promotion/modele/produit) continuent d'emprunter EXACTEMENT le
    // même lot groupé qu'avant — comportement inchangé.
    const aEnvoyer = toutesLesEntrees.filter((e) => e.entityType !== "image_produit");
    const imagesAEnvoyer = toutesLesEntrees.filter((e) => e.entityType === "image_produit");

    let confirmees = 0;
    let envoyees = 0;

    if (aEnvoyer.length > 0) {
      const resultatLot = await this.pousserLotGenerique(apiUrl, jwt, aEnvoyer);
      if (!resultatLot.success) return resultatLot;
      confirmees += resultatLot.confirmees;
      envoyees += aEnvoyer.length;
    }

    if (imagesAEnvoyer.length > 0) {
      const resultatImages = await this.pousserImages(apiUrl, jwt, imagesAEnvoyer);
      confirmees += resultatImages.confirmees;
      envoyees += imagesAEnvoyer.length;
    }

    return { success: true, push: { envoyees, confirmees } };
  }

  private async pousserLotGenerique(
    apiUrl: string,
    jwt: string,
    aEnvoyer: ReturnType<BoiteEnvoiRepository["listerPretesPourEnvoi"]>
  ): Promise<ResultatSynchronisation & { confirmees: number }> {
    let reponse: Response;
    try {
      reponse = await fetch(`${apiUrl}/v1/sync/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          operations: aEnvoyer.map((e) => ({ entityType: e.entityType, entityId: e.entityId, payload: JSON.parse(e.payloadJson) })),
        }),
        signal: AbortSignal.timeout(DELAI_MAX_REQUETE_MS),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, etape: "push", message: `Impossible de contacter le serveur de synchronisation : ${message}`, confirmees: 0 };
    }

    if (reponse.status === 401 || reponse.status === 403) {
      return { success: false, etape: "push", message: "Authentification refusée par le serveur (jeton invalide ou expiré).", confirmees: 0 };
    }
    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => "");
      for (const entree of aEnvoyer) {
        this.boiteEnvoiRepository.enregistrerErreur(entree.id, `Réponse serveur ${reponse.status} : ${texte.slice(0, 500)}`);
      }
      return { success: false, etape: "push", message: `Le serveur a refusé la synchronisation (HTTP ${reponse.status}).`, confirmees: 0 };
    }

    let corps: ReponsePush;
    try {
      corps = (await reponse.json()) as ReponsePush;
    } catch {
      for (const entree of aEnvoyer) {
        this.boiteEnvoiRepository.enregistrerErreur(entree.id, "Réponse serveur illisible (JSON invalide).");
      }
      return { success: false, etape: "push", message: "Réponse du serveur invalide.", confirmees: 0 };
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

    return { success: true, confirmees };
  }

  /**
   * Envoie chaque image individuellement — jamais en lot (voir
   * commentaire d'`effectuerPush`). Une image en échec (réseau, refus
   * serveur) ne bloque JAMAIS les autres : chaque entrée est indépendante,
   * comme le reste de la boîte d'envoi (Partie 17 : ne jamais casser
   * PUSH/PULL/idempotence pour une seule entrée fautive).
   */
  private async pousserImages(
    apiUrl: string,
    jwt: string,
    images: ReturnType<BoiteEnvoiRepository["listerPretesPourEnvoi"]>
  ): Promise<{ confirmees: number }> {
    let confirmees = 0;
    for (const entree of images) {
      try {
        const reponse = await fetch(`${apiUrl}/v1/app/images/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: entree.payloadJson,
          signal: AbortSignal.timeout(DELAI_MAX_REQUETE_IMAGE_MS),
        });
        if (!reponse.ok) {
          const texte = await reponse.text().catch(() => "");
          this.boiteEnvoiRepository.enregistrerErreur(entree.id, `Réponse serveur ${reponse.status} : ${texte.slice(0, 500)}`);
          continue;
        }
        this.boiteEnvoiRepository.mettreAJourStatut(entree.id, "confirmed");
        confirmees++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
        this.boiteEnvoiRepository.enregistrerErreur(entree.id, `Impossible de contacter le serveur pour cette image : ${message}`);
      }
    }
    return { confirmees };
  }

  private async effectuerPull(apiUrl: string, jwt: string): Promise<ResultatSynchronisation> {
    let curseur = this.syncRepository.getDernierCurseur();
    let totalRecues = 0;

    // Pagination : le serveur peut tronquer sa réponse (hasMore: true).
    // On continue de paginer jusqu'à ce que hasMore soit false ou absent.
    do {
      let reponse: Response;
      try {
        reponse = await fetch(`${apiUrl}/v1/sync/pull?since=${curseur}`, {
          headers: { Authorization: `Bearer ${jwt}` },
          signal: AbortSignal.timeout(DELAI_MAX_REQUETE_MS),
        });
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

      if (!corps.hasMore) break; // eslint-disable-line no-constant-condition
    } while (true); // eslint-disable-line no-constant-condition

    return { success: true, pull: { recues: totalRecues } };
  }
}
