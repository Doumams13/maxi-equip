import { app, ipcMain, BrowserWindow, dialog } from "electron";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { ModeleRepository } from "../repositories/modeleRepository.js";
import { CategorieRepository } from "../repositories/categorieRepository.js";
import { SousCategorieRepository } from "../repositories/sousCategorieRepository.js";
import { SousCategorieChampRepository } from "../repositories/sousCategorieChampRepository.js";
import { SousCategorieUniteRepository } from "../repositories/sousCategorieUniteRepository.js";
import { EmplacementRepository } from "../repositories/emplacementRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { ParametresRepository, type IdentiteEntreprise } from "../repositories/parametresRepository.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import { PromotionRepository } from "../repositories/promotionRepository.js";
import { StockService, StockValidationError } from "../services/stockService.js";
import { VenteService, VenteValidationError, type VenteInput } from "../services/venteService.js";
import { ConnexionRequiseError } from "../services/validationStockDistanteService.js";
import { ImageService } from "../services/imageService.js";
import { SessionManager } from "../auth/sessionManager.js";
import { anonymiserActivite, anonymiserFactures } from "../services/visibiliteService.js";
import { genererFacturePdf } from "../services/factureDocumentService.js";
import { genererDocumentInternePdf } from "../services/documentInterneDocumentService.js";
import { genererBilanPdf } from "../services/bilanDocumentService.js";
import { checkAdminGuard } from "../auth/checkAdminGuard.js";
import { stock as domainStock, catalogue as domainCatalogue } from "@maxi-equip/domain";
import { parseCaracteristiques } from "@maxi-equip/shared-types";
import type { ModeleProduit, Produit, Emplacement, UniteVente, ConfigurationUnitesSousCategorie, Categorie, SousCategorie, SousCategorieChamp } from "@maxi-equip/shared-types";

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
  promotionRepository?: PromotionRepository,
  categorieRepository?: CategorieRepository,
  sousCategorieRepository?: SousCategorieRepository,
  sousCategorieChampRepository?: SousCategorieChampRepository,
  sousCategorieUniteRepository?: SousCategorieUniteRepository
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
    // Phase 5 (référentiel commun), sous-phase 5.6 — badge de
    // classification orpheline : sousCategorieSupprimee/categorieSupprimee
    // sont calculés à la lecture (LEFT JOIN, jamais une colonne
    // persistée) et simplement reconduits via `...m` ci-dessous.
    const modeles = modeleRepository.listAvecStatutClassification();
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
          carreauxParCarton: v.carreauxParCarton,
          seuilAlerte: v.seuilAlerte,
          uniteVente: v.uniteVente ?? null,
          caracteristiques: v.caracteristiques ?? null,
          marque: v.marque ?? null,
          deletedAt: v.deletedAt,
          stockTotal: stockTotaux.get(v.id) ?? 0,
        })),
      };
    });
  });

  /**
   * Définit la sélection ET l'ordre des modèles affichés dans la
   * vitrine du site public (2026-10-07). `modeleIds` est la liste
   * complète et ordonnée des modèles sélectionnés — voir
   * ModeleRepository.definirVitrine pour la sémantique exacte
   * (retrait implicite de tout modèle absent de la liste).
   */
  ipcMain.handle("catalogue:definirVitrine", (_e, modeleIds: string[]) => {
    if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
    const modifies = modeleRepository.definirVitrine(modeleIds);
    for (const modele of modifies) enqueueModeleSync(boiteEnvoiRepository, modele, "update");
    return { success: true };
  });

  type VarianteInput = {
    taille: string;
    tailleTri?: number;
    largeur?: number | null;
    hauteur?: number | null;
    reference: string;
    prix: number;
    carreauxParCarton?: number | null;
    seuilAlerte?: number;
    // Fondations quincaillerie (Phase 2).
    uniteVente?: Produit["uniteVente"];
    caracteristiques?: string | null;
  };

  ipcMain.handle(
    "catalogue:creerModele",
    (
      _e,
      input: {
        motif: string;
        type: string;
        variantes: VarianteInput[];
        stagedImages?: string[];
        principaleStagingId?: string | null;
        // Fondations quincaillerie (Phase 2).
        sousCategorieId?: string | null;
        marque?: string | null;
      }
    ) => {
      if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
      const session = sessionManager.get();
      if (!session) return { success: false, message: "Session expirée." };

      // Cohérence métier du catalogue (Phase 3 bis) — validée AVANT toute
      // création (modèle ET variantes), jamais après : un échec ne doit
      // jamais laisser un modèle partiellement créé.
      for (const v of input.variantes) {
        const erreur = erreurValidationVariante(sousCategorieUniteRepository, sousCategorieChampRepository, input.sousCategorieId, v.uniteVente, v.caracteristiques);
        if (erreur) return { success: false, message: erreur };
      }

      const modeleId = modeleRepository.create({ motif: input.motif, type: input.type, sousCategorieId: input.sousCategorieId, marque: input.marque });
      const modeleCree = modeleRepository.findById(modeleId)!;
      enqueueModeleSync(boiteEnvoiRepository, modeleCree, "create");
      for (const v of input.variantes) {
        const tailleTri = v.tailleTri ?? v.largeur ?? (parseFloat(v.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
        const varianteId = produitRepository.create({
          modeleId,
          motif: input.motif,
          type: input.type,
          marque: input.marque,
          taille: v.taille,
          tailleTri,
          largeur: v.largeur ?? null,
          hauteur: v.hauteur ?? null,
          reference: v.reference,
          prix: v.prix,
          carreauxParCarton: v.carreauxParCarton ?? null,
          seuilAlerte: v.seuilAlerte ?? 0,
          uniteVente: v.uniteVente,
          caracteristiques: v.caracteristiques,
        });
        enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(varianteId)!, "create");
      }
      if (input.stagedImages && input.stagedImages.length > 0) {
        imageService.commitStaged(modeleId, input.stagedImages, input.principaleStagingId ?? null);
      }
      return { success: true, id: modeleId };
    }
  );

  ipcMain.handle(
    "catalogue:modifierModele",
    (_e, modeleId: string, input: { motif?: string; type?: string; sousCategorieId?: string | null; marque?: string | null }) => {
      if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
      const modeleExistant = modeleRepository.findById(modeleId);
      if (!modeleExistant) return { success: false, message: "Modèle introuvable." };

      // Cohérence métier du catalogue (Phase 3 bis) — UNIQUEMENT sur un
      // changement EFFECTIF de sous-catégorie, jamais sur une
      // modification ordinaire (motif/type/marque) qui la laisse
      // inchangée : toutes les variantes existantes doivent rester
      // compatibles (unité ET caractéristiques obligatoires) avec la
      // NOUVELLE sous-catégorie avant d'accepter le changement — bloqué
      // avec un message précis sinon, aucune donnée touchée.
      if (domainCatalogue.valeurEffectivementModifiee(input.sousCategorieId, modeleExistant.sousCategorieId ?? null)) {
        const nouvelleConfig = configurationUnitesPourSousCategorie(sousCategorieUniteRepository, input.sousCategorieId);
        const nouveauxChamps = champsPourSousCategorie(sousCategorieChampRepository, input.sousCategorieId);
        const problemes: string[] = [];
        for (const v of produitRepository.listByModele(modeleId)) {
          const uniteV = v.uniteVente ?? "carton";
          if (!domainCatalogue.uniteEstCompatible(uniteV, nouvelleConfig)) {
            problemes.push(`"${v.reference}" : unité "${uniteV}" non autorisée pour cette sous-catégorie`);
          }
          const manquants = domainCatalogue.champsObligatoiresManquants(nouveauxChamps, parseCaracteristiques(v.caracteristiques ?? null));
          if (manquants.length > 0) {
            problemes.push(`"${v.reference}" : caractéristiques obligatoires manquantes (${manquants.join(", ")})`);
          }
        }
        if (problemes.length > 0) {
          return { success: false, message: `Changement de sous-catégorie impossible — ${problemes.join(" · ")}.` };
        }
      }

      modeleRepository.update(modeleId, input);
      enqueueModeleSync(boiteEnvoiRepository, modeleRepository.findById(modeleId)!, "update");
      if (input.motif !== undefined || input.type !== undefined || input.marque !== undefined) {
        const variantes = produitRepository.listByModele(modeleId);
        for (const v of variantes) {
          produitRepository.update(v.id, {
            motif: input.motif,
            type: input.type ?? v.type,
            marque: input.marque !== undefined ? input.marque : v.marque,
            taille: v.taille,
            tailleTri: v.tailleTri,
            largeur: v.largeur,
            hauteur: v.hauteur,
            reference: v.reference,
            prix: v.prix,
            carreauxParCarton: v.carreauxParCarton,
            seuilAlerte: v.seuilAlerte,
            uniteVente: v.uniteVente,
            caracteristiques: v.caracteristiques,
          });
          enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(v.id)!, "update");
        }
      }
      return { success: true };
    }
  );

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

    // Cohérence métier du catalogue (Phase 3 bis) — toujours validée à
    // l'ajout d'une variante (il n'existe aucune valeur "actuelle" à
    // comparer, contrairement à une modification — voir modifierVariante).
    const erreurAjout = erreurValidationVariante(sousCategorieUniteRepository, sousCategorieChampRepository, modele.sousCategorieId, input.uniteVente, input.caracteristiques);
    if (erreurAjout) return { success: false, message: erreurAjout };

    const tailleTri = input.tailleTri ?? input.largeur ?? (parseFloat(input.taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
    const id = produitRepository.create({
      modeleId,
      motif: modele.motif,
      type: modele.type,
      marque: modele.marque,
      taille: input.taille,
      tailleTri,
      largeur: input.largeur ?? null,
      hauteur: input.hauteur ?? null,
      reference: input.reference,
      prix: input.prix,
      carreauxParCarton: input.carreauxParCarton ?? null,
      seuilAlerte: input.seuilAlerte ?? 0,
      uniteVente: input.uniteVente,
      caracteristiques: input.caracteristiques,
    });
    enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(id)!, "create");
    return { success: true, id };
  });

  ipcMain.handle(
    "catalogue:modifierVariante",
    (_e, varianteId: string, input: Partial<VarianteInput & { motif?: string; type?: string }>) => {
      const existante = produitRepository.findById(varianteId);
      if (!existante) return { success: false, message: "Variante introuvable." };

      // Cohérence métier du catalogue (Phase 3 bis) — UNIQUEMENT sur un
      // changement EFFECTIF de l'unité ou des caractéristiques, jamais
      // sur une modification ordinaire (ex. prix, stock) qui les laisse
      // inchangées : rouvrir un produit existant pour corriger un prix
      // ne doit jamais être bloqué par une restriction ajoutée après
      // coup à sa sous-catégorie.
      const sousCategorieId = existante.modeleId ? (modeleRepository?.findById(existante.modeleId)?.sousCategorieId ?? null) : null;
      const uniteActuelle = existante.uniteVente ?? "carton";
      if (domainCatalogue.valeurEffectivementModifiee(input.uniteVente, uniteActuelle)) {
        try {
          domainCatalogue.validerUniteCompatible(input.uniteVente ?? "carton", configurationUnitesPourSousCategorie(sousCategorieUniteRepository, sousCategorieId));
        } catch (err) {
          return { success: false, message: err instanceof Error ? err.message : "Unité de vente incompatible." };
        }
      }
      if (domainCatalogue.valeurEffectivementModifiee(input.caracteristiques, existante.caracteristiques ?? null)) {
        try {
          domainCatalogue.validerCaracteristiquesObligatoires(champsPourSousCategorie(sousCategorieChampRepository, sousCategorieId), parseCaracteristiques(input.caracteristiques ?? null));
        } catch (err) {
          return { success: false, message: err instanceof Error ? err.message : "Caractéristiques obligatoires manquantes." };
        }
      }

      const taille = input.taille ?? existante.taille;
      const largeur = input.largeur !== undefined ? (input.largeur ?? null) : existante.largeur;
      const hauteur = input.hauteur !== undefined ? (input.hauteur ?? null) : existante.hauteur;
      const tailleTri = input.tailleTri ?? largeur ?? (parseFloat(taille.replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
      produitRepository.update(varianteId, {
        type: input.type ?? existante.type,
        marque: existante.marque,
        taille,
        tailleTri,
        largeur,
        hauteur,
        reference: input.reference ?? existante.reference,
        prix: input.prix ?? existante.prix,
        carreauxParCarton: input.carreauxParCarton !== undefined ? (input.carreauxParCarton ?? null) : existante.carreauxParCarton,
        seuilAlerte: input.seuilAlerte ?? existante.seuilAlerte,
        uniteVente: input.uniteVente !== undefined ? input.uniteVente : existante.uniteVente,
        caracteristiques: input.caracteristiques !== undefined ? input.caracteristiques : existante.caracteristiques,
      });
      enqueueProduitSync(boiteEnvoiRepository, produitRepository.findById(varianteId)!, "update");
      return { success: true };
    }
  );

  // --- Catégories / sous-catégories / champs suggérés (fondations quincaillerie, Phase 2) ---
  // Phase 5 (référentiel commun) — catégories/sous-catégories/champs
  // sont désormais synchronisées au serveur (enfilage dans boite_envoi
  // après chaque création/modification/suppression ci-dessous) ; ce
  // commentaire remplace la décision antérieure ("catégories locales à
  // chaque poste"), explicitement révisée par cette phase.
  ipcMain.handle("catalogue:listCategories", () => {
    if (!categorieRepository) return [];
    const compteurs = categorieRepository.compterModelesParCategorie();
    return categorieRepository.list().map((c) => ({ ...c, nombreProduits: compteurs[c.id] ?? 0 }));
  });

  ipcMain.handle("catalogue:creerCategorie", (_e, input: { nom: string; imageDataUrl?: string | null; ordre?: number }) => {
    if (!categorieRepository) return { success: false, message: "CategorieRepository non disponible." };
    const id = categorieRepository.create(input);
    const categorie = categorieRepository.findById(id);
    if (categorie) enqueueCategorieSync(boiteEnvoiRepository, categorie, "create");
    return { success: true, id };
  });

  ipcMain.handle("catalogue:modifierCategorie", (_e, id: string, input: { nom?: string; imageDataUrl?: string | null; ordre?: number }) => {
    if (!categorieRepository) return { success: false, message: "CategorieRepository non disponible." };
    categorieRepository.update(id, input);
    const categorie = categorieRepository.findById(id);
    if (categorie) enqueueCategorieSync(boiteEnvoiRepository, categorie, "update");
    return { success: true };
  });

  ipcMain.handle("catalogue:supprimerCategorie", (_e, id: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    if (!categorieRepository) return { success: false, message: "CategorieRepository non disponible." };
    // Phase 5 (référentiel commun), sous-phase 5.6 — garde bloquante LOCALE
    // uniquement : une suppression REÇUE d'un autre poste (tombstone via
    // creerDepuisServeur) ne passe jamais par ce handler IPC, donc n'est
    // jamais soumise à cette garde (voir §D du cahier des charges).
    if (!sousCategorieRepository) return { success: false, message: "SousCategorieRepository non disponible." };
    if (sousCategorieRepository.listByCategorie(id).length > 0) {
      return { success: false, message: "Cette catégorie contient encore des sous-catégories actives : déplacez-les ou supprimez-les d'abord." };
    }
    categorieRepository.softDelete(id, session.userId);
    const categorie = categorieRepository.findById(id);
    if (categorie) enqueueCategorieSync(boiteEnvoiRepository, categorie, "delete");
    return { success: true };
  });

  ipcMain.handle("catalogue:listSousCategories", (_e, categorieId?: string) => {
    if (!sousCategorieRepository) return [];
    const toutes = categorieId ? sousCategorieRepository.listByCategorie(categorieId) : sousCategorieRepository.list();
    // BUG À ÉVITER ("Carreaux (0)") : compteur toujours calculé réellement, avec ou sans filtre de catégorie.
    const compteurs = sousCategorieRepository.compterModelesParSousCategorie(categorieId);
    return toutes.map((sc) => ({ ...sc, nombreProduits: compteurs[sc.id] ?? 0 }));
  });

  ipcMain.handle("catalogue:creerSousCategorie", (_e, input: { categorieId: string; nom: string; ordre?: number }) => {
    if (!sousCategorieRepository) return { success: false, message: "SousCategorieRepository non disponible." };
    const id = sousCategorieRepository.create(input);
    enqueueSousCategorieApresEcriture(id, "create");
    return { success: true, id };
  });

  ipcMain.handle("catalogue:modifierSousCategorie", (_e, id: string, input: { nom?: string; ordre?: number }) => {
    if (!sousCategorieRepository) return { success: false, message: "SousCategorieRepository non disponible." };
    sousCategorieRepository.update(id, input);
    enqueueSousCategorieApresEcriture(id, "update");
    return { success: true };
  });

  ipcMain.handle("catalogue:supprimerSousCategorie", (_e, id: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    if (!sousCategorieRepository) return { success: false, message: "SousCategorieRepository non disponible." };
    // Phase 5 (référentiel commun), sous-phase 5.6 — garde bloquante LOCALE
    // uniquement (voir le commentaire équivalent sur catalogue:supprimerCategorie
    // ci-dessus). Les produits associés sont protégés par CETTE MÊME garde
    // (un produit ne peut exister sans modèle actif) — jamais une deuxième
    // règle redondante (voir ModeleRepository.existeModeleActifPourSousCategorie).
    if (!modeleRepository) return { success: false, message: "ModeleRepository non disponible." };
    if (modeleRepository.existeModeleActifPourSousCategorie(id)) {
      return { success: false, message: "Cette sous-catégorie contient encore des modèles actifs : déplacez-les ou supprimez-les d'abord." };
    }
    sousCategorieRepository.softDelete(id, session.userId);
    enqueueSousCategorieApresEcriture(id, "delete");
    return { success: true };
  });

  /**
   * Phase 5 (référentiel commun) — relit systématiquement la sous-
   * catégorie ET sa configuration d'unités à jour AU MOMENT de
   * l'enfilage (jamais une valeur mise en cache), pour les 5 handlers qui
   * modifient une sous-catégorie, directement ou via sa configuration
   * d'unités (`catalogue:definirUnitesSousCategorie`/
   * `catalogue:reinitialiserUnitesSousCategorie` ci-dessous) — évite de
   * dupliquer cette logique à chaque site d'appel.
   */
  function enqueueSousCategorieApresEcriture(sousCategorieId: string, operation: "create" | "update" | "delete"): void {
    if (!sousCategorieRepository) return;
    const sousCategorie = sousCategorieRepository.findById(sousCategorieId);
    if (!sousCategorie) return;
    const unitesAutorisees = sousCategorieUniteRepository ? unitesAutoriseesPourPayload(sousCategorieUniteRepository.obtenirConfiguration(sousCategorieId)) : null;
    enqueueSousCategorieSync(boiteEnvoiRepository, sousCategorie, unitesAutorisees, operation);
  }

  /**
   * Champs de caractéristiques suggérés par sous-catégorie —
   * `catalogue:listChampsSousCategories` (pluriel, SANS argument) renvoie
   * TOUS les champs groupés par sous-catégorie en un seul appel — évite
   * un aller-retour IPC par sous-catégorie quand le Renderer doit réagir
   * à un changement de sélection (voir ProduitsScreen, fusionnerCaracteristiquesSuggerees).
   */
  ipcMain.handle("catalogue:listChampsSousCategories", () => {
    if (!sousCategorieChampRepository) return {};
    return sousCategorieChampRepository.listGroupesParSousCategorie();
  });

  ipcMain.handle(
    "catalogue:creerChampSousCategorie",
    (
      _e,
      input: {
        sousCategorieId: string;
        nom: string;
        // Fondations quincaillerie (Phase 3 bis).
        type?: "texte" | "nombre" | "liste";
        obligatoire?: boolean;
        valeursAutorisees?: string[] | null;
        uniteMesure?: string | null;
        role?: "descriptif" | "physique" | "calcul" | null;
      }
    ) => {
      if (!sousCategorieChampRepository) return { success: false, message: "SousCategorieChampRepository non disponible." };
      const existants = sousCategorieChampRepository.listBySousCategorie(input.sousCategorieId);
      if (existants.some((c) => c.nom.trim().toLowerCase() === input.nom.trim().toLowerCase())) {
        return { success: false, message: "Ce champ existe déjà pour cette sous-catégorie." };
      }
      const id = sousCategorieChampRepository.create({ ...input, ordre: existants.length });
      const champ = sousCategorieChampRepository.findById(id);
      if (champ) enqueueSousCategorieChampSync(boiteEnvoiRepository, champ, "create");
      return { success: true, id };
    }
  );

  ipcMain.handle(
    "catalogue:modifierChampSousCategorie",
    (
      _e,
      id: string,
      input: {
        nom?: string;
        type?: "texte" | "nombre" | "liste";
        obligatoire?: boolean;
        valeursAutorisees?: string[] | null;
        uniteMesure?: string | null;
        role?: "descriptif" | "physique" | "calcul" | null;
        ordre?: number;
      }
    ) => {
      if (!sousCategorieChampRepository) return { success: false, message: "SousCategorieChampRepository non disponible." };
      sousCategorieChampRepository.update(id, input);
      const champ = sousCategorieChampRepository.findById(id);
      if (champ) enqueueSousCategorieChampSync(boiteEnvoiRepository, champ, "update");
      return { success: true };
    }
  );

  ipcMain.handle("catalogue:supprimerChampSousCategorie", (_e, id: string, confirmationObligatoire?: boolean) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    if (!sousCategorieChampRepository) return { success: false, message: "SousCategorieChampRepository non disponible." };
    const champ = sousCategorieChampRepository.findById(id);
    if (!champ) return { success: false, message: "Champ introuvable." };
    // Phase 5 (référentiel commun), sous-phase 5.6 — un champ OBLIGATOIRE
    // exige une confirmation explicite distincte, transmise par
    // l'appelant IPC (jamais déduite côté serveur/main) : refus sans
    // modification tant qu'elle n'est pas fournie. Un champ facultatif
    // conserve le comportement de suppression normal (tombstone direct).
    if (champ.obligatoire && confirmationObligatoire !== true) {
      return {
        success: false,
        requiresConfirmation: true,
        message: "Ce champ est obligatoire : confirmez explicitement sa suppression. Les valeurs déjà enregistrées sur les produits existants ne seront pas supprimées.",
      };
    }
    // Tombstone (jamais une suppression physique, voir
    // SousCategorieChampRepository.delete) : le champ reste lisible
    // AVANT comme APRÈS l'écriture (deleted_at/deleted_by renseignés,
    // toutes les autres propriétés préservées) — relu une seconde fois
    // pour enfiler l'état exact matérialisé (updatedAt réellement
    // persisté, pas une approximation locale).
    sousCategorieChampRepository.delete(id, session.userId);
    const champSupprime = sousCategorieChampRepository.findById(id);
    if (champSupprime) enqueueSousCategorieChampSync(boiteEnvoiRepository, champSupprime, "delete");
    return { success: true };
  });

  /**
   * Configuration des unités de vente autorisées par sous-catégorie —
   * fondations quincaillerie (Phase 3 bis). Même principe que les
   * champs ci-dessus : `catalogue:listUnitesSousCategories` (pluriel,
   * sans argument) renvoie tout en un seul aller-retour.
   */
  ipcMain.handle("catalogue:listUnitesSousCategories", () => {
    if (!sousCategorieUniteRepository) return {};
    return sousCategorieUniteRepository.listGroupesParSousCategorie();
  });

  ipcMain.handle("catalogue:definirUnitesSousCategorie", (_e, sousCategorieId: string, unites: UniteVente[]) => {
    if (!sousCategorieUniteRepository) return { success: false, message: "SousCategorieUniteRepository non disponible." };
    try {
      sousCategorieUniteRepository.definir(sousCategorieId, unites);
      // Point critique Phase 5 (référentiel commun) — identifié par
      // l'audit : ce gestionnaire modifie la sous-catégorie (via
      // `sous_categories.unites_configurees`/`updated_at`, voir
      // SousCategorieUniteRepository.definir) SANS passer par
      // `sousCategorieRepository.update()` — un enfilage par analogie
      // avec les 3 gestionnaires "sous-catégorie" ci-dessus l'aurait
      // manqué. Traité ici explicitement, jamais supposé couvert.
      enqueueSousCategorieApresEcriture(sousCategorieId, "update");
      return { success: true };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Configuration invalide." };
    }
  });

  ipcMain.handle("catalogue:reinitialiserUnitesSousCategorie", (_e, sousCategorieId: string) => {
    if (!sousCategorieUniteRepository) return { success: false, message: "SousCategorieUniteRepository non disponible." };
    sousCategorieUniteRepository.reinitialiser(sousCategorieId);
    // Même point critique que ci-dessus — réinitialiser la configuration
    // modifie aussi `sous_categories.updated_at`, jamais un enfilage
    // implicite.
    enqueueSousCategorieApresEcriture(sousCategorieId, "update");
    return { success: true };
  });

  /**
   * Phase 5 (référentiel commun), sous-phase 5.7 — diagnostic des
   * doublons potentiels, STRICTEMENT en lecture seule (aucune écriture,
   * aucune synchronisation déclenchée). Interroge les repositories
   * locaux ACTIFS (chaque `list()` filtre déjà `deleted_at IS NULL`,
   * jamais un deuxième filtre ici) : une fois le rattrapage proactif et
   * le catch-up habituel exécutés sur un poste, ces tables locales
   * reflètent l'état fusionné de TOUS les postes (chaque entité garde
   * son id d'origine — jamais une fusion par upsert entre deux id
   * différents), ce qui rend un diagnostic purement LOCAL suffisant
   * pour détecter un doublon créé indépendamment sur deux postes.
   *
   * Règles de rapprochement (§3.2 du cahier des charges) : comparaison
   * du nom insensible à la casse (`domainCatalogue.detecterDoublonsPotentiels`,
   * module pur sans dépendance base de données) ; jamais deux occurrences
   * partageant le même id ; les sous-catégories sont rapprochées
   * UNIQUEMENT au sein d'une même catégorie parente (`cleScope`). Pour
   * les produits, c'est `reference` qui sert de "nom" comparé — jamais
   * `motif` (dénormalisé depuis le modèle, intentionnellement partagé
   * par toutes les variantes d'un même modèle : l'utiliser produirait un
   * faux-positif systématique sur chaque modèle multi-format).
   */
  ipcMain.handle("catalogue:diagnostiquerDoublonsReferentiel", () => {
    const categories = categorieRepository?.list() ?? [];
    const groupesCategories = domainCatalogue.detecterDoublonsPotentiels(categories);

    const sousCategories = sousCategorieRepository?.list() ?? [];
    const categorieNomParId = new Map(categories.map((c) => [c.id, c.nom]));
    const groupesSousCategories = domainCatalogue.detecterDoublonsPotentiels(sousCategories, (sc) => sc.categorieId);

    const modeles = modeleRepository?.list() ?? [];
    const modelesComparables = modeles.map((m) => ({ ...m, nom: m.motif }));
    const groupesModeles = domainCatalogue.detecterDoublonsPotentiels(modelesComparables);

    // Phase 5 (référentiel commun), sous-phase 5.7 — le "nom" comparé pour
    // un produit est le `motif` (dénormalisé depuis le modèle, voir
    // commentaire plus haut) : `reference` est délibérément EXCLU malgré
    // son nom — une contrainte UNIQUE réelle (`idx_produits_reference_actif`,
    // voir schema.sql) empêche structurellement deux produits ACTIFS d'un
    // même poste de jamais partager la même référence, rendant ce champ
    // impropre à toute détection de doublon. Pour ne jamais produire un
    // faux-positif sur les variantes LÉGITIMES d'un même modèle (qui
    // partagent intentionnellement le même motif ET le même modeleId),
    // un seul produit REPRÉSENTANT est retenu par modèle avant comparaison
    // — jamais un par variante.
    const modeleInfoParId = new Map(modeles.map((m) => [m.id, { motif: m.motif, type: m.type }]));
    const produitsActifs = produitRepository.list();
    const representantParModele = new Map<string, (typeof produitsActifs)[number]>();
    for (const p of produitsActifs) {
      const cleModele = p.modeleId ?? p.id; // sans modèle (catalogue legacy) : chaque produit reste son propre représentant.
      if (!representantParModele.has(cleModele)) representantParModele.set(cleModele, p);
    }
    const produitsComparables = [...representantParModele.values()].map((p) => ({ ...p, nom: p.motif }));
    const groupesProduits = domainCatalogue.detecterDoublonsPotentiels(produitsComparables);

    return {
      categories: groupesCategories.map((g) => ({
        typeEntite: "categorie" as const,
        nom: g.nom,
        occurrences: g.occurrences.map((o) => ({ id: o.id, createdAt: o.createdAt ?? null, updatedAt: o.updatedAt ?? null })),
      })),
      sousCategories: groupesSousCategories.map((g) => ({
        typeEntite: "sous_categorie" as const,
        nom: g.nom,
        occurrences: g.occurrences.map((o) => ({
          id: o.id,
          createdAt: o.createdAt ?? null,
          updatedAt: o.updatedAt ?? null,
          categorieParenteId: o.categorieId,
          categorieParenteNom: categorieNomParId.get(o.categorieId) ?? null,
        })),
      })),
      modeles: groupesModeles.map((g) => ({
        typeEntite: "modele" as const,
        nom: g.nom,
        occurrences: g.occurrences.map((o) => ({ id: o.id, createdAt: o.createdAt ?? null, updatedAt: o.updatedAt ?? null, type: o.type })),
      })),
      produits: groupesProduits.map((g) => ({
        typeEntite: "produit" as const,
        nom: g.nom,
        occurrences: g.occurrences.map((o) => ({
          id: o.id,
          createdAt: o.createdAt ?? null,
          updatedAt: o.updatedAt ?? null,
          modeleId: o.modeleId,
          modeleMotif: o.modeleId ? (modeleInfoParId.get(o.modeleId)?.motif ?? null) : null,
          taille: o.taille,
          prix: o.prix,
        })),
      })),
    };
  });

  /**
   * Recherche globale catégories + sous-catégories + produits (motif,
   * référence, marque) — fondations quincaillerie (Phase 2). Recherche
   * simple (LIKE), suffisante pour les volumes réels de l'app.
   */
  ipcMain.handle("catalogue:rechercherGlobal", (_e, terme: string) => {
    const t = terme.trim();
    if (!t || !categorieRepository || !sousCategorieRepository) {
      return { categories: [], produits: [] };
    }
    const aiguille = `%${t}%`;

    const categoriesTrouvees = categorieRepository
      .list()
      .filter((c) => c.nom.toLowerCase().includes(t.toLowerCase()))
      .map((c) => ({ id: c.id, nom: c.nom }));

    const sousCategoriesParNom = sousCategorieRepository.list().filter((sc) => sc.nom.toLowerCase().includes(t.toLowerCase()));
    for (const sc of sousCategoriesParNom) {
      if (!categoriesTrouvees.some((c) => c.id === sc.categorieId)) {
        const parente = categorieRepository.findById(sc.categorieId);
        if (parente) categoriesTrouvees.push({ id: parente.id, nom: parente.nom });
      }
    }

    const produitsTrouves = produitRepository
      .listParMotifReferenceOuMarque(aiguille)
      .slice(0, 20)
      .map((p) => ({ id: p.id, modeleId: p.modeleId, motif: p.motif, reference: p.reference, taille: p.taille }));

    return { categories: categoriesTrouvees, produits: produitsTrouves };
  });

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

  ipcMain.handle("stock:entree", async (_e, produitId: string, emplacementId: string, quantite: number) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      await stockService.enregistrerEntree(produitId, emplacementId, quantite, session.userId);
      return { success: true };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  ipcMain.handle("stock:sortie", async (_e, produitId: string, emplacementId: string, quantite: number) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      await stockService.enregistrerSortie(produitId, emplacementId, quantite, session.userId);
      return { success: true };
    } catch (err) {
      return { success: false, reason: mapStockError(err) };
    }
  });

  ipcMain.handle("stock:transfert", async (_e, produitId: string, sourceId: string, destinationId: string, quantite: number) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      await stockService.enregistrerTransfert(produitId, sourceId, destinationId, quantite, session.userId);
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
  ipcMain.handle("ventes:create", async (_e, input: VenteInput) => {
    const session = sessionManager.get();
    if (!session) return { success: false, reason: { code: "UNKNOWN" as const, message: "Session expirée. Veuillez vous reconnecter." } };
    try {
      // L'auteur réel de la vente est TOUJOURS celui de la session
      // authentifiée, jamais une valeur transmise par le Renderer — seul
      // `vendeurNomManuel` (précision d'affichage, pas d'identité) reste
      // du ressort du Renderer.
      const result = await venteService.enregistrerVente({ ...input, vendeurUtilisateurId: session.userId });
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

      const { resultats, totalResultats } = factureRepository.listAvecVendeurPagine({
        ...filtres,
        vendeurUtilisateurId: vendeurSecurise,
        // Même garde que vendeurSecurise ci-dessus : seul un
        // Administrateur peut rechercher par nom de vendeur, jamais un
        // Gérant (voir le commentaire de listAvecVendeurPagine).
        inclureVendeurDansRecherche: session?.role === "administrateur",
      });
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

  // Correction "choix du modèle d'impression" (2026-11-13) — "a5" par
  // défaut si l'appelant n'en précise pas. Fondations quincaillerie
  // (Phase 4) : "a5" (format indépendant) retiré, remplacé par
  // "a4-paysage" (deux exemplaires A5 construits dans le PDF) — voir
  // FacturesScreen.tsx (sélecteur A4 paysage/A4 portrait).
  ipcMain.handle("factures:genererPdf", async (_e, factureId: string, format?: "a4" | "a4-paysage") => {
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
        format,
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
      const repartitionDepots = factureRepository.getRepartitionDepots(factureId);
      const identite = facture.identiteSnapshot ?? parametresRepository.getIdentite();
      const vendeurNomAffiche = resoudreVendeurAffiche(facture, identite);
      const chemin = await genererDocumentInternePdf({ facture, identite, vendeurNomAffiche, lignes, repartitionDepots });
      return { success: true, chemin, nomSuggere: `${facture.numero}-document-interne.pdf` };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[factures] génération document interne impossible :", err);
      return { success: false, message: "Impossible de générer le document interne." };
    }
  });

  /**
   * Bilan d'activité (2026-10-21) — réservé à l'Administrateur
   * (checkAdminGuard, même garde que backup/utilisateurs). `debut`/`fin`
   * sont des bornes ISO [debut, fin] inclusives, choisies par
   * BilanScreen.tsx (boutons rapides ou plage personnalisée) — jamais
   * recalculées ici, pour que l'écran et le PDF portent STRICTEMENT sur
   * la même période.
   */
  function calculerBilan(debut: string, fin: string) {
    const emplacements = emplacementRepository.list();
    // Même décision que le dashboard : SHOP n'a pas de stock (Phase 2 §3/§7).
    const depots = emplacements.filter((e) => !e.estPointDeVente);
    const depotIds = depots.map((e) => e.id);

    // Tableau détaillé par produit (2026-10-22) — une seule requête par
    // dépôt (jamais une par produit) pour construire la matrice
    // produit × dépôt, voir stockRepository.listByEmplacement. "Vendu"/
    // "Sortie" viennent d'une seule requête groupée côté
    // MouvementRepository, jamais recalculées produit par produit.
    const stockParDepot = new Map(depots.map((e) => [e.id, new Map(stockRepository.listByEmplacement(e.id).map((r) => [r.produitId, r.quantite]))]));
    const ventesSortiesParProduit = mouvementRepository.detailVenteSortieParProduitEntre(debut, fin);
    const detailProduits = produitRepository.list().map((p) => {
      const activite = ventesSortiesParProduit.get(p.id);
      return {
        produitId: p.id,
        taille: p.taille,
        reference: p.reference,
        carreauxParCarton: p.carreauxParCarton,
        stockParEmplacement: depots.map((e) => ({ emplacementId: e.id, cartons: stockParDepot.get(e.id)?.get(p.id) ?? 0 })),
        vendu: activite?.vendu ?? 0,
        sortie: activite?.sortie ?? 0,
      };
    });

    return {
      ventes: factureRepository.bilanVentesEntre(debut, fin),
      topProduits: factureRepository.topProduitsVendusEntre(debut, fin, 10),
      // Fondations quincaillerie (Phase 4) — correction "le bilan
      // additionne des quantités d'unités différentes" : jamais une
      // somme brute, toujours ventilée par unité de vente réelle du
      // produit (voir StockRepository/MouvementRepository ci-dessus).
      mouvements: {
        entrees: mouvementRepository.sommeQuantiteParTypeEtUniteEntre("entree", debut, fin),
        sorties: mouvementRepository.sommeQuantiteParTypeEtUniteEntre("sortie", debut, fin),
      },
      stockParEmplacement: depots.map((e) => ({
        emplacementId: e.id,
        nom: e.nom,
        parUnite: stockRepository.getQuantitesParUniteParEmplacement(e.id),
      })),
      produitsSousSeuilCount: produitRepository.countSousSeuilDepots(depotIds),
      promotionsActivesPendantPeriode: promotionRepository ? promotionRepository.compterChevauchantPeriode(debut, fin) : 0,
      depots: depots.map((e) => ({ id: e.id, nom: e.nom })),
      detailProduits,
    };
  }

  ipcMain.handle("bilan:generer", (_e, input: { debut: string; fin: string }) => {
    const guard = checkAdminGuard(sessionManager);
    if (!guard.ok) return { success: false as const, message: guard.message };
    return { success: true as const, ...calculerBilan(input.debut, input.fin) };
  });

  /**
   * CORRECTION (2026-10-28, "le bilan dans l'appli ne correspond pas au
   * bilan sur le PDF") : `bilan:genererPdf` ne recalcule PLUS jamais le
   * bilan lui-même — il reçoit désormais EXACTEMENT les données déjà
   * affichées à l'écran (`donnees`, renvoyées par `bilan:generer` et
   * conservées dans l'état de BilanScreen.tsx) et se contente de les
   * mettre en page. Avant cette correction, chaque bouton relançait sa
   * propre requête en direct (ventes/mouvements/stock) ; toute activité
   * survenue entre les deux clics (une vente, ou désormais une
   * synchronisation quasi instantanée depuis un autre poste) faisait
   * diverger le PDF de ce qui restait affiché à l'écran — jamais un bug
   * aléatoire, mais une conséquence directe de deux requêtes prises à
   * deux instants différents.
   */
  ipcMain.handle("bilan:genererPdf", async (_e, input: { debut: string; fin: string; periodeLibelle: string; donnees: ReturnType<typeof calculerBilan> }) => {
    const guard = checkAdminGuard(sessionManager);
    if (!guard.ok) return { success: false, message: guard.message };
    try {
      const identite = parametresRepository.getIdentite();
      const chemin = await genererBilanPdf({
        identite,
        periodeLibelle: input.periodeLibelle,
        ventes: input.donnees.ventes,
        topProduits: input.donnees.topProduits,
        mouvements: input.donnees.mouvements,
        stockParEmplacement: input.donnees.stockParEmplacement,
        produitsSousSeuilCount: input.donnees.produitsSousSeuilCount,
        promotionsActivesPendantPeriode: input.donnees.promotionsActivesPendantPeriode,
        depots: input.donnees.depots,
        detailProduits: input.donnees.detailProduits,
      });
      return { success: true, chemin, nomSuggere: `bilan-${input.debut.slice(0, 10)}-au-${input.fin.slice(0, 10)}.pdf` };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[bilan] génération PDF impossible :", err);
      return { success: false, message: "Impossible de générer le bilan." };
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
      enqueueEmplacementSync(boiteEnvoiRepository, emplacementRepository.findById(id)!, "update");
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
      enqueueEmplacementSync(boiteEnvoiRepository, emplacementRepository.findById(id)!, "create");
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
      enqueueEmplacementSync(boiteEnvoiRepository, emplacementRepository.findById(id)!, "update");
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
    enqueueEmplacementSync(boiteEnvoiRepository, emplacementRepository.findById(id)!, "update");
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
      // Capturé AVANT la suppression — plus rien à lire localement une
      // fois la ligne physiquement supprimée, mais le serveur a besoin
      // du dernier état connu (nom/type/ville) pour journaliser la
      // suppression de façon cohérente avec les autres opérations.
      const emplacement = emplacementRepository.findById(id);
      emplacementRepository.supprimerDefinitivement(id);
      if (emplacement) enqueueEmplacementSync(boiteEnvoiRepository, emplacement, "delete");
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

  ipcMain.handle("factures:annuler", async (_e, factureId: string, motif: string) => {
    const session = sessionManager.get();
    if (!session) return { success: false, message: "Session expirée." };
    try {
      await venteService.annulerVente(factureId, motif, session.userId);
      return { success: true };
    } catch (err) {
      // Correction "travailler en parallèle sur le même stock" (2026-10-22) :
      // réutilise mapStockError pour que ConnexionRequiseError (serveur
      // injoignable) affiche aussi son message réel, jamais le générique.
      const message = err instanceof VenteValidationError ? err.message : mapStockError(err).message;
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
    // Correction "voir le revenu journalier et mensuel" (2026-10-21) — "Mon
    // CA du mois" (Gérant) reste calculé depuis la fenêtre en mémoire déjà
    // chargée ci-dessus (comme mesVentesAujourdhui/monChiffreAffaires) :
    // le volume de ventes d'UN SEUL vendeur sur un mois ne dépasse
    // raisonnablement jamais 200 factures, contrairement au CA GLOBAL
    // (voir factureRepository.sommeTotalJourCourant/MoisCourant ci-dessous,
    // qui interrogent la base entière, jamais limitées à cette fenêtre).
    const moisCourant = new Date().toISOString().slice(0, 7);
    const facturesMoisCourant = factures.filter((f) => f.date.slice(0, 7) === moisCourant);

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
      caJour: factureRepository.sommeTotalJourCourant(),
      caMois: factureRepository.sommeTotalMoisCourant().total,
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
      // Correction "liste des alertes incomplète" (2026-10-22) — toutes les
      // alertes sont renvoyées (plus de troncature à 6) : l'écran affiche
      // désormais la liste complète dans une zone à défilement.
      produitsSousSeuilListe: produitRepository.listSousSeuilDepots(depotIds),

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
      monChiffreAffairesMois: facturesMoisCourant.filter((f) => f.vendeurUtilisateurId === userId).reduce((s, f) => s + f.total, 0),
      mesFacturesAujourdhuiCount: facturesAujourdhui.filter((f) => f.vendeurUtilisateurId === userId).length,
      mesEntrees: mouvementRepository.sommeQuantiteParType("entree", userId),
      mesSorties: mouvementRepository.sommeQuantiteParType("sortie", userId),
    };
  });

  /**
   * Écran "Alertes de stock" cliquable (correction TB, 2026-11-13) — même
   * liste que `produitsSousSeuilListe` ci-dessus (même garde : session
   * requise, aucun rôle spécifique, comme `dashboard:summary`), enrichie
   * des dernières dates de vente/entrée/sortie par produit pour l'export
   * demandé. Toujours recalculée en direct, jamais mise en cache — la
   * liste peut changer entre l'ouverture du dashboard et le clic.
   */
  ipcMain.handle("alertesStock:list", () => {
    const session = sessionManager.get();
    if (!session) return [];
    const emplacements = emplacementRepository.list();
    const depots = emplacements.filter((e) => !e.estPointDeVente);
    const depotIds = depots.map((e) => e.id);
    const produits = produitRepository.listSousSeuilDepots(depotIds);
    const dates = mouvementRepository.dernieresDatesParProduit(produits.map((p) => p.id));
    return produits.map((p) => ({
      ...p,
      derniereVente: dates.get(p.id)?.derniereVente ?? null,
      derniereEntree: dates.get(p.id)?.derniereEntree ?? null,
      derniereSortie: dates.get(p.id)?.derniereSortie ?? null,
    }));
  });

  /**
   * Export CSV des alertes de stock — reçoit EXACTEMENT les lignes déjà
   * affichées à l'écran (même principe que `bilan:genererPdf`, voir son
   * commentaire : jamais une nouvelle requête qui pourrait diverger de ce
   * que l'utilisateur voit au moment du clic).
   */
  ipcMain.handle(
    "alertesStock:exporterCsv",
    async (
      _e,
      lignes: { reference: string; taille: string; type: string; stock: number; seuilAlerte: number; derniereVente: string | null; derniereEntree: string | null; derniereSortie: string | null }[]
    ) => {
      const fenetre = BrowserWindow.getFocusedWindow();
      const nomSuggere = `alertes-stock-${new Date().toISOString().slice(0, 10)}.csv`;
      const options = { title: "Exporter les alertes de stock", defaultPath: nomSuggere, filters: [{ name: "CSV", extensions: ["csv"] }] };
      const result = fenetre ? await dialog.showSaveDialog(fenetre, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      try {
        const echapper = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const entetes = ["Référence", "Type", "Taille", "Stock (cartons)", "Seuil d'alerte", "Dernière vente", "Dernière entrée", "Dernière sortie"];
        const corps = lignes.map((l) =>
          [l.reference, l.type, l.taille, String(l.stock), String(l.seuilAlerte), l.derniereVente ?? "", l.derniereEntree ?? "", l.derniereSortie ?? ""]
            .map(echapper)
            .join(";")
        );
        // BOM UTF-8 : sans lui, Excel (Windows) affiche les accents de
        // l'en-tête ("Référence", "Dernière…") comme des caractères
        // corrompus — comportement déjà connu de ce tableur, pas une
        // erreur d'encodage de notre côté.
        await writeFile(result.filePath, "﻿" + [entetes.map(echapper).join(";"), ...corps].join("\r\n"), "utf-8");
        return { success: true, chemin: result.filePath };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[alertesStock] export CSV impossible :", err);
        return { success: false, message: "Impossible d'exporter le fichier CSV." };
      }
    }
  );
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
/**
 * Correction "visibilité croisée Factures/Historique entre postes"
 * (2026-10-27) — même mécanisme générique que `enqueueModeleSync`/
 * `enqueueProduitSync` ci-dessous : un dépôt est une projection mutable
 * (voir core/emplacementStore.ts côté API), jamais le journal
 * d'événements immuables.
 */
export function enqueueEmplacementSync(boiteEnvoiRepository: BoiteEnvoiRepository, emplacement: Emplacement, operation: "create" | "update" | "delete"): void {
  boiteEnvoiRepository.creer("emplacement", emplacement.id, {
    operation,
    emplacementId: emplacement.id,
    nom: emplacement.nom,
    type: emplacement.type,
    ville: emplacement.ville,
    estPointDeVente: emplacement.estPointDeVente,
    actif: emplacement.actif,
    updatedAt: emplacement.updatedAt,
  });
}

/**
 * Cohérence métier du catalogue (unités de vente, caractéristiques
 * obligatoires) — fondations quincaillerie (Phase 3 bis). Fonctions
 * top-level exportées (même principe que `enqueueModeleSync`/
 * `enqueueProduitSync` ci-dessous) : testables directement, sans mocker
 * `ipcMain`/`electron` (jamais fait dans ce projet). Une sous-catégorie
 * absente/`null` (produit non classé) n'est jamais restreinte —
 * configuration par défaut, comportement historique.
 */
export function configurationUnitesPourSousCategorie(
  sousCategorieUniteRepository: SousCategorieUniteRepository | undefined,
  sousCategorieId: string | null | undefined
): ConfigurationUnitesSousCategorie {
  if (!sousCategorieId || !sousCategorieUniteRepository) return { configuree: false, unites: [] };
  return sousCategorieUniteRepository.obtenirConfiguration(sousCategorieId);
}

export function champsPourSousCategorie(sousCategorieChampRepository: SousCategorieChampRepository | undefined, sousCategorieId: string | null | undefined) {
  if (!sousCategorieId || !sousCategorieChampRepository) return [];
  return sousCategorieChampRepository.listBySousCategorie(sousCategorieId);
}

/**
 * Valide UNE variante (unité + caractéristiques obligatoires) pour une
 * sous-catégorie donnée — retourne le message d'erreur si invalide,
 * `null` sinon. Centralise les deux vérifications pour ne jamais les
 * dupliquer entre création de modèle et ajout de variante (toutes deux
 * INCONDITIONNELLES, contrairement à une modification — voir
 * `catalogue:modifierVariante`/`catalogue:modifierModele`, qui
 * n'appliquent cette même validation que sur un changement effectif,
 * via `domainCatalogue.valeurEffectivementModifiee`).
 */
export function erreurValidationVariante(
  sousCategorieUniteRepository: SousCategorieUniteRepository | undefined,
  sousCategorieChampRepository: SousCategorieChampRepository | undefined,
  sousCategorieId: string | null | undefined,
  uniteVente: UniteVente | null | undefined,
  caracteristiques: string | null | undefined
): string | null {
  const config = configurationUnitesPourSousCategorie(sousCategorieUniteRepository, sousCategorieId);
  try {
    domainCatalogue.validerUniteCompatible(uniteVente ?? "carton", config);
  } catch (err) {
    return err instanceof Error ? err.message : "Unité de vente incompatible.";
  }
  const champs = champsPourSousCategorie(sousCategorieChampRepository, sousCategorieId);
  try {
    domainCatalogue.validerCaracteristiquesObligatoires(champs, parseCaracteristiques(caracteristiques ?? null));
  } catch (err) {
    return err instanceof Error ? err.message : "Caractéristiques obligatoires manquantes.";
  }
  return null;
}

export function enqueueModeleSync(boiteEnvoiRepository: BoiteEnvoiRepository, modele: ModeleProduit, operation: "create" | "update" | "delete"): void {
  boiteEnvoiRepository.creer("modele", modele.id, {
    operation,
    modeleId: modele.id,
    motif: modele.motif,
    type: modele.type,
    ordreVitrine: modele.ordreVitrine,
    // Phase 5 (référentiel commun), sous-phase 5.5 : absents/null tant que le modèle n'a pas été classé/marqué.
    sousCategorieId: modele.sousCategorieId ?? null,
    marque: modele.marque ?? null,
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
    // Phase 5 (référentiel commun), sous-phase 5.5 : absents/null tant que le produit n'a pas été renseigné.
    uniteVente: produit.uniteVente ?? null,
    caracteristiques: produit.caracteristiques ?? null,
    marque: produit.marque ?? null,
    updatedAt: produit.updatedAt,
  });
}

/**
 * Phase 5 (référentiel commun) — même mécanisme générique que
 * `enqueueModeleSync`/`enqueueProduitSync` ci-dessus (payload construit
 * champ par champ, `boiteEnvoiRepository.creer(...)`), pour les 3
 * entités référentielles (catégorie, sous-catégorie, champ).
 */
export function enqueueCategorieSync(boiteEnvoiRepository: BoiteEnvoiRepository, categorie: Categorie, operation: "create" | "update" | "delete"): void {
  boiteEnvoiRepository.creer("categorie", categorie.id, {
    operation,
    categorieId: categorie.id,
    nom: categorie.nom,
    imageDataUrl: categorie.imageDataUrl,
    ordre: categorie.ordre,
    updatedAt: categorie.updatedAt,
  });
}

/**
 * `unitesAutorisees` : `null` si la sous-catégorie n'est pas configurée
 * (les 6 unités restent proposées par défaut), un tableau non vide sinon
 * — JAMAIS une opération indépendante (décision définitive,
 * PHASE_5_CAHIER_DES_CHARGES.md §4.6/§7.3) : transmise comme sous-objet
 * du payload de la sous-catégorie elle-même. L'appelant doit relire la
 * configuration au moment de l'enfilage (voir les 5 sites d'appel
 * ci-dessous), jamais une valeur mise en cache.
 */
export function enqueueSousCategorieSync(
  boiteEnvoiRepository: BoiteEnvoiRepository,
  sousCategorie: SousCategorie,
  unitesAutorisees: UniteVente[] | null,
  operation: "create" | "update" | "delete"
): void {
  boiteEnvoiRepository.creer("sous_categorie", sousCategorie.id, {
    operation,
    sousCategorieId: sousCategorie.id,
    categorieId: sousCategorie.categorieId,
    nom: sousCategorie.nom,
    ordre: sousCategorie.ordre,
    modelePhysique: sousCategorie.modelePhysique,
    unitesAutorisees,
    updatedAt: sousCategorie.updatedAt,
  });
}

export function enqueueSousCategorieChampSync(boiteEnvoiRepository: BoiteEnvoiRepository, champ: SousCategorieChamp, operation: "create" | "update" | "delete"): void {
  boiteEnvoiRepository.creer("sous_categorie_champ", champ.id, {
    operation,
    champId: champ.id,
    sousCategorieId: champ.sousCategorieId,
    nom: champ.nom,
    type: champ.type,
    obligatoire: champ.obligatoire,
    valeursAutorisees: champ.valeursAutorisees,
    uniteMesure: champ.uniteMesure,
    role: champ.role,
    ordre: champ.ordre,
    updatedAt: champ.updatedAt,
  });
}

/** Convertit `{configuree, unites}` (ConfigurationUnitesSousCategorie, voir SousCategorieUniteRepository) vers la forme transmise au serveur — jamais une logique dupliquée aux 5 sites d'appel. */
function unitesAutoriseesPourPayload(config: ConfigurationUnitesSousCategorie): UniteVente[] | null {
  return config.configuree ? config.unites : null;
}

type StockErrorReason = "INSUFFICIENT_STOCK" | "INVALID_QUANTITY" | "VALIDATION_ERROR" | "CONNEXION_REQUISE" | "UNKNOWN";

/**
 * Correction "erreur de vente générique et sans trace" (2026-10-27) —
 * jusqu'ici une erreur technique inattendue (ni stock insuffisant, ni
 * validation métier connue) affichait seulement "Une erreur inattendue
 * s'est produite", et `console.error` seul (invisible en pratique dans
 * un build packagé — aucune console accessible sur un poste de vente).
 * Impossible de diagnostiquer à distance ce qui avait réellement échoué.
 * Même principe que `app:reportRendererError` (ipc/index.ts) : écriture
 * best-effort dans un fichier, jamais bloquante, jamais une deuxième
 * erreur non gérée qui aggraverait le problème initial.
 */
function journaliserErreurTechnique(contexte: string, err: unknown): void {
  try {
    const dir = join(app.getPath("userData"), "logs");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ligne = `${JSON.stringify({
      date: new Date().toISOString(),
      contexte,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })}\n`;
    appendFileSync(join(dir, "erreurs-stock.log"), ligne);
  } catch {
    // Best-effort — ne doit jamais faire planter quoi que ce soit.
  }
}

function mapStockError(err: unknown): { code: StockErrorReason; message: string; available?: number; requested?: number } {
  if (err instanceof domainStock.InsufficientStockError) {
    return { code: "INSUFFICIENT_STOCK", message: err.message, available: err.available, requested: err.requested };
  }
  if (err instanceof domainStock.InvalidQuantityError) {
    return { code: "INVALID_QUANTITY", message: err.message };
  }
  // Correction "travailler en parallèle sur le même stock" (2026-10-22) —
  // la synchronisation est configurée mais le serveur central est
  // injoignable/en erreur : jamais confondu avec un stock insuffisant
  // (ValidationStockDistanteService.valider côté app).
  if (err instanceof ConnexionRequiseError) {
    return { code: "CONNEXION_REQUISE", message: err.message };
  }
  if (err instanceof VenteValidationError || err instanceof StockValidationError) {
    return { code: "VALIDATION_ERROR", message: err.message };
  }
  // eslint-disable-next-line no-console
  console.error("[metier] Erreur technique inattendue :", err);
  journaliserErreurTechnique("mapStockError", err);
  const detail = err instanceof Error && err.message ? err.message : "détail indisponible";
  return { code: "UNKNOWN", message: `Une erreur inattendue s'est produite : ${detail}. Merci de signaler ce message exact au support.` };
}
