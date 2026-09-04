import { stock as domainStock, invoicing as domainInvoicing, vendeur as domainVendeur } from "@maxi-equip/domain";
import type { LigneFacture, LigneReleveInterne } from "@maxi-equip/shared-types";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { ProduitRepository } from "../repositories/produitRepository.js";

export class VenteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VenteValidationError";
  }
}

export interface VenteLigneInput {
  produitId: string;
  quantite: number;
  prixUnitaire: number;
  /** Renseignés uniquement si la ligne nécessite un approvisionnement externe (déterminé par le stock réel, pas par le Renderer). */
  fournisseurExterne?: string;
  prixAchatExterne?: number;
}

export interface VenteInput {
  emplacementId: string; // toujours SHOP en pratique (§11 du prompt Phase 2)
  clientNom: string;
  clientTelephone: string | null;
  clientAdresse: string | null;
  vendeurUtilisateurId: string;
  vendeurCompteConnecteNom: string;
  vendeurNomManuel: string | null;
  lignes: VenteLigneInput[];
}

export interface VenteResult {
  factureId: string;
  numero: string;
  total: number;
}

/**
 * Orchestre une vente. AUCUNE règle métier n'est réimplémentée ici :
 * - la répartition interne/externe vient de domainStock.repartirVenteInterneExterne ;
 * - la fusion en une seule ligne facture vient de domainInvoicing.buildLigneFacture ;
 * - le relevé interne vient de domainInvoicing.buildLignesReleveInterne ;
 * - le total vient de domainInvoicing.calculerTotalFacture ;
 * - le vendeur effectif vient de domainVendeur.resolveVendeurEffectif.
 * Ce service assemble uniquement domaine + dépôts de données, dans une
 * seule transaction SQLite (tout ou rien).
 */
export class VenteService {
  constructor(
    private readonly db: import("better-sqlite3-multiple-ciphers").Database,
    private readonly produitRepository: ProduitRepository,
    private readonly stockRepository: StockRepository,
    private readonly mouvementRepository: MouvementRepository,
    private readonly factureRepository: FactureRepository
  ) {}

  enregistrerVente(input: VenteInput): VenteResult {
    if (input.lignes.length === 0) {
      throw new VenteValidationError("Une vente doit contenir au moins une ligne.");
    }

    const executer = this.db.transaction(() => {
      const lignesFacture: LigneFacture[] = [];
      const lignesReleveInterne: LigneReleveInterne[] = [];
      const mouvementsAEnregistrer: { produitId: string; quantite: number }[] = [];

      for (const ligne of input.lignes) {
        const produit = this.produitRepository.findById(ligne.produitId);
        if (!produit) {
          throw new VenteValidationError(`Produit introuvable (${ligne.produitId}).`);
        }

        const disponible = this.stockRepository.getQuantite(ligne.produitId, input.emplacementId);
        const repartition = domainStock.repartirVenteInterneExterne(input.emplacementId, disponible, ligne.quantite);

        if (repartition.quantiteExterne > 0 && (!ligne.fournisseurExterne || ligne.prixAchatExterne === undefined)) {
          throw new VenteValidationError(
            `Stock insuffisant pour "${produit.motif} ${produit.taille}" (${disponible} disponible(s) pour ${ligne.quantite} demandé(s)) — fournisseur et coût d'achat externes requis pour compléter.`
          );
        }

        const ligneFacture = domainInvoicing.buildLigneFacture({
          produitId: produit.id,
          motif: produit.motif,
          taille: produit.taille,
          prixUnitaire: ligne.prixUnitaire,
          quantiteInterne: repartition.quantiteInterne,
          quantiteExterne: repartition.quantiteExterne,
          fournisseur: ligne.fournisseurExterne,
          prixAchatExterne: ligne.prixAchatExterne,
        });
        lignesFacture.push(ligneFacture);

        const releve = domainInvoicing.buildLignesReleveInterne([
          {
            produitId: produit.id,
            motif: produit.motif,
            taille: produit.taille,
            prixUnitaire: ligne.prixUnitaire,
            quantiteInterne: repartition.quantiteInterne,
            quantiteExterne: repartition.quantiteExterne,
            fournisseur: ligne.fournisseurExterne,
            prixAchatExterne: ligne.prixAchatExterne,
          },
        ]);
        lignesReleveInterne.push(...releve);

        if (repartition.stockDelta) {
          this.stockRepository.applyDelta({ ...repartition.stockDelta, produitId: produit.id });
          mouvementsAEnregistrer.push({ produitId: produit.id, quantite: repartition.quantiteInterne });
        }
      }

      const total = domainInvoicing.calculerTotalFacture(lignesFacture);
      const vendeurEffectif = domainVendeur.resolveVendeurEffectif({
        compteConnecteNom: input.vendeurCompteConnecteNom,
        vendeurNomManuel: input.vendeurNomManuel,
      });

      const numero = this.factureRepository.nextNumero();
      const now = new Date().toISOString();
      const factureId = this.factureRepository.create({
        numero,
        date: now,
        emplacementId: input.emplacementId,
        clientNom: input.clientNom,
        clientTelephone: input.clientTelephone,
        clientAdresse: input.clientAdresse,
        vendeurUtilisateurId: input.vendeurUtilisateurId,
        vendeurNomManuel: vendeurEffectif.estPrecisionManuelle ? input.vendeurNomManuel : null,
        lignes: lignesFacture,
        total,
      });

      this.factureRepository.createReleveInterne(factureId, lignesReleveInterne);

      for (const m of mouvementsAEnregistrer) {
        this.mouvementRepository.create({
          type: "sortie",
          produitId: m.produitId,
          emplacementId: input.emplacementId,
          emplacementSourceId: null,
          emplacementDestinationId: null,
          quantite: m.quantite,
          date: now,
          factureId,
          note: null,
        });
      }

      return { factureId, numero, total };
    });

    return executer();
  }
}
