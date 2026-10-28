import type { FactureRepository } from "../repositories/factureRepository.js";
import type { MouvementRepository } from "../repositories/mouvementRepository.js";
import type { NotificationRepository } from "../repositories/notificationRepository.js";
import type { ProduitRepository } from "../repositories/produitRepository.js";
import type { EmplacementRepository } from "../repositories/emplacementRepository.js";

/**
 * Applique réellement aux données métier locales les opérations
 * vente/annulation/entree/sortie/transfert reçues d'un autre poste —
 * correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27), Phase 4. Jusqu'ici ces types étaient journalisés
 * (sync_recu) mais jamais appliqués — seul "demande" l'était (voir
 * SyncService.effectuerPull).
 *
 * Un seul point d'entrée (`appliquer`), dispatché par `entityType` —
 * jamais une logique dupliquée entre le traitement "à chaud" (PULL) et
 * le balayage de rattrapage (voir SyncService), qui appellent tous les
 * deux cette MÊME méthode. Chaque branche est indépendamment
 * idempotente et tolérante à une clé étrangère pas encore résolvable
 * localement (voir les `creerDepuisServeur`/`appliquerAnnulationDepuisServeur`
 * correspondants) — jamais une exception qui remonterait jusqu'à
 * l'appelant.
 *
 * Système multiposte fiable (2026-10-28), Phase E — `notifications`
 * OPTIONNEL (jamais un site d'appel existant cassé, dont les tests qui
 * construisent ce service avec 2 arguments) : quand fourni, une
 * notification est créée pour vente/entree/sortie/transfert, mais
 * UNIQUEMENT la première fois qu'une opération passe réellement de
 * "absente localement" à "appliquée" — jamais sur un rattrapage qui
 * re-confirme une opération déjà appliquée (retry/balayage), jamais
 * avant une application réussie. "annulation" ne génère jamais de
 * notification (hors périmètre de cette correction, jamais demandé).
 */
export interface DependancesNotificationOrigine {
  notificationRepository: NotificationRepository;
  produitRepository: ProduitRepository;
  emplacementRepository: EmplacementRepository;
}

export class SyncApplicationService {
  constructor(
    private readonly factureRepository: FactureRepository,
    private readonly mouvementRepository: MouvementRepository,
    private readonly notifications?: DependancesNotificationOrigine
  ) {}

  /** `true` = traitée avec succès (appliquée maintenant, ou déjà dans l'état visé) — `false` = pas encore possible, à retenter au prochain cycle. */
  appliquer(entityType: "vente" | "annulation" | "entree" | "sortie" | "transfert", payload: unknown): boolean {
    switch (entityType) {
      case "vente":
        return this.appliquerVente(payload);
      case "annulation":
        return this.appliquerAnnulation(payload);
      case "entree":
      case "sortie":
      case "transfert":
        return this.appliquerMouvement(entityType, payload);
    }
  }

  private appliquerVente(payload: unknown): boolean {
    const p = payload as {
      factureId: string;
      numero: string;
      date: string;
      emplacementId: string;
      clientNom: string;
      clientTelephone: string | null;
      clientAdresse: string | null;
      vendeurUtilisateurId: string;
      vendeurNomManuel: string | null;
      modeReglement: string | null;
      total: number;
      remise: number;
      statutPaiement: "reservation" | "payee";
      montantPaye: number;
      lignes: Parameters<FactureRepository["creerDepuisServeur"]>[0]["lignes"];
      identiteSnapshot: Parameters<FactureRepository["creerDepuisServeur"]>[0]["identiteSnapshot"];
      /** Système multiposte fiable (2026-10-28) — tamponné par le serveur (voir routes/v1/app/sync/push.ts côté API), jamais déclaré par le client d'origine. */
      posteId?: string | null;
    };
    // Payload antérieur à la Phase 3 (emplacementId absent) : jamais
    // applicable, jamais bloquant non plus (évite une boucle de
    // rattrapage infinie sur une opération qu'aucune future tentative
    // ne pourra jamais résoudre).
    if (!p.emplacementId) return true;

    // Système multiposte fiable (2026-10-28) — connu AVANT l'upsert
    // idempotent ci-dessous (qui renvoie `true` aussi bien à la création
    // qu'à un rattrapage no-op) : seul ce test distingue une réelle
    // nouvelle application d'une simple reconfirmation.
    const estNouvelle = this.factureRepository.findById(p.factureId) === null;

    const applique = this.factureRepository.creerDepuisServeur({
      id: p.factureId,
      numero: p.numero,
      date: p.date,
      emplacementId: p.emplacementId,
      clientNom: p.clientNom,
      clientTelephone: p.clientTelephone,
      clientAdresse: p.clientAdresse,
      vendeurUtilisateurId: p.vendeurUtilisateurId,
      vendeurNomManuel: p.vendeurNomManuel,
      modeReglement: p.modeReglement,
      lignes: p.lignes,
      total: p.total,
      remise: p.remise,
      statutPaiement: p.statutPaiement,
      montantPaye: p.montantPaye,
      identiteSnapshot: p.identiteSnapshot,
    });

    if (applique && estNouvelle) this.notifierVente(p);
    return applique;
  }

  private notifierVente(p: { factureId: string; numero: string; lignes: { motif: string; taille: string; quantite: number }[]; posteId?: string | null }): void {
    if (!this.notifications) return;
    const items = p.lignes.length > 0 ? p.lignes.map((l) => `${l.quantite}× ${l.motif} (${l.taille})`).join(", ") : "aucun article";
    this.notifications.notificationRepository.creer("vente", "Nouvelle vente", `Facture ${p.numero} — ${items}`, null, {
      entityType: "vente",
      entityId: p.factureId,
      posteId: p.posteId ?? null,
    });
  }

  private appliquerAnnulation(payload: unknown): boolean {
    const p = payload as { factureId: string; motifAnnulation: string; annuleeLe: string; annuleePar: string };
    return this.factureRepository.appliquerAnnulationDepuisServeur({
      factureId: p.factureId,
      motif: p.motifAnnulation,
      annuleeLe: p.annuleeLe,
      annuleePar: p.annuleePar,
    }).traitee;
  }

  private appliquerMouvement(type: "entree" | "sortie" | "transfert", payload: unknown): boolean {
    const p = payload as {
      mouvementId: string;
      produitId: string;
      emplacementId?: string;
      emplacementSourceId?: string;
      emplacementDestinationId?: string;
      quantite: number;
      date: string;
      utilisateurId: string | null;
      /** Système multiposte fiable (2026-10-28) — voir appliquerVente ci-dessus. */
      posteId?: string | null;
    };

    const estNouveau = this.mouvementRepository.findById(p.mouvementId) === null;

    const applique = this.mouvementRepository.creerDepuisServeur({
      id: p.mouvementId,
      type,
      produitId: p.produitId,
      emplacementId: p.emplacementId ?? null,
      emplacementSourceId: p.emplacementSourceId ?? null,
      emplacementDestinationId: p.emplacementDestinationId ?? null,
      quantite: p.quantite,
      date: p.date,
      utilisateurId: p.utilisateurId,
    });

    if (applique && estNouveau) this.notifierMouvement(type, p);
    return applique;
  }

  private notifierMouvement(
    type: "entree" | "sortie" | "transfert",
    p: {
      mouvementId: string;
      produitId: string;
      emplacementId?: string;
      emplacementSourceId?: string;
      emplacementDestinationId?: string;
      quantite: number;
      posteId?: string | null;
    }
  ): void {
    if (!this.notifications) return;
    const produit = this.notifications.produitRepository.findById(p.produitId);
    const libelleProduit = produit ? `${produit.motif} (${produit.taille})` : "un produit";

    let titre: string;
    let message: string;
    if (type === "entree") {
      const depot = p.emplacementId ? this.notifications.emplacementRepository.findById(p.emplacementId) : null;
      titre = "Nouvelle entrée de stock";
      message = `+${p.quantite} ${libelleProduit} — ${depot?.nom ?? "dépôt inconnu"}`;
    } else if (type === "sortie") {
      const depot = p.emplacementId ? this.notifications.emplacementRepository.findById(p.emplacementId) : null;
      titre = "Nouvelle sortie de stock";
      message = `-${p.quantite} ${libelleProduit} — ${depot?.nom ?? "dépôt inconnu"}`;
    } else {
      const source = p.emplacementSourceId ? this.notifications.emplacementRepository.findById(p.emplacementSourceId) : null;
      const destination = p.emplacementDestinationId ? this.notifications.emplacementRepository.findById(p.emplacementDestinationId) : null;
      titre = "Nouveau transfert de stock";
      message = `${p.quantite} ${libelleProduit} — ${source?.nom ?? "dépôt inconnu"} → ${destination?.nom ?? "dépôt inconnu"}`;
    }

    this.notifications.notificationRepository.creer(type, titre, message, null, {
      entityType: type,
      entityId: p.mouvementId,
      posteId: p.posteId ?? null,
    });
  }
}
