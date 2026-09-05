import { ipcMain } from "electron";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { EmplacementRepository } from "../repositories/emplacementRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { StockService } from "../services/stockService.js";
import { VenteService, VenteValidationError, type VenteInput } from "../services/venteService.js";
import { ImageService } from "../services/imageService.js";
import { stock as domainStock } from "@maxi-equip/domain";

/**
 * Canaux IPC métier (Phase 2). Chaque canal est nommé explicitement,
 * aucune exposition générique (Synthèse §3, rappelé §18 du prompt
 * Phase 2). Les erreurs métier connues (stock insuffisant, quantité
 * invalide, validation de vente) sont capturées ici et renvoyées sous une
 * forme structurée — jamais une exception brute qui remonterait telle
 * quelle jusqu'au Renderer.
 */
export function registerMetierIpcHandlers(
  produitRepository: ProduitRepository,
  emplacementRepository: EmplacementRepository,
  stockRepository: StockRepository,
  mouvementRepository: MouvementRepository,
  factureRepository: FactureRepository,
  stockService: StockService,
  venteService: VenteService,
  imageService: ImageService
): void {
  // --- Catalogue ---
  ipcMain.handle("catalogue:list", () => {
    const produits = produitRepository.list();
    const produitIds = produits.map((p) => p.id);
    const miniatures = imageService.getPrincipalesDataUrlsForProduits(produitIds);
    const compteurs = imageService.countForProduits(produitIds);
    return produits.map((p) => ({
      ...p,
      imagePrincipaleDataUrl: miniatures[p.id] ?? null,
      nombreImages: compteurs[p.id] ?? 0,
    }));
  });

  ipcMain.handle("catalogue:suggestions", () => ({
    types: produitRepository.distinctTypes(),
    tailles: produitRepository.distinctTailles(),
  }));

  ipcMain.handle(
    "catalogue:create",
    (
      _e,
      input: {
        motif?: string;
        type: string;
        taille: string;
        largeur?: number;
        hauteur?: number;
        reference: string;
        prix: number;
        seuilAlerte: number;
      }
    ) => {
      const tailleTri = input.largeur ?? (parseFloat(input.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
      // Le "motif" n'est plus un champ obligatoire saisi par l'utilisateur
      // (correction Phase 2 §3 : "il n'y a pas de champ Nom du produit
      // obligatoire — la référence est l'information d'identification").
      // La colonne reste techniquement présente en base (usage interne
      // futur, recherche, regroupement) ; à défaut de valeur fournie, elle
      // est initialisée à la référence pour ne jamais laisser de valeur vide.
      const motif = input.motif?.trim() || input.reference.trim();
      return { id: produitRepository.create({ ...input, motif, tailleTri, largeur: input.largeur ?? null, hauteur: input.hauteur ?? null }) };
    }
  );

  ipcMain.handle(
    "catalogue:update",
    (
      _e,
      id: string,
      input: { type: string; taille: string; largeur?: number; hauteur?: number; reference: string; prix: number; seuilAlerte: number }
    ) => {
      const tailleTri = input.largeur ?? (parseFloat(input.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
      produitRepository.update(id, { ...input, tailleTri, largeur: input.largeur ?? null, hauteur: input.hauteur ?? null });
      return { success: true };
    }
  );

  ipcMain.handle("catalogue:delete", (_e, id: string, deletedBy: string) => {
    // Suppression douce uniquement (Synthèse §9) — jamais de perte de
    // données, le produit reste tracé et référencé par l'historique existant.
    produitRepository.softDelete(id, deletedBy);
    return { success: true };
  });

  // --- Emplacements ---
  ipcMain.handle("emplacements:list", () => emplacementRepository.list());

  // --- Stock ---
  ipcMain.handle("stock:byEmplacement", (_e, emplacementId: string) => stockRepository.listByEmplacement(emplacementId));

  ipcMain.handle("stock:entree", (_e, produitId: string, emplacementId: string, quantite: number) => {
    try {
      stockService.enregistrerEntree(produitId, emplacementId, quantite);
      return { success: true };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  // --- Ventes ---
  ipcMain.handle("ventes:create", (_e, input: VenteInput) => {
    try {
      const result = venteService.enregistrerVente(input);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  // --- Factures ---
  ipcMain.handle("factures:list", () => factureRepository.list());

  // --- Historique ---
  ipcMain.handle("historique:list", () => mouvementRepository.list());

  // --- Dashboard ---
  ipcMain.handle("dashboard:summary", () => ({
    totalProduits: produitRepository.count(),
    produitsSousSeuil: produitRepository.countBelowThreshold(),
    totalFactures: factureRepository.count(),
    mouvementsRecents: mouvementRepository.listRecent(5),
  }));
}

type StockErrorReason = "INSUFFICIENT_STOCK" | "INVALID_QUANTITY" | "VALIDATION_ERROR" | "UNKNOWN";

function mapStockError(err: unknown): { code: StockErrorReason; message: string; available?: number; requested?: number } {
  if (err instanceof domainStock.InsufficientStockError) {
    return { code: "INSUFFICIENT_STOCK", message: err.message, available: err.available, requested: err.requested };
  }
  if (err instanceof domainStock.InvalidQuantityError) {
    return { code: "INVALID_QUANTITY", message: err.message };
  }
  if (err instanceof VenteValidationError) {
    return { code: "VALIDATION_ERROR", message: err.message };
  }
  // eslint-disable-next-line no-console
  console.error("[metier] Erreur technique inattendue :", err);
  return { code: "UNKNOWN", message: "Une erreur inattendue s'est produite." };
}
