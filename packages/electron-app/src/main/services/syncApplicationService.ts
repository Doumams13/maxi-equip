import type { FactureRepository } from "../repositories/factureRepository.js";
import type { MouvementRepository } from "../repositories/mouvementRepository.js";

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
 */
export class SyncApplicationService {
  constructor(
    private readonly factureRepository: FactureRepository,
    private readonly mouvementRepository: MouvementRepository
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
    };
    // Payload antérieur à la Phase 3 (emplacementId absent) : jamais
    // applicable, jamais bloquant non plus (évite une boucle de
    // rattrapage infinie sur une opération qu'aucune future tentative
    // ne pourra jamais résoudre).
    if (!p.emplacementId) return true;
    return this.factureRepository.creerDepuisServeur({
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
    };
    return this.mouvementRepository.creerDepuisServeur({
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
  }
}
