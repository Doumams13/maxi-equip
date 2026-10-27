import { stock as domainStock } from "@maxi-equip/domain";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { ValidationStockDistanteService, erreurDepuisEchecValidationDistante, compenserApresEchecLocal } from "./validationStockDistanteService.js";

export class StockValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockValidationError";
  }
}

/**
 * Orchestration des opérations de stock — la RÈGLE elle-même (delta,
 * vérification de disponibilité) vient exclusivement de packages/domain
 * (§19 du prompt Phase 2). Ce service ne fait qu'assembler : domaine →
 * dépôt de données → historique.
 *
 * Phase 3.3 : chaque opération est désormais enveloppée dans une
 * transaction explicite (`db.transaction`) — elle n'existait pas avant
 * cette correction (chaque appel de dépôt s'exécutait comme sa propre
 * instruction auto-validée). Ce n'est pas un changement de comportement
 * métier : simplement la garantie que l'écriture du mouvement/stock ET
 * l'ajout dans la boîte d'envoi réussissent ou échouent ensemble,
 * jamais l'un sans l'autre (§6 de la correction).
 */
export class StockService {
  constructor(
    private readonly db: import("better-sqlite3-multiple-ciphers").Database,
    private readonly stockRepository: StockRepository,
    private readonly mouvementRepository: MouvementRepository,
    private readonly boiteEnvoiRepository: BoiteEnvoiRepository,
    /**
     * Correction "travailler en parallèle sur le même stock" (2026-10-22) —
     * OPTIONNEL pour ne jamais casser un site d'appel existant (tests) qui
     * construirait ce service sans lui : absent ou non configuré (voir
     * `estConfiguree()`), le comportement reste 100% local et inchangé.
     * Présent ET configuré, AUCUNE des trois méthodes ci-dessous ne décide
     * plus de la disponibilité à partir du stock local (décision
     * utilisateur explicite) — seul le serveur central tranche.
     */
    private readonly validationStockDistanteService?: ValidationStockDistanteService
  ) {}

  async enregistrerEntree(produitId: string, emplacementId: string, quantite: number, utilisateurId: string): Promise<void> {
    if (!Number.isFinite(quantite) || quantite <= 0) {
      throw new domainStock.InvalidQuantityError(`La quantité d'entrée doit être un nombre strictement positif (reçu : ${quantite}).`);
    }

    let stockApresServeur: { produitId: string; emplacementId: string; quantite: number }[] | null = null;
    // Correction "vente décrémentée sans facture générée" (2026-10-27) —
    // conservé pour pouvoir compenser (voir compenserApresEchecLocal) si
    // la transaction locale plus bas échoue APRÈS ce commit serveur.
    const deltasValidesEnLigne: { produitId: string; emplacementId: string; delta: number }[] = [];
    if (this.validationStockDistanteService?.estConfiguree()) {
      const deltas = [{ produitId, emplacementId, delta: quantite }];
      const resultat = await this.validationStockDistanteService.valider(deltas);
      if (!resultat.success) throw erreurDepuisEchecValidationDistante(resultat);
      stockApresServeur = resultat.stockApres;
      deltasValidesEnLigne.push(...deltas);
    }

    const executer = this.db.transaction(() => {
      if (stockApresServeur) {
        for (const s of stockApresServeur) this.stockRepository.setQuantite(s.produitId, s.emplacementId, s.quantite);
      } else {
        const delta = domainStock.applyEntree(emplacementId, quantite);
        this.stockRepository.applyDelta({ ...delta, produitId });
      }
      const date = new Date().toISOString();
      const mouvementId = this.mouvementRepository.create({
        type: "entree",
        produitId,
        emplacementId,
        emplacementSourceId: null,
        emplacementDestinationId: null,
        quantite,
        date,
        factureId: null,
        utilisateurId,
        note: null,
      });
      this.boiteEnvoiRepository.creer("entree", mouvementId, { mouvementId, produitId, emplacementId, quantite, date, utilisateurId });
    });
    try {
      executer();
    } catch (err) {
      if (this.validationStockDistanteService) {
        await compenserApresEchecLocal(this.validationStockDistanteService, deltasValidesEnLigne);
      }
      throw err;
    }
  }

  async enregistrerSortie(produitId: string, emplacementId: string, quantite: number, utilisateurId: string): Promise<void> {
    if (!Number.isFinite(quantite) || quantite <= 0) {
      throw new domainStock.InvalidQuantityError(`La quantité de sortie doit être un nombre strictement positif (reçu : ${quantite}).`);
    }

    let stockApresServeur: { produitId: string; emplacementId: string; quantite: number }[] | null = null;
    // Correction "vente décrémentée sans facture générée" (2026-10-27) —
    // voir enregistrerEntree ci-dessus pour le raisonnement complet.
    const deltasValidesEnLigne: { produitId: string; emplacementId: string; delta: number }[] = [];
    if (this.validationStockDistanteService?.estConfiguree()) {
      const deltas = [{ produitId, emplacementId, delta: -quantite }];
      const resultat = await this.validationStockDistanteService.valider(deltas);
      if (!resultat.success) throw erreurDepuisEchecValidationDistante(resultat);
      stockApresServeur = resultat.stockApres;
      deltasValidesEnLigne.push(...deltas);
    }

    const executer = this.db.transaction(() => {
      if (stockApresServeur) {
        for (const s of stockApresServeur) this.stockRepository.setQuantite(s.produitId, s.emplacementId, s.quantite);
      } else {
        const disponible = this.stockRepository.getQuantite(produitId, emplacementId);
        const delta = domainStock.applySortie(emplacementId, disponible, quantite);
        this.stockRepository.applyDelta({ ...delta, produitId });
      }
      const date = new Date().toISOString();
      const mouvementId = this.mouvementRepository.create({
        type: "sortie",
        produitId,
        emplacementId,
        emplacementSourceId: null,
        emplacementDestinationId: null,
        quantite,
        date,
        factureId: null,
        utilisateurId,
        note: null,
      });
      this.boiteEnvoiRepository.creer("sortie", mouvementId, { mouvementId, produitId, emplacementId, quantite, date, utilisateurId });
    });
    try {
      executer();
    } catch (err) {
      if (this.validationStockDistanteService) {
        await compenserApresEchecLocal(this.validationStockDistanteService, deltasValidesEnLigne);
      }
      throw err;
    }
  }

  async enregistrerTransfert(produitId: string, sourceId: string, destinationId: string, quantite: number, utilisateurId: string): Promise<void> {
    if (!Number.isFinite(quantite) || quantite <= 0) {
      throw new domainStock.InvalidQuantityError(`La quantité de transfert doit être un nombre strictement positif (reçu : ${quantite}).`);
    }
    if (sourceId === destinationId) {
      throw new domainStock.InvalidQuantityError("L'emplacement source et l'emplacement destination doivent être différents.");
    }

    let stockApresServeur: { produitId: string; emplacementId: string; quantite: number }[] | null = null;
    // Correction "vente décrémentée sans facture générée" (2026-10-27) —
    // voir enregistrerEntree ci-dessus pour le raisonnement complet.
    const deltasValidesEnLigne: { produitId: string; emplacementId: string; delta: number }[] = [];
    if (this.validationStockDistanteService?.estConfiguree()) {
      const deltas = [
        { produitId, emplacementId: sourceId, delta: -quantite },
        { produitId, emplacementId: destinationId, delta: quantite },
      ];
      const resultat = await this.validationStockDistanteService.valider(deltas);
      if (!resultat.success) throw erreurDepuisEchecValidationDistante(resultat);
      stockApresServeur = resultat.stockApres;
      deltasValidesEnLigne.push(...deltas);
    }

    const executer = this.db.transaction(() => {
      if (stockApresServeur) {
        for (const s of stockApresServeur) this.stockRepository.setQuantite(s.produitId, s.emplacementId, s.quantite);
      } else {
        const disponible = this.stockRepository.getQuantite(produitId, sourceId);
        const [deltaSource, deltaDestination] = domainStock.applyTransfert(sourceId, destinationId, disponible, quantite);
        this.stockRepository.applyDelta({ ...deltaSource, produitId });
        this.stockRepository.applyDelta({ ...deltaDestination, produitId });
      }
      const date = new Date().toISOString();
      const mouvementId = this.mouvementRepository.create({
        type: "transfert",
        produitId,
        emplacementId: null,
        emplacementSourceId: sourceId,
        emplacementDestinationId: destinationId,
        quantite,
        date,
        factureId: null,
        utilisateurId,
        note: null,
      });
      this.boiteEnvoiRepository.creer("transfert", mouvementId, {
        mouvementId,
        produitId,
        emplacementSourceId: sourceId,
        emplacementDestinationId: destinationId,
        quantite,
        date,
        utilisateurId,
      });
    });
    try {
      executer();
    } catch (err) {
      if (this.validationStockDistanteService) {
        await compenserApresEchecLocal(this.validationStockDistanteService, deltasValidesEnLigne);
      }
      throw err;
    }
  }

  /**
   * Annule une entrée/sortie manuelle saisie par erreur — correction
   * "corriger une erreur de saisie de stock sans fausser le tableau de
   * bord". Remet le stock exactement comme avant ce mouvement, puis
   * l'annote (jamais supprimé — reste visible dans l'Historique avec son
   * motif, voir MouvementRepository.annuler).
   *
   * VOLONTAIREMENT LIMITÉ aux mouvements "entree"/"sortie" SANS facture
   * (réassort/retrait manuel) — jamais une sortie liée à une vente : ce
   * cas se corrige exclusivement via `VenteService.annulerVente` (un seul
   * mécanisme d'annulation par type d'origine, jamais deux qui se
   * chevauchent sur la même ligne).
   *
   * LIMITÉ DANS LE TEMPS (correction explicite de l'utilisateur) : au-delà
   * de `domainStock.DELAI_ANNULATION_MOUVEMENT_MS` (48h), le mouvement
   * n'est plus annulable ici — voir domain/stock/index.ts pour la valeur
   * partagée avec l'écran (bouton masqué après ce délai).
   */
  annulerMouvement(mouvementId: string, annulePar: string, motif: string): void {
    if (!motif || motif.trim().length === 0) {
      throw new StockValidationError("Un motif d'annulation est requis.");
    }
    const executer = this.db.transaction(() => {
      const mouvement = this.mouvementRepository.findById(mouvementId);
      if (!mouvement) {
        throw new StockValidationError("Mouvement introuvable.");
      }
      if (mouvement.factureId) {
        throw new StockValidationError("Ce mouvement est lié à une vente — annulez la facture correspondante plutôt que ce mouvement.");
      }
      if (mouvement.annuleLe) {
        throw new StockValidationError("Ce mouvement est déjà annulé.");
      }
      if (mouvement.type !== "entree" && mouvement.type !== "sortie") {
        throw new StockValidationError("Seules les entrées et sorties manuelles peuvent être annulées.");
      }
      if (!domainStock.peutEncoreAnnulerMouvement(mouvement.date)) {
        throw new StockValidationError("Ce mouvement date de plus de 48 heures — il ne peut plus être annulé. Faites une entrée/sortie corrective à la place.");
      }
      const emplacementId = mouvement.emplacementId!; // garanti par assertCoherentMouvement pour entree/sortie manuelle.
      const delta =
        mouvement.type === "entree"
          ? domainStock.applySortie(emplacementId, this.stockRepository.getQuantite(mouvement.produitId, emplacementId), mouvement.quantite)
          : domainStock.applyEntree(emplacementId, mouvement.quantite);
      this.stockRepository.applyDelta({ ...delta, produitId: mouvement.produitId });
      this.mouvementRepository.annuler(mouvementId, annulePar, motif.trim());
    });
    executer();
  }

  /**
   * Écoule tout le stock restant d'un produit avant sa suppression du
   * catalogue — correction "produit interdit à la vente supprimé avec du
   * stock restant". Crée une VRAIE sortie traçable par dépôt concerné,
   * comptée normalement dans "Total sorties" (contrairement à
   * `annulerMouvement` ci-dessus : ce stock part réellement du dépôt, ce
   * n'est jamais du bruit à exclure). Sans ça, le stock restait fantôme
   * en base pour toujours — le produit disparaît de tous les
   * sélecteurs, donc plus aucun écran ne permettrait de le corriger après
   * coup.
   */
  ecoulerStockPourSuppression(produitId: string, utilisateurId: string): void {
    const executer = this.db.transaction(() => {
      const lignes = this.stockRepository.listByProduit(produitId);
      for (const ligne of lignes) {
        if (ligne.quantite <= 0) continue;
        const delta = domainStock.applySortie(ligne.emplacementId, ligne.quantite, ligne.quantite);
        this.stockRepository.applyDelta({ ...delta, produitId });
        const date = new Date().toISOString();
        const mouvementId = this.mouvementRepository.create({
          type: "sortie",
          produitId,
          emplacementId: ligne.emplacementId,
          emplacementSourceId: null,
          emplacementDestinationId: null,
          quantite: ligne.quantite,
          date,
          factureId: null,
          utilisateurId,
          note: "Produit retiré du catalogue — stock écoulé automatiquement avant suppression.",
        });
        this.boiteEnvoiRepository.creer("sortie", mouvementId, {
          mouvementId,
          produitId,
          emplacementId: ligne.emplacementId,
          quantite: ligne.quantite,
          date,
          utilisateurId,
        });
      }
    });
    executer();
  }
}
