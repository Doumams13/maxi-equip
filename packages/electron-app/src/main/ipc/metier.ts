import { ipcMain } from "electron";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { EmplacementRepository } from "../repositories/emplacementRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { StockService } from "../services/stockService.js";
import { VenteService, VenteValidationError, type VenteInput } from "../services/venteService.js";
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
  venteService: VenteService
): void {
  // --- Catalogue ---
  ipcMain.handle("catalogue:list", () => produitRepository.list());

  ipcMain.handle("catalogue:suggestions", () => ({
    types: produitRepository.distinctTypes(),
    tailles: produitRepository.distinctTailles(),
  }));

  ipcMain.handle(
    "catalogue:create",
    (_e, input: { motif: string; type: string; taille: string; reference: string; prix: number; seuilAlerte: number }) => {
      const tailleTri = parseFloat(input.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      return { id: produitRepository.create({ ...input, tailleTri }) };
    }
  );

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
