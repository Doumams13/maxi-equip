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
    const stockTotaux = stockRepository.getTotalsForProduits(produitIds);
    return produits.map((p) => ({
      ...p,
      imagePrincipaleDataUrl: miniatures[p.id] ?? null,
      nombreImages: compteurs[p.id] ?? 0,
      stockTotal: stockTotaux.get(p.id) ?? 0,
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

  ipcMain.handle("stock:entree", (_e, produitId: string, emplacementId: string, quantite: number, utilisateurId: string) => {
    try {
      stockService.enregistrerEntree(produitId, emplacementId, quantite, utilisateurId);
      return { success: true };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  ipcMain.handle("stock:transfert", (_e, produitId: string, sourceId: string, destinationId: string, quantite: number, utilisateurId: string) => {
    try {
      stockService.enregistrerTransfert(produitId, sourceId, destinationId, quantite, utilisateurId);
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
  ipcMain.handle("historique:listEnrichi", () => mouvementRepository.listEnrichi());

  // --- Dashboard ---
  ipcMain.handle("dashboard:summary", (_e, userId: string) => {
    const emplacements = emplacementRepository.list();
    // Décision métier : SHOP n'a pas de stock, uniquement point de vente
    // (correction Phase 2 §3/§7) — tous les indicateurs de stock du
    // dashboard portent donc exclusivement sur les dépôts (Akébé/Akanda),
    // jamais sur SHOP.
    const depots = emplacements.filter((e) => !e.estPointDeVente);
    const depotIds = depots.map((e) => e.id);
    const factures = factureRepository.list(200); // fenêtre raisonnable pour les agrégats "aujourd'hui" en Phase 2
    const aujourdhui = new Date().toDateString();
    const facturesAujourdhui = factures.filter((f) => new Date(f.date).toDateString() === aujourdhui);

    const stockDepots = depots.reduce((s, e) => s + stockRepository.listByEmplacement(e.id).reduce((a, r) => a + r.quantite, 0), 0);
    const stockParEmplacement = depots.map((e) => {
      const lignes = stockRepository.listByEmplacement(e.id);
      return {
        emplacementId: e.id,
        nom: e.nom,
        cartons: lignes.reduce((s, r) => s + r.quantite, 0),
        referencesEnRupture: lignes.filter((r) => r.quantite <= 0).length,
      };
    });

    return {
      // Administrateur — vue globale (ligne 1)
      stockTousDepots: stockDepots,
      caTotal: factureRepository.sommeTotal(),
      produitsSousSeuilGlobal: produitRepository.countSousSeuilDepots(depotIds),
      totalFactures: factureRepository.count(),
      totalProduits: produitRepository.count(),
      // Administrateur — ligne 2 (données globales)
      totalEntrees: mouvementRepository.sommeQuantiteParType("entree"),
      totalSorties: mouvementRepository.sommeQuantiteParType("sortie"),
      // Promotions : fonctionnalité non développée (Phase 4) — 0 réel et
      // honnête, pas une donnée inventée pour remplir la case (§4/§24).
      promotionsActives: 0,
      // Administrateur — graphique + tableaux (globaux)
      serieEntreesSorties: mouvementRepository.serieEntreesSortiesSeptJours(),
      stockParEmplacement,
      topProduitsVendus: factureRepository.topProduitsVendus(5),
      produitsSousSeuilListe: produitRepository.listSousSeuilDepots(depotIds).slice(0, 6),
      // Administrateur — activité de TOUTE l'entreprise, avec auteur
      // (§3/§11 de la correction : traçabilité — qui a fait quoi).
      activiteRecenteGlobale: mouvementRepository.activiteRecenteGlobale(8),

      // Gérant — stock GLOBAL consultable (décision confirmée §10 : le
      // Gérant peut voir Akébé, Akanda et le total, comme l'Administrateur).
      stockDepots,
      stockParEmplacementPourGerant: stockParEmplacement,

      // Gérant — données STRICTEMENT PERSONNELLES, filtrées réellement en
      // base sur utilisateurId (§5/§9 de la correction), jamais après
      // coup côté Renderer. Labels sans ambiguïté ("mes"/"mon"), plus de
      // métrique globale ambiguë affichée à côté d'une métrique
      // personnelle du même type (§7 : supprime la confusion "Ventes du
      // jour" 1 115 000 / "Mes ventes aujourd'hui" 0).
      mesVentesAujourdhui: facturesAujourdhui.filter((f) => f.vendeurUtilisateurId === userId).reduce((s, f) => s + f.total, 0),
      monChiffreAffaires: factures.filter((f) => f.vendeurUtilisateurId === userId).reduce((s, f) => s + f.total, 0),
      mesFacturesAujourdhuiCount: facturesAujourdhui.filter((f) => f.vendeurUtilisateurId === userId).length,
      mesEntrees: mouvementRepository.sommeQuantiteParType("entree", userId),
      mesSorties: mouvementRepository.sommeQuantiteParType("sortie", userId),
      activiteRecentePersonnelle: mouvementRepository.activiteRecentePersonnelle(userId, 8),
    };
  });
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
