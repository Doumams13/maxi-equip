import { ipcMain, BrowserWindow, dialog } from "electron";
import { copyFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { EmplacementRepository } from "../repositories/emplacementRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { ParametresRepository } from "../repositories/parametresRepository.js";
import { StockService } from "../services/stockService.js";
import { VenteService, VenteValidationError, type VenteInput } from "../services/venteService.js";
import { ImageService } from "../services/imageService.js";
import { SessionManager } from "../auth/sessionManager.js";
import { anonymiserActivite, anonymiserFactures } from "../services/visibiliteService.js";
import { genererFacturePdf } from "../services/factureDocumentService.js";
import { genererDocumentInternePdf } from "../services/documentInterneDocumentService.js";
import { stock as domainStock } from "@maxi-equip/domain";

/**
 * Canaux IPC métier (Phase 2). Chaque canal est nommé explicitement,
 * aucune exposition générique (Synthèse §3, rappelé §18 du prompt
 * Phase 2). Les erreurs métier connues (stock insuffisant, quantité
 * invalide, validation de vente) sont capturées ici et renvoyées sous une
 * forme structurée — jamais une exception brute qui remonterait telle
 * quelle jusqu'au Renderer.
 *
 * Consolidation Administrateur/Gérant : l'identifiant et le rôle de
 * l'utilisateur agissant sont désormais TOUJOURS dérivés de la session
 * réellement authentifiée (sessionManager), jamais d'un argument transmis
 * par le Renderer — celui-ci ne doit jamais être considéré comme une
 * source de confiance (principe déjà établi du projet).
 */
export function registerMetierIpcHandlers(
  produitRepository: ProduitRepository,
  emplacementRepository: EmplacementRepository,
  stockRepository: StockRepository,
  mouvementRepository: MouvementRepository,
  factureRepository: FactureRepository,
  parametresRepository: ParametresRepository,
  stockService: StockService,
  venteService: VenteService,
  imageService: ImageService,
  sessionManager: SessionManager
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

  ipcMain.handle("stock:entree", (_e, produitId: string, emplacementId: string, quantite: number) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      stockService.enregistrerEntree(produitId, emplacementId, quantite, session.userId);
      return { success: true };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  ipcMain.handle("stock:transfert", (_e, produitId: string, sourceId: string, destinationId: string, quantite: number) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      stockService.enregistrerTransfert(produitId, sourceId, destinationId, quantite, session.userId);
      return { success: true };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  // --- Ventes ---
  ipcMain.handle("ventes:create", (_e, input: VenteInput) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      // L'auteur réel de la vente est TOUJOURS celui de la session
      // authentifiée, jamais une valeur transmise par le Renderer — seul
      // `vendeurNomManuel` (précision d'affichage, pas d'identité) reste
      // du ressort du Renderer.
      const result = venteService.enregistrerVente({ ...input, vendeurUtilisateurId: session.userId });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  // --- Factures ---
  ipcMain.handle("factures:list", () => {
    const session = sessionManager.get();
    const factures = factureRepository.listAvecVendeur();
    return session ? anonymiserFactures(factures, session) : factures;
  });

  ipcMain.handle("factures:resumeMois", () => factureRepository.sommeTotalMoisCourant());

  /**
   * Génère (ou régénère) le PDF de la facture et l'ouvre avec
   * l'application par défaut du système — jamais une nouvelle facture ni
   * un nouveau numéro (§3/§4 de la correction "Facturation" : "cliquer
   * plusieurs fois ne doit pas créer de doublon"). Le fichier est
   * réécrit à chaque appel à partir des données déjà enregistrées —
   * cohérent même si le statut (livraison) a changé depuis la première
   * génération.
   */
  /**
   * Génère (ou régénère) le PDF de la facture et retourne son CHEMIN
   * seulement — plus aucune ouverture automatique ici (correction
   * "Voir/Imprimer/Télécharger" : les trois actions sont désormais
   * distinctes, cette fonction ne fait que préparer le fichier). Jamais
   * une nouvelle facture ni un nouveau numéro (§3/§4 de la correction
   * "Facturation" : "cliquer plusieurs fois ne doit pas créer de
   * doublon").
   */
  ipcMain.handle("factures:genererPdf", async (_e, factureId: string) => {
    const facture = factureRepository.findByIdAvecVendeur(factureId);
    if (!facture) return { success: false, message: "Facture introuvable." };
    const vendeurNomAffiche = facture.vendeurNomManuel ?? facture.vendeurNom ?? "—";
    try {
      const chemin = await genererFacturePdf({
        facture,
        // Correction "SHOP sur la facture" : le nom affiché vient
        // TOUJOURS de la configuration centralisée, jamais du nom
        // interne de l'emplacement point-de-vente.
        nomMagasin: parametresRepository.getNomMagasin(),
        vendeurNomAffiche,
      });
      return { success: true, chemin, nomSuggere: `${facture.numero}.pdf` };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[factures] génération PDF impossible :", err);
      return { success: false, message: "Impossible de générer le document de la facture." };
    }
  });

  /** Même principe que factures:genererPdf, pour le document interne d'approvisionnement (§4 de la correction). */
  ipcMain.handle("factures:genererDocumentInternePdf", async (_e, factureId: string) => {
    const facture = factureRepository.findById(factureId);
    if (!facture) return { success: false, message: "Facture introuvable." };
    try {
      const lignes = factureRepository.getDocumentInterne(factureId);
      const chemin = await genererDocumentInternePdf(facture.numero, lignes);
      return { success: true, chemin, nomSuggere: `${facture.numero}-document-interne.pdf` };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[factures] génération document interne impossible :", err);
      return { success: false, message: "Impossible de générer le document interne." };
    }
  });

  /**
   * Trois actions génériques, réutilisables pour n'importe quel PDF déjà
   * généré (facture ou document interne, §4/§6 de la correction) — la
   * logique d'aperçu/impression/enregistrement ne doit jamais être
   * dupliquée entre les deux types de documents.
   */

  /**
   * VOIR — historique des tentatives précédentes, toutes basées sur le
   * lecteur PDF intégré de Chromium, abandonnées après échecs confirmés :
   * capturePage() sur fenêtre cachée (image vide), fenêtre visible hors
   * écran (image vide), rendu offscreen+paint (le plugin PDF ne se peint
   * pas dans ce pipeline), ouverture directe dans une fenêtre Electron
   * visible (écran gris uniforme — cause jamais identifiée avec
   * certitude, la piste Chromium a été abandonnée entièrement).
   *
   * Solution actuelle : pdfjs-dist, qui ne dépend d'AUCUN lecteur PDF de
   * Chromium — uniquement lecture des octets du fichier puis rendu sur
   * <canvas> côté Renderer (voir PdfPreviewModal.tsx). Cette fonction ne
   * fait que lire le fichier déjà généré (même source que Imprimer/
   * Télécharger) — aucune fenêtre, aucune capture.
   */
  ipcMain.handle("documents:lireBase64", async (_e, chemin: string) => {
    try {
      const octets = await readFile(chemin);
      return { success: true, base64: octets.toString("base64") };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[documents] lecture impossible :", err);
      return { success: false, message: "Impossible de lire le document." };
    }
  });

  /** IMPRIMER — boîte de dialogue native d'impression Windows, jamais une simple ouverture de fichier (§2). Même correction d'URL que "Voir" (pathToFileURL) — la boîte de dialogue apparaissait déjà avant ce correctif, mais rien ne garantit que la page imprimée contenait réellement le document tant que l'URL restait malformée. */
  ipcMain.handle("documents:imprimer", async (_e, chemin: string) => {
    const url = pathToFileURL(chemin).href;
    return new Promise((resolve) => {
      const fenetreImpression = new BrowserWindow({ show: false, webPreferences: { plugins: true } });
      fenetreImpression
        .loadURL(url)
        .then(() => {
          fenetreImpression.webContents.print({ silent: false }, (success, failureReason) => {
            fenetreImpression.close();
            resolve(success ? { success: true } : { success: false, message: failureReason });
          });
        })
        .catch((err: unknown) => {
          fenetreImpression.close();
          const message = err instanceof Error ? err.message : "Impossible de préparer l'impression.";
          resolve({ success: false, message });
        });
    });
  });

  /** TÉLÉCHARGER — "Enregistrer sous" natif, aucune ouverture automatique ensuite (§3 : "Ne PAS ouvrir automatiquement le PDF"). */
  ipcMain.handle("documents:telecharger", async (_e, chemin: string, nomSuggere: string) => {
    const fenetre = BrowserWindow.getFocusedWindow();
    const result = fenetre
      ? await dialog.showSaveDialog(fenetre, {
          title: "Enregistrer le document",
          defaultPath: nomSuggere,
          filters: [{ name: "Document PDF", extensions: ["pdf"] }],
        })
      : await dialog.showSaveDialog({
          title: "Enregistrer le document",
          defaultPath: nomSuggere,
          filters: [{ name: "Document PDF", extensions: ["pdf"] }],
        });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    try {
      await copyFile(chemin, result.filePath);
      return { success: true, chemin: result.filePath };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[documents] enregistrement impossible :", err);
      return { success: false, message: "Impossible d'enregistrer le document." };
    }
  });

  // --- Configuration centralisée de l'entreprise ---
  ipcMain.handle("parametres:getNomMagasin", () => parametresRepository.getNomMagasin());

  ipcMain.handle("parametres:setNomMagasin", (_e, nom: string) => {
    const session = sessionManager.get();
    // Seul l'Administrateur peut modifier cette configuration —
    // vérifié ici, jamais uniquement masqué côté Renderer.
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    try {
      parametresRepository.setNomMagasin(nom);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  ipcMain.handle("factures:marquerLivree", (_e, factureId: string) => {
    factureRepository.marquerLivree(factureId);
    return { success: true };
  });

  ipcMain.handle("factures:annuler", (_e, factureId: string, motif: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    try {
      venteService.annulerVente(factureId, motif, session.userId);
      return { success: true };
    } catch (err) {
      const message = err instanceof VenteValidationError ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  /**
   * Marque une facture annulée comme corrigée — appelé uniquement APRÈS
   * la création réussie d'une nouvelle facture via "Modifier" (jamais
   * avant, jamais si la création échoue). Le bouton Modifier disparaît
   * ensuite pour l'ancienne facture, évitant une seconde correction à
   * partir de la même erreur déjà traitée.
   */
  ipcMain.handle("factures:marquerCorrigee", (_e, factureOrigineId: string, nouvelleFactureId: string) => {
    factureRepository.marquerCorrigee(factureOrigineId, nouvelleFactureId);
    return { success: true };
  });

  /**
   * Document interne d'approvisionnement — accessible à tous, sans
   * distinction Admin/Gérant (§9 de la correction "Facturation").
   */
  ipcMain.handle("factures:documentInterne", (_e, factureId: string) => factureRepository.getDocumentInterne(factureId));

  /**
   * Données pour préremplir un nouveau formulaire de vente à partir
   * d'une facture annulée (§4 : bouton "Modifier"). Ne modifie jamais la
   * facture d'origine — elle reste la trace de l'erreur.
   */
  ipcMain.handle("factures:donneesPourModification", (_e, factureId: string) => factureRepository.getDonneesPourModification(factureId));

  // --- Historique ---
  ipcMain.handle("historique:list", () => mouvementRepository.list());
  ipcMain.handle("historique:listEnrichi", () => {
    const session = sessionManager.get();
    // "1 vente = 1 événement" (correction §1/§2/§16) — remplace l'ancien
    // affichage mouvement par mouvement. Anonymisation systématique,
    // décidée ici, jamais côté Renderer.
    const evenements = mouvementRepository.listEvenements();
    return session ? anonymiserActivite(evenements, session) : evenements;
  });

  /**
   * Historique COMPLET des entrées/transferts — correction "Entrée de
   * stock / Transferts" §2/§7 : nécessaire pour que la navigation
   * cliquable depuis l'Historique général retrouve réellement une
   * opération ancienne, quelle que soit la page où elle se trouve.
   * Anonymisation systématique, jamais côté Renderer.
   */
  ipcMain.handle("stock:listEntrees", () => {
    const session = sessionManager.get();
    const entrees = mouvementRepository.listEntrees();
    return session ? anonymiserActivite(entrees, session) : entrees;
  });

  ipcMain.handle("stock:listTransferts", () => {
    const session = sessionManager.get();
    const transferts = mouvementRepository.listTransferts();
    return session ? anonymiserActivite(transferts, session) : transferts;
  });

  // --- Dashboard ---
  ipcMain.handle("dashboard:summary", () => {
    const session = sessionManager.get();
    if (!session) return null;
    const userId = session.userId;

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

      // Activité récente — GLOBALE pour les deux rôles (§3/§14 de la
      // correction : le Gérant voit toute l'activité opérationnelle),
      // mais anonymisée côté serveur pour le Gérant (§4/§23) : jamais
      // l'identité d'un autre utilisateur, sa propre identité restant
      // visible (le Renderer peut afficher "Vous").
      activiteRecente: anonymiserActivite(mouvementRepository.listEvenements(10), session),

      // Gérant — stock GLOBAL consultable (décision confirmée §6 : le
      // Gérant peut voir Akébé, Akanda et le total, comme l'Administrateur).
      stockDepots,
      stockParEmplacementPourGerant: stockParEmplacement,

      // Gérant — indicateurs STRICTEMENT PERSONNELS, filtrés réellement en
      // base sur l'utilisateur de la session (§14 : "Mes ventes
      // aujourd'hui", "Mon chiffre d'affaires" — jamais mélangés avec un
      // indicateur global ambigu du même type).
      mesVentesAujourdhui: facturesAujourdhui.filter((f) => f.vendeurUtilisateurId === userId).reduce((s, f) => s + f.total, 0),
      monChiffreAffaires: factures.filter((f) => f.vendeurUtilisateurId === userId).reduce((s, f) => s + f.total, 0),
      mesFacturesAujourdhuiCount: facturesAujourdhui.filter((f) => f.vendeurUtilisateurId === userId).length,
      mesEntrees: mouvementRepository.sommeQuantiteParType("entree", userId),
      mesSorties: mouvementRepository.sommeQuantiteParType("sortie", userId),
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
