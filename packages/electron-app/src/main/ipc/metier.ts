import { ipcMain, BrowserWindow, dialog } from "electron";
import { copyFile, readFile } from "node:fs/promises";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { ModeleRepository } from "../repositories/modeleRepository.js";
import { EmplacementRepository } from "../repositories/emplacementRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { ParametresRepository, type IdentiteEntreprise } from "../repositories/parametresRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { PromotionRepository } from "../repositories/promotionRepository.js";
import { StockService, StockValidationError } from "../services/stockService.js";
import { VenteService, VenteValidationError, type VenteInput } from "../services/venteService.js";
import { ImageService } from "../services/imageService.js";
import { SessionManager } from "../auth/sessionManager.js";
import { anonymiserActivite, anonymiserFactures } from "../services/visibiliteService.js";
import { genererFacturePdf } from "../services/factureDocumentService.js";
import { genererDocumentInternePdf } from "../services/documentInterneDocumentService.js";
import { stock as domainStock } from "@maxi-equip/domain";
import type { ModeleProduit, Produit } from "@maxi-equip/shared-types";

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
  boiteEnvoiRepository: BoiteEnvoiRepository,
  stockService: StockService,
  venteService: VenteService,
  imageService: ImageService,
  sessionManager: SessionManager,
  modeleRepository?: ModeleRepository,
  promotionRepository?: PromotionRepository
): void {
  // --- Catalogue ---
  ipcMain.handle("catalogue:list", () => {
    const produits = produitRepository.list();
    const produitIds = produits.map((p) => p.id);
    const modeleIds = [...new Set(produits.map((p) => p.modeleId).filter((id): id is string => id !== null))];
    const miniatures = imageService.getPrincipalesDataUrlsForModeles(modeleIds);
    const compteurs = imageService.countForModeles(modeleIds);
    const stockTotaux = stockRepository.getTotalsForProduits(produitIds);
    return produits.map((p) => ({
      ...p,
      imagePrincipaleDataUrl: p.modeleId ? (miniatures[p.modeleId] ?? null) : null,
      nombreImages: p.modeleId ? (compteurs[p.modeleId] ?? 0) : 0,
      stockTotal: stockTotaux.get(p.id) ?? 0,
    }));
  });

  ipcMain.handle("catalogue:suggestions", () => ({
    types: modeleRepository ? modeleRepository.distinctTypes() : produitRepository.distinctTypes(),
    tailles: produitRepository.distinctTailles(),
  }));

  // --- Catalogue modèles (multi-format) ---
  ipcMain.handle("catalogue:listModeles", () => {
    if (!modeleRepository) return [];
    const modeles = modeleRepository.list();
    return modeles.map((m) => {
      const variantes = produitRepository.listByModele(m.id);
      const varianteIds = variantes.map((v) => v.id);
      const stockTotaux = stockRepository.getTotalsForProduits(varianteIds);
      const imagePrincipaleDataUrl = imageService.getPrincipaleDataUrl(m.id);
      const nombreImages = imageService.countByModele(m.id);
      return {
        ...m,
        imagePrincipaleDataUrl,
        nombreImages,
        variantes: variantes.map((v) => ({
          id: v.id,
          modeleId: v.modeleId,
          taille: v.taille,
          tailleTri: v.tailleTri,
          largeur: v.largeur,
          hauteur: v.hauteur,
          reference: v.reference,
          prix: v.prix,
          seuilAlerte: v.seuilAlerte,
          deletedAt: v.deletedAt,
          stockTotal: stockTotaux.get(v.id) ?? 0,
        })),
      };
    });
  });

  type VarianteInput = {
    taille: string;
    tailleTri?: number;
    largeur?: number | null;
    hauteur?: number | null;
    reference: string;
    prix: number;
    seuilAlerte?: number;
  };

  ipcMain.handle(
    "catalogue:creerModele",
    (
      _e,
      input: { motif: string; type: string; variantes: VarianteInput[]; stagedImages?: string[]; principaleStagingId?: string | null }
    ) => {
      if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
      const session = sessionManager.get();
      if (!session) return { success: false, message: "Session expirée." };

      const modeleId = modeleRepository.create({ motif: input.motif, type: input.type });
      const modeleCree = modeleRepository.findById(modeleId)!;
      enqueueModeleSync(boiteEnvoiRepository, modeleCree, "create");
      for (const v of input.variantes) {
        const tailleTri = v.tailleTri ?? v.largeur ?? (parseFloat(v.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
        const varianteId = produitRepository.create({
          modeleId,
          motif: input.motif,
          type: input.type,
          taille: v.taille,
          tailleTri,
          largeur: v.largeur ?? null,
          hauteur: v.hauteur ?? null,
          reference: v.reference,
          prix: v.prix,
          seuilAlerte: v.seuilAlerte ?? 0,
        });
        enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(varianteId)!, "create");
      }
      if (input.stagedImages && input.stagedImages.length > 0) {
        imageService.commitStaged(modeleId, input.stagedImages, input.principaleStagingId ?? null);
      }
      return { success: true, id: modeleId };
    }
  );

  ipcMain.handle("catalogue:modifierModele", (_e, modeleId: string, input: { motif?: string; type?: string }) => {
    if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
    modeleRepository.update(modeleId, input);
    enqueueModeleSync(boiteEnvoiRepository, modeleRepository.findById(modeleId)!, "update");
    if (input.motif !== undefined || input.type !== undefined) {
      const variantes = produitRepository.listByModele(modeleId);
      for (const v of variantes) {
        produitRepository.update(v.id, {
          motif: input.motif,
          type: input.type ?? v.type,
          taille: v.taille,
          tailleTri: v.tailleTri,
          largeur: v.largeur,
          hauteur: v.hauteur,
          reference: v.reference,
          prix: v.prix,
          seuilAlerte: v.seuilAlerte,
        });
        enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(v.id)!, "update");
      }
    }
    return { success: true };
  });

  ipcMain.handle("catalogue:supprimerModele", (_e, modeleId: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
    const variantes = produitRepository.listByModele(modeleId);
    for (const v of variantes) {
      // Correction "produit interdit à la vente supprimé avec du stock
      // restant" — écoule le stock restant AVANT de masquer la variante,
      // jamais l'inverse (sinon plus aucun écran ne permettrait de le
      // faire, voir StockService.ecoulerStockPourSuppression).
      stockService.ecoulerStockPourSuppression(v.id, session.userId);
      produitRepository.softDelete(v.id, session.userId);
      enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(v.id)!, "delete");
    }
    modeleRepository.softDelete(modeleId, session.userId);
    enqueueModeleSync(boiteEnvoiRepository, modeleRepository.findById(modeleId)!, "delete");
    return { success: true };
  });

  ipcMain.handle("catalogue:ajouterVariante", (_e, modeleId: string, input: VarianteInput) => {
    if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
    const modele = modeleRepository.findById(modeleId);
    if (!modele) return { success: false, message: "Modèle introuvable." };
    const tailleTri = input.tailleTri ?? input.largeur ?? (parseFloat(input.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
    const id = produitRepository.create({
      modeleId,
      motif: modele.motif,
      type: modele.type,
      taille: input.taille,
      tailleTri,
      largeur: input.largeur ?? null,
      hauteur: input.hauteur ?? null,
      reference: input.reference,
      prix: input.prix,
      seuilAlerte: input.seuilAlerte ?? 0,
    });
    enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(id)!, "create");
    return { success: true, id };
  });

  ipcMain.handle(
    "catalogue:modifierVariante",
    (_e, varianteId: string, input: Partial<VarianteInput & { motif?: string; type?: string }>) => {
      const existante = produitRepository.findById(varianteId);
      if (!existante) return { success: false, message: "Variante introuvable." };
      const taille = input.taille ?? existante.taille;
      const largeur = input.largeur !== undefined ? (input.largeur ?? null) : existante.largeur;
      const hauteur = input.hauteur !== undefined ? (input.hauteur ?? null) : existante.hauteur;
      const tailleTri = input.tailleTri ?? largeur ?? (parseFloat(taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
      produitRepository.update(varianteId, {
        type: input.type ?? existante.type,
        taille,
        tailleTri,
        largeur,
        hauteur,
        reference: input.reference ?? existante.reference,
        prix: input.prix ?? existante.prix,
        seuilAlerte: input.seuilAlerte ?? existante.seuilAlerte,
      });
      enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(varianteId)!, "update");
      return { success: true };
    }
  );

  ipcMain.handle("catalogue:supprimerVariante", (_e, varianteId: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    // Correction "produit interdit à la vente supprimé avec du stock
    // restant" — même principe que supprimerModele ci-dessus.
    stockService.ecoulerStockPourSuppression(varianteId, session.userId);
    produitRepository.softDelete(varianteId, session.userId);
    enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(varianteId)!, "delete");
    return { success: true };
  });

  // --- Catalogue legacy (backward compat avec ProduitSelector dans Ventes/Stock/Transferts) ---
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
      const motif = input.motif?.trim() || input.reference.trim();
      // Crée aussi un modèle pour maintenir l'intégrité
      const modeleId = modeleRepository ? modeleRepository.create({ motif, type: input.type }) : null;
      if (modeleId && modeleRepository) enqueueModeleSync(boiteEnvoiRepository, modeleRepository.findById(modeleId)!, "create");
      const id = produitRepository.create({ modeleId, motif, ...input, tailleTri, largeur: input.largeur ?? null, hauteur: input.hauteur ?? null });
      enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(id)!, "create");
      return { id };
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
      enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(id)!, "update");
      return { success: true };
    }
  );

  ipcMain.handle("catalogue:delete", (_e, id: string, deletedBy: string) => {
    produitRepository.softDelete(id, deletedBy);
    enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(id)!, "delete");
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

  ipcMain.handle("stock:sortie", (_e, produitId: string, emplacementId: string, quantite: number) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      stockService.enregistrerSortie(produitId, emplacementId, quantite, session.userId);
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

  /**
   * Annulation d'une entrée/sortie manuelle saisie par erreur — correction
   * "corriger une erreur de saisie de stock sans fausser le tableau de
   * bord". Toute la logique (restauration du stock, exclusion des
   * totaux) vit dans StockService.annulerMouvement — jamais réimplémentée
   * ici.
   */
  ipcMain.handle("stock:annulerMouvement", (_e, mouvementId: string, motif: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      stockService.annulerMouvement(mouvementId, session.userId, motif);
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
  /**
   * Correction "Audit Phase 2 — pagination Factures" : remplace
   * `factures:list` (plafonné à 50, recherche/tri/filtre appliqués
   * seulement sur ces 50 lignes côté Renderer) par une vraie pagination
   * BASE DE DONNÉES. Le Renderer envoie sa page/recherche/filtres/tri
   * actuels ; seules les 10 lignes demandées sont chargées, quel que
   * soit le nombre total de factures.
   */
  ipcMain.handle(
    "factures:listPagine",
    (
      _e,
      filtres: {
        recherche: string;
        statutFiltre: "tous" | "annulee" | "en_attente" | "livree";
        vendeurUtilisateurId: string | null;
        colonneTri: "numero" | "date" | "client" | "vendeur" | "montant" | "statut" | null;
        direction: "asc" | "desc";
        page: number;
        tailleParPage: number;
      }
    ) => {
      const session = sessionManager.get();
      // Défense en profondeur : un Gérant ne peut filtrer QUE sur
      // lui-même, jamais faire confiance à une valeur arbitraire envoyée
      // par le Renderer pour ce champ sensible (même principe déjà
      // pratiqué ailleurs dans ce projet — jamais uniquement masqué côté
      // interface).
      const vendeurSecurise =
        session && session.role !== "administrateur" && filtres.vendeurUtilisateurId && filtres.vendeurUtilisateurId !== session.userId
          ? session.userId
          : filtres.vendeurUtilisateurId;

      const { resultats, totalResultats } = factureRepository.listAvecVendeurPagine({ ...filtres, vendeurUtilisateurId: vendeurSecurise });
      const resultatsAnonymises = session ? anonymiserFactures(resultats, session) : resultats;
      return {
        resultats: resultatsAnonymises,
        totalResultats,
        page: filtres.page,
        totalPages: Math.max(1, Math.ceil(totalResultats / filtres.tailleParPage)),
        tailleParPage: filtres.tailleParPage,
      };
    }
  );

  ipcMain.handle("factures:trouverPage", (_e, factureId: string, tailleParPage: number) => factureRepository.trouverPageParDefaut(factureId, tailleParPage));

  /**
   * Options du filtre "Vendeur" — jamais construites côté Renderer à
   * partir des factures déjà chargées (impossible désormais, une seule
   * page est chargée à la fois). Un Gérant ne reçoit QUE lui-même
   * ("Vous") : lui exposer la liste complète des vendeurs distincts
   * révélerait des identités qui doivent rester anonymes pour lui,
   * même avant qu'il ne filtre quoi que ce soit.
   */
  ipcMain.handle("factures:listVendeursFiltrables", () => {
    const session = sessionManager.get();
    if (!session) return [];
    if (session.role === "administrateur") {
      return factureRepository.listVendeursDistincts().map((v) => (v.id === session.userId ? { id: v.id, nom: "Vous" } : v));
    }
    return [{ id: session.userId, nom: "Vous" }];
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
  /**
   * Résout le nom du vendeur affiché sur un document — correction
   * "Vendeur affiché = Responsable configuré" : le nom brut du compte
   * de connexion (ex. "Administrateur", placeholder créé au tout début
   * du projet, avant que les vraies personnes ne soient connues) n'est
   * plus affiché tel quel sur les documents remis au client. Priorité :
   * 1. Un nom manuel réellement saisi pour CETTE vente précise (jamais
   *    remplacé — c'est une information plus spécifique que le rôle).
   * 2. Le nom du Responsable configuré dans Paramètres correspondant au
   *    rôle du vendeur (Administrateur/Gérant) — la décision explicite
   *    de l'utilisateur : "ce sont ces noms qui doivent être sur les
   *    factures", distincts des identifiants de connexion.
   * 3. Le nom brut du compte, en dernier recours seulement (Responsables
   *    pas encore configurés — jamais un "—" quand une vraie information
   *    existe déjà).
   */
  function resoudreVendeurAffiche(
    facture: { vendeurNomManuel: string | null; vendeurNom: string | null; vendeurRole: string | null },
    identite: Pick<IdentiteEntreprise, "nomAdministrateur" | "nomGerant">
  ): string {
    if (facture.vendeurNomManuel) return facture.vendeurNomManuel;
    if (facture.vendeurRole === "administrateur" && identite.nomAdministrateur) return identite.nomAdministrateur;
    if (facture.vendeurRole === "gerant" && identite.nomGerant) return identite.nomGerant;
    return facture.vendeurNom ?? "—";
  }

  ipcMain.handle("factures:genererPdf", async (_e, factureId: string) => {
    const facture = factureRepository.findByIdAvecVendeur(factureId);
    if (!facture) return { success: false, message: "Facture introuvable." };
    // Correction Phase Finale, Bloc 6 — l'identité HISTORIQUE (capturée à
    // la vente) prévaut toujours sur l'identité courante, pour que
    // régénérer le PDF d'une ancienne facture n'affiche jamais les
    // paramètres entreprise actuels. Repli sur l'identité courante
    // UNIQUEMENT pour une facture antérieure à cette évolution (jamais de
    // snapshot capturé à l'époque — voir migrate.ts).
    const identite = facture.identiteSnapshot ?? parametresRepository.getIdentite();
    const vendeurNomAffiche = resoudreVendeurAffiche(facture, identite);
    try {
      const chemin = await genererFacturePdf({
        facture,
        identite,
        vendeurNomAffiche,
      });
      return { success: true, chemin, nomSuggere: `${facture.numero}.pdf` };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[factures] génération PDF impossible :", err);
      return { success: false, message: "Impossible de générer le document de la facture." };
    }
  });

  /** Même principe que factures:genererPdf, pour le document interne d'approvisionnement (§4 de la correction). Reprend désormais la même identité visuelle que la facture (facture complète + vendeur nécessaires, comme pour la facture elle-même). */
  ipcMain.handle("factures:genererDocumentInternePdf", async (_e, factureId: string) => {
    const facture = factureRepository.findByIdAvecVendeur(factureId);
    if (!facture) return { success: false, message: "Facture introuvable." };
    try {
      const lignes = factureRepository.getDocumentInterne(factureId);
      const identite = facture.identiteSnapshot ?? parametresRepository.getIdentite();
      const vendeurNomAffiche = resoudreVendeurAffiche(facture, identite);
      const chemin = await genererDocumentInternePdf({ facture, identite, vendeurNomAffiche, lignes });
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

  /**
   * IMPRIMER — ABANDONNÉ ici (était basé sur le lecteur PDF intégré de
   * Chromium dans une fenêtre cachée, exactement la même famille de
   * problèmes que "Voir" ci-dessus : la boîte de dialogue d'impression
   * Windows affichait "cette application ne prend pas en charge l'aperçu
   * avant impression"). Remplacé par un rendu pdf.js côté Renderer suivi
   * d'un vrai `window.print()` sur le contenu rendu (voir
   * renderer/app/lib/imprimerPdf.ts) — jamais de fenêtre cachée ni de
   * lecteur PDF Chromium, même principe que la correction déjà appliquée
   * à "Voir".
   */

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

  /** Identité complète (nom, adresse, quartier, téléphones) — écran Paramètres. Lecture ouverte, écriture Administrateur uniquement. */
  ipcMain.handle("parametres:getIdentite", () => parametresRepository.getIdentite());

  ipcMain.handle("parametres:setIdentite", (_e, identite: IdentiteEntreprise) => {
    const session = sessionManager.get();
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    try {
      parametresRepository.setIdentite(identite);
      const updatedIdentite = parametresRepository.getIdentite();
      boiteEnvoiRepository.creer("parametres_entreprise", "singleton", {
        nom: updatedIdentite.nom,
        adresse: updatedIdentite.adresse,
        quartier: updatedIdentite.quartier,
        telephones: updatedIdentite.telephones,
        whatsapp: updatedIdentite.whatsapp,
        email: updatedIdentite.email,
        nomAdministrateur: updatedIdentite.nomAdministrateur,
        nomGerant: updatedIdentite.nomGerant,
        updatedAt: updatedIdentite.updatedAt,
      });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  /**
   * Renommage d'un emplacement — correction "Paramètres" (points de
   * vente). Volontairement pas de création/suppression d'emplacement
   * (limite explicite) : uniquement modifier le nom d'un emplacement
   * déjà existant, Administrateur uniquement.
   */
  ipcMain.handle("emplacements:renommer", (_e, id: string, nouveauNom: string) => {
    const session = sessionManager.get();
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    try {
      emplacementRepository.renommer(id, nouveauNom);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  /** Création d'un nouveau point de vente/dépôt — correction "Points de vente dynamiques" §2. Toujours actif, toujours de type "depot" (jamais "shop"). */
  ipcMain.handle("emplacements:creerDepot", (_e, nom: string) => {
    const session = sessionManager.get();
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    try {
      const id = emplacementRepository.creerDepot(nom, "Libreville");
      return { success: true, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  /**
   * Archivage — vérifie D'ABORD que le point de vente n'a plus de stock
   * (§8 de la correction : "ne pas simplement faire disparaître le
   * stock"). Renvoie le détail produit par produit si le stock n'est pas
   * vide, pour l'avertissement clair demandé — jamais un archivage forcé.
   */
  ipcMain.handle("emplacements:archiver", (_e, id: string) => {
    const session = sessionManager.get();
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    const stockRestant = stockRepository
      .listByEmplacement(id)
      .filter((s) => s.quantite > 0)
      .map((s) => ({ produit: produitRepository.findById(s.produitId), quantite: s.quantite }))
      .filter((s) => s.produit !== null)
      .map((s) => ({ motif: s.produit!.motif, taille: s.produit!.taille, quantite: s.quantite }));

    if (stockRestant.length > 0) {
      return {
        success: false,
        stockRestant,
        message: "Ce point de vente possède encore du stock. Veuillez le transférer ou le gérer avant l'archivage.",
      };
    }

    // Correction "Finaliser Paramètres" §G : archiver() peut désormais
    // lever une erreur (protection du dernier point de vente actif) —
    // BUG TROUVÉ ET CORRIGÉ en l'ajoutant : cet appel n'était pas protégé
    // par un try/catch, l'erreur serait remontée de façon non gérée
    // plutôt que sous la forme { success: false, message } attendue par
    // l'interface.
    try {
      emplacementRepository.archiver(id);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  ipcMain.handle("emplacements:reactiver", (_e, id: string) => {
    const session = sessionManager.get();
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    emplacementRepository.reactiver(id);
    return { success: true };
  });

  /**
   * Indique, pour chaque emplacement fourni, s'il peut être supprimé
   * DÉFINITIVEMENT (jamais utilisé) — correction "Suppression vs
   * Archivage" §3 : "l'application doit vérifier automatiquement". Une
   * seule requête groupée plutôt qu'un appel par emplacement.
   */
  ipcMain.handle("emplacements:verifierSuppressibles", (_e, ids: string[]) => {
    return Object.fromEntries(ids.map((id) => [id, emplacementRepository.peutEtreSupprimeDefinitivement(id)]));
  });

  /**
   * Suppression définitive — revérifie TOUJOURS côté serveur avant de
   * supprimer (défense en profondeur, §6 : la vérification affichée à
   * l'écran peut être périmée si une opération a eu lieu entre-temps).
   * Ne supprime jamais un emplacement encore référencé.
   */
  ipcMain.handle("emplacements:supprimerDefinitivement", (_e, id: string) => {
    const session = sessionManager.get();
    if (!session || session.role !== "administrateur") {
      return { success: false, message: "Seul l'Administrateur peut modifier cette configuration." };
    }
    try {
      emplacementRepository.supprimerDefinitivement(id);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Une erreur inattendue s'est produite.";
      return { success: false, message };
    }
  });

  /**
   * Changement de statut (paiement + livraison) — correction "Réservation
   * / Acompte", remplace l'ancien "factures:marquerLivree" (trop étroit,
   * ne couvrait qu'un seul sens de transition). Toute la logique
   * (transitions permises, encaissement automatique du solde) vit dans
   * VenteService.changerStatutFacture — jamais réimplémentée ici.
   */
  ipcMain.handle("factures:changerStatut", (_e, factureId: string, nouveauStatut: "reservation" | "payee_non_livree" | "payee_livree") => {
    try {
      venteService.changerStatutFacture(factureId, nouveauStatut);
      return { success: true };
    } catch (err) {
      return { success: false, message: err instanceof VenteValidationError ? err.message : "Une erreur inattendue s'est produite." };
    }
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

  /**
   * Correction "Audit Phase 2 — pagination Historique" : remplace
   * `historique:listEnrichi` (plafonné à 300, recherche/filtre/tri
   * appliqués seulement sur ces 300 lignes côté Renderer) par une vraie
   * pagination BASE DE DONNÉES. Le Renderer envoie sa
   * page/recherche/filtres/tri actuels ; seules les 10 lignes demandées
   * sont chargées, quel que soit le nombre total d'événements.
   *
   * Les bornes de période (jour/semaine/mois/personnalisé) sont
   * calculées ICI, en JavaScript, avec exactement le même calcul que
   * l'ancien filtre côté Renderer (voir debutPeriode() dans
   * HistoriqueScreen.tsx) — jamais recalculées différemment via une
   * fonction de date SQL, pour éviter tout risque de divergence de
   * fuseau horaire.
   */
  ipcMain.handle(
    "historique:listEnrichiPagine",
    (
      _e,
      filtres: {
        recherche: string;
        typeFiltre: "tous" | "vente" | "annulation" | "entree" | "transfert";
        periode: "tout" | "jour" | "semaine" | "mois" | "personnalise";
        dateDebut: string;
        dateFin: string;
        colonneTri: "date" | "type" | "montant" | null;
        direction: "asc" | "desc";
        page: number;
        tailleParPage: number;
      }
    ) => {
      const session = sessionManager.get();

      let dateDebutIso: string | null = null;
      let dateFinIso: string | null = null;
      const now = new Date();
      if (filtres.periode === "jour") {
        dateDebutIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (filtres.periode === "semaine") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        dateDebutIso = d.toISOString();
      } else if (filtres.periode === "mois") {
        dateDebutIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      } else if (filtres.periode === "personnalise") {
        if (filtres.dateDebut) dateDebutIso = new Date(filtres.dateDebut).toISOString();
        if (filtres.dateFin) dateFinIso = new Date(new Date(filtres.dateFin).setHours(23, 59, 59, 999)).toISOString();
      }

      const { resultats, totalResultats, compteurs } = mouvementRepository.listEvenementsPagine({
        recherche: filtres.recherche,
        typeFiltre: filtres.typeFiltre,
        dateDebutIso,
        dateFinIso,
        colonneTri: filtres.colonneTri,
        direction: filtres.direction,
        page: filtres.page,
        tailleParPage: filtres.tailleParPage,
      });
      const resultatsAnonymises = session ? anonymiserActivite(resultats, session) : resultats;
      return {
        resultats: resultatsAnonymises,
        totalResultats,
        page: filtres.page,
        totalPages: Math.max(1, Math.ceil(totalResultats / filtres.tailleParPage)),
        tailleParPage: filtres.tailleParPage,
        compteurs,
      };
    }
  );


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

  ipcMain.handle("stock:listSorties", () => {
    const session = sessionManager.get();
    const sorties = mouvementRepository.listSorties();
    return session ? anonymiserActivite(sorties, session) : sorties;
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
      promotionsActives: promotionRepository ? promotionRepository.compterActives() : 0,
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

/**
 * Correction "Intégration Site Phase 5, Partie 2 (pipeline catalogue)" —
 * met en attente la synchronisation d'un modèle/variante vers la
 * projection catalogue serveur, exactement selon le même mécanisme déjà
 * utilisé pour "promotion" (voir PromotionService). Toujours appelé
 * APRÈS l'écriture locale réussie, avec la ligne RELUE depuis le dépôt
 * (jamais les valeurs brutes transmises par le Renderer) — garantit que
 * `updatedAt` et les champs dénormalisés correspondent exactement à ce
 * qui est réellement en base localement.
 */
export function enqueueModeleSync(boiteEnvoiRepository: BoiteEnvoiRepository, modele: ModeleProduit, operation: "create" | "update" | "delete"): void {
  boiteEnvoiRepository.creer("modele", modele.id, {
    operation,
    modeleId: modele.id,
    motif: modele.motif,
    type: modele.type,
    updatedAt: modele.updatedAt,
  });
}

export function enqueueProduitSync(boiteEnvoiRepository: BoiteEnvoiRepository, produit: Produit, operation: "create" | "update" | "delete"): void {
  // Correction "catalogue legacy" : `catalogue:create` peut créer une
  // variante sans modèle parent (modeleId null, chemin antérieur à la
  // Phase multi-format) — jamais synchronisée vers le catalogue public
  // dans ce cas (un modèle est requis pour regrouper la fiche publique,
  // et la projection serveur exige un modeleId valide) ; l'écriture
  // locale reste inchangée, seul l'envoi vers le serveur est ignoré.
  if (!produit.modeleId) return;
  boiteEnvoiRepository.creer("produit", produit.id, {
    operation,
    produitId: produit.id,
    modeleId: produit.modeleId,
    taille: produit.taille,
    tailleTri: produit.tailleTri,
    largeur: produit.largeur,
    hauteur: produit.hauteur,
    reference: produit.reference,
    prix: produit.prix,
    updatedAt: produit.updatedAt,
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
  if (err instanceof VenteValidationError || err instanceof StockValidationError) {
    return { code: "VALIDATION_ERROR", message: err.message };
  }
  // eslint-disable-next-line no-console
  console.error("[metier] Erreur technique inattendue :", err);
  return { code: "UNKNOWN", message: "Une erreur inattendue s'est produite." };
}
