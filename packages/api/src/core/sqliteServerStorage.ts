import Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import {
  slugify,
  type ServerStorage,
  type OperationRecue,
  type ResultatEnregistrement,
  type ResultatPull,
  type ModeleCataloguePayload,
  type ProduitCataloguePayload,
  type PromotionCataloguePayload,
  type ImageSyncPayload,
  type ModeleRow,
  type ProduitRow,
  type ImageRow,
  type PromotionRow,
  type IdentiteCataloguePayload,
  type IdentiteRow,
  type CompteCataloguePayload,
  type CompteRow,
  type DemandeValidationStock,
  type ResultatValidationStock,
  type LigneInitialisationStock,
  type LigneStockCentral,
  type EmplacementCataloguePayload,
  type EmplacementRow,
  type CompteCatchupRow,
  type PosteRow,
  type ResultatCreationPosteAnnexe,
} from "./serverStorage.js";

/**
 * Implémentation SQLite — développement et tests (`:memory:`), et
 * secours si `DATABASE_URL` n'est pas configurée. Comportement identique
 * à ce qui existait avant l'abstraction Bloc 1 (aucune régression
 * voulue) — seule la forme (classe, méthodes async) a changé.
 */
export class SqliteServerStorage implements ServerStorage {
  constructor(private readonly db: Database.Database) {
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS operations_synchronisees (
        curseur     INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id   TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        recu_le     TEXT NOT NULL,
        UNIQUE (entity_type, entity_id)
      );

      CREATE TABLE IF NOT EXISTS catalogue_modeles (
        id            TEXT PRIMARY KEY,
        motif         TEXT NOT NULL,
        type          TEXT NOT NULL,
        slug          TEXT NOT NULL,
        ordre_vitrine INTEGER,
        deleted_at    TEXT,
        updated_at    TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogue_modeles_slug ON catalogue_modeles (slug);

      CREATE TABLE IF NOT EXISTS catalogue_produits (
        id         TEXT PRIMARY KEY,
        modele_id  TEXT NOT NULL,
        taille     TEXT NOT NULL,
        taille_tri REAL NOT NULL,
        largeur    REAL,
        hauteur    REAL,
        reference  TEXT NOT NULL,
        prix       INTEGER NOT NULL,
        deleted_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_catalogue_produits_modele ON catalogue_produits (modele_id);

      CREATE TABLE IF NOT EXISTS catalogue_images (
        id             TEXT PRIMARY KEY,
        modele_id      TEXT NOT NULL,
        kind           TEXT NOT NULL,
        ordre          INTEGER NOT NULL DEFAULT 0,
        est_principale INTEGER NOT NULL DEFAULT 0,
        url            TEXT,
        filename       TEXT,
        deleted_at     TEXT,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_catalogue_images_modele ON catalogue_images (modele_id);

      CREATE TABLE IF NOT EXISTS catalogue_promotions (
        id             TEXT PRIMARY KEY,
        libelle        TEXT NOT NULL,
        type_reduction TEXT NOT NULL,
        valeur         REAL NOT NULL,
        perimetre      TEXT NOT NULL,
        date_debut     TEXT NOT NULL,
        date_fin       TEXT NOT NULL,
        deleted_at     TEXT,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalogue_promotion_produits (
        promotion_id TEXT NOT NULL,
        produit_id   TEXT NOT NULL,
        PRIMARY KEY (promotion_id, produit_id)
      );

      CREATE TABLE IF NOT EXISTS identite_entreprise (
        id              TEXT PRIMARY KEY CHECK (id = 'singleton'),
        nom             TEXT NOT NULL,
        adresse         TEXT NOT NULL,
        quartier        TEXT NOT NULL,
        telephones_json TEXT NOT NULL,
        whatsapp        TEXT NOT NULL,
        email           TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS installation_recuperation (
        id                        TEXT PRIMARY KEY CHECK (id = 'singleton'),
        hash                      TEXT NOT NULL,
        cle_chiffree_sauvegarde   TEXT,
        cle_chiffree_cloud_backup TEXT,
        updated_at                TEXT NOT NULL
      );

      -- Correction "travail à distance / plusieurs machines en parallèle"
      -- (2026-10-22) — voir serverStorage.ts (CompteCataloguePayload) pour
      -- le raisonnement complet.
      CREATE TABLE IF NOT EXISTS comptes_utilisateurs (
        id                TEXT PRIMARY KEY,
        identifiant       TEXT NOT NULL,
        hash_mot_de_passe TEXT NOT NULL,
        nom               TEXT NOT NULL,
        role              TEXT NOT NULL,
        actif             INTEGER NOT NULL DEFAULT 1,
        deleted_at        TEXT,
        updated_at        TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_comptes_identifiant ON comptes_utilisateurs (identifiant) WHERE deleted_at IS NULL;

      -- Dépôts/points de vente centralisés — correction "visibilité
      -- croisée Factures/Historique entre postes" (2026-10-27). Voir
      -- serverStorage.ts (EmplacementCataloguePayload) pour le
      -- raisonnement complet.
      CREATE TABLE IF NOT EXISTS emplacements (
        id                  TEXT PRIMARY KEY,
        nom                 TEXT NOT NULL,
        type                TEXT NOT NULL,
        ville               TEXT NOT NULL,
        est_point_de_vente  INTEGER NOT NULL DEFAULT 0,
        actif               INTEGER NOT NULL DEFAULT 1,
        deleted_at          TEXT,
        updated_at          TEXT NOT NULL
      );

      -- Stock partagé, autorité unique pour toute opération qui en vérifie
      -- la disponibilité (voir DemandeValidationStock) — jamais déduit du
      -- SQLite local d'un poste une fois la synchronisation configurée.
      CREATE TABLE IF NOT EXISTS stock_central (
        produit_id     TEXT NOT NULL,
        emplacement_id TEXT NOT NULL,
        quantite       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (produit_id, emplacement_id)
      );

      -- Compteur de numéro de facture par préfixe (ex. "F-2026-"), attribué
      -- de façon atomique dans la même transaction que la vérification du
      -- stock — voir validerEtAppliquerOperationStock.
      CREATE TABLE IF NOT EXISTS compteurs_facture (
        prefix  TEXT PRIMARY KEY,
        dernier INTEGER NOT NULL DEFAULT 0
      );

      -- Identité et autorisation des postes — système multiposte fiable
      -- (2026-10-28). Voir serverStorage.ts (PosteRow) pour le
      -- raisonnement complet.
      CREATE TABLE IF NOT EXISTS postes (
        id                  TEXT PRIMARY KEY,
        nom                 TEXT,
        role                TEXT NOT NULL CHECK (role IN ('shop', 'pcx')),
        statut              TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'bloque')),
        enregistre_le       TEXT NOT NULL,
        dernier_contact_le  TEXT,
        updated_at          TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_postes_role_shop_unique ON postes (role) WHERE role = 'shop';
    `);

    // Secours pour un fichier SQLite de dev déjà créé avant cette
    // colonne (le cas `:memory:` n'est jamais concerné, toujours créé
    // neuf) — même raisonnement que postgresServerStorage.ts.
    const colonnesModeles = db.prepare("PRAGMA table_info(catalogue_modeles)").all() as { name: string }[];
    if (!colonnesModeles.some((c) => c.name === "ordre_vitrine")) {
      db.exec("ALTER TABLE catalogue_modeles ADD COLUMN ordre_vitrine INTEGER");
    }
  }

  async fermer(): Promise<void> {
    this.db.close();
  }

  async enregistrerOperations(operations: OperationRecue[]): Promise<ResultatEnregistrement[]> {
    const maintenant = new Date().toISOString();
    const inserer = this.db.prepare(
      "INSERT OR IGNORE INTO operations_synchronisees (entity_type, entity_id, payload_json, recu_le) VALUES (?, ?, ?, ?)"
    );

    const executerLot = this.db.transaction((lot: OperationRecue[]) => {
      const resultats: ResultatEnregistrement[] = [];
      for (const operation of lot) {
        const resultat = inserer.run(operation.entityType, operation.entityId, JSON.stringify(operation.payload), maintenant);
        resultats.push({ entityId: operation.entityId, statut: resultat.changes > 0 ? "cree" : "deja_traite" });
      }
      return resultats;
    });

    return executerLot(operations);
  }

  async listerOperationsDepuis(curseur: number, limite = 200): Promise<ResultatPull> {
    const lignes = this.db
      .prepare("SELECT curseur, entity_type, entity_id, payload_json, recu_le FROM operations_synchronisees WHERE curseur > ? ORDER BY curseur ASC LIMIT ?")
      .all(curseur, limite + 1) as { curseur: number; entity_type: string; entity_id: string; payload_json: string; recu_le: string }[];

    const hasMore = lignes.length > limite;
    const page = hasMore ? lignes.slice(0, limite) : lignes;

    return {
      operations: page.map((l) => ({
        curseur: l.curseur,
        entityType: l.entity_type,
        entityId: l.entity_id,
        payload: JSON.parse(l.payload_json),
        recuLe: l.recu_le,
      })),
      hasMore,
    };
  }

  private slugUnique(motif: string, modeleId: string): string {
    const base = slugify(motif);
    const existants = new Set(
      (
        this.db
          .prepare("SELECT slug FROM catalogue_modeles WHERE id != ?")
          .all(modeleId) as { slug: string }[]
      ).map((r) => r.slug)
    );
    if (!existants.has(base)) return base;
    let n = 2;
    while (existants.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  async appliquerOperationModele(payload: ModeleCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const slug = this.slugUnique(payload.motif, payload.modeleId);

    const resultat = this.db
      .prepare(
        `INSERT INTO catalogue_modeles (id, motif, type, slug, ordre_vitrine, deleted_at, updated_at)
         VALUES (@id, @motif, @type, @slug, @ordreVitrine, @deletedAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           motif = excluded.motif,
           type = excluded.type,
           slug = excluded.slug,
           ordre_vitrine = excluded.ordre_vitrine,
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= catalogue_modeles.updated_at`
      )
      .run({ id: payload.modeleId, motif: payload.motif, type: payload.type, slug, ordreVitrine: payload.ordreVitrine, deletedAt, updatedAt: payload.updatedAt });

    return { applique: resultat.changes > 0 };
  }

  async appliquerOperationProduit(payload: ProduitCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;

    const resultat = this.db
      .prepare(
        `INSERT INTO catalogue_produits (id, modele_id, taille, taille_tri, largeur, hauteur, reference, prix, deleted_at, updated_at)
         VALUES (@id, @modeleId, @taille, @tailleTri, @largeur, @hauteur, @reference, @prix, @deletedAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           modele_id = excluded.modele_id,
           taille = excluded.taille,
           taille_tri = excluded.taille_tri,
           largeur = excluded.largeur,
           hauteur = excluded.hauteur,
           reference = excluded.reference,
           prix = excluded.prix,
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= catalogue_produits.updated_at`
      )
      .run({
        id: payload.produitId,
        modeleId: payload.modeleId,
        taille: payload.taille,
        tailleTri: payload.tailleTri,
        largeur: payload.largeur,
        hauteur: payload.hauteur,
        reference: payload.reference,
        prix: payload.prix,
        deletedAt,
        updatedAt: payload.updatedAt,
      });

    return { applique: resultat.changes > 0 };
  }

  async appliquerOperationPromotion(payload: PromotionCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const db = this.db;

    const executer = db.transaction(() => {
      const resultat = db
        .prepare(
          `INSERT INTO catalogue_promotions (id, libelle, type_reduction, valeur, perimetre, date_debut, date_fin, deleted_at, updated_at)
           VALUES (@id, @libelle, @typeReduction, @valeur, @perimetre, @dateDebut, @dateFin, @deletedAt, @updatedAt)
           ON CONFLICT(id) DO UPDATE SET
             libelle = excluded.libelle,
             type_reduction = excluded.type_reduction,
             valeur = excluded.valeur,
             perimetre = excluded.perimetre,
             date_debut = excluded.date_debut,
             date_fin = excluded.date_fin,
             deleted_at = excluded.deleted_at,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= catalogue_promotions.updated_at`
        )
        .run({
          id: payload.promotionId,
          libelle: payload.libelle,
          typeReduction: payload.typeReduction,
          valeur: payload.valeur,
          perimetre: payload.perimetre,
          dateDebut: payload.dateDebut,
          dateFin: payload.dateFin,
          deletedAt,
          updatedAt: payload.updatedAt,
        });

      if (resultat.changes > 0) {
        db.prepare("DELETE FROM catalogue_promotion_produits WHERE promotion_id = ?").run(payload.promotionId);
        if (payload.operation !== "delete" && payload.perimetre === "cible") {
          const inserer = db.prepare("INSERT OR IGNORE INTO catalogue_promotion_produits (promotion_id, produit_id) VALUES (?, ?)");
          for (const produitId of payload.produitIds) inserer.run(payload.promotionId, produitId);
        }
      }

      return resultat.changes > 0;
    });

    return { applique: executer() };
  }

  async upsertImageMeta(payload: ImageSyncPayload, fichier?: { url: string; filename: string }): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const db = this.db;

    const executer = db.transaction(() => {
      const resultat = db
        .prepare(
          `INSERT INTO catalogue_images (id, modele_id, kind, ordre, est_principale, url, filename, deleted_at, updated_at)
           VALUES (@id, @modeleId, @kind, @ordre, @estPrincipale, @url, @filename, @deletedAt, @updatedAt)
           ON CONFLICT(id) DO UPDATE SET
             modele_id = excluded.modele_id,
             kind = excluded.kind,
             ordre = excluded.ordre,
             est_principale = excluded.est_principale,
             url = COALESCE(excluded.url, catalogue_images.url),
             filename = COALESCE(excluded.filename, catalogue_images.filename),
             deleted_at = excluded.deleted_at,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= catalogue_images.updated_at`
        )
        .run({
          id: payload.imageId,
          modeleId: payload.modeleId,
          kind: payload.kind,
          ordre: payload.ordre,
          estPrincipale: payload.estPrincipale ? 1 : 0,
          url: fichier?.url ?? null,
          filename: fichier?.filename ?? null,
          deletedAt,
          updatedAt: payload.updatedAt,
        });

      if (resultat.changes > 0 && payload.operation !== "delete" && payload.estPrincipale) {
        db.prepare("UPDATE catalogue_images SET est_principale = 0, updated_at = @updatedAt WHERE modele_id = @modeleId AND id != @id").run({
          modeleId: payload.modeleId,
          id: payload.imageId,
          updatedAt: payload.updatedAt,
        });
      }

      return resultat.changes > 0;
    });

    return { applique: executer() };
  }

  async findImageFilename(imageId: string): Promise<string | null> {
    const row = this.db.prepare("SELECT filename FROM catalogue_images WHERE id = ?").get(imageId) as { filename: string | null } | undefined;
    return row?.filename ?? null;
  }

  async listerModelesActifs(): Promise<ModeleRow[]> {
    return this.db
      .prepare("SELECT id, motif, type, slug, ordre_vitrine as ordreVitrine, updated_at as updatedAt FROM catalogue_modeles WHERE deleted_at IS NULL ORDER BY type, motif")
      .all() as ModeleRow[];
  }

  async listerProduitsActifs(): Promise<ProduitRow[]> {
    return this.db
      .prepare(
        "SELECT id, modele_id as modeleId, taille, taille_tri as tailleTri, largeur, hauteur, reference, prix FROM catalogue_produits WHERE deleted_at IS NULL ORDER BY taille_tri"
      )
      .all() as ProduitRow[];
  }

  async listerImagesActives(): Promise<ImageRow[]> {
    const rows = this.db
      .prepare(
        "SELECT id, modele_id as modeleId, ordre, est_principale as estPrincipale, url FROM catalogue_images WHERE deleted_at IS NULL AND kind = 'produit' AND url IS NOT NULL ORDER BY est_principale DESC, ordre"
      )
      .all() as { id: string; modeleId: string; ordre: number; estPrincipale: number; url: string | null }[];
    return rows.map((r) => ({ ...r, estPrincipale: r.estPrincipale === 1 }));
  }

  async listerPromotionsActives(): Promise<PromotionRow[]> {
    const db = this.db;
    const rows = db
      .prepare(
        "SELECT id, libelle, type_reduction as typeReduction, valeur, perimetre, date_debut as dateDebut, date_fin as dateFin FROM catalogue_promotions WHERE deleted_at IS NULL"
      )
      .all() as Omit<PromotionRow, "produitIds">[];
    return rows.map((r) => ({
      ...r,
      produitIds:
        r.perimetre === "cible"
          ? (db.prepare("SELECT produit_id FROM catalogue_promotion_produits WHERE promotion_id = ?").all(r.id) as { produit_id: string }[]).map(
              (p) => p.produit_id
            )
          : [],
    }));
  }

  async appliquerOperationIdentite(payload: IdentiteCataloguePayload): Promise<{ applique: boolean }> {
    const resultat = this.db
      .prepare(
        `INSERT INTO identite_entreprise (id, nom, adresse, quartier, telephones_json, whatsapp, email, updated_at)
         VALUES ('singleton', @nom, @adresse, @quartier, @telephonesJson, @whatsapp, @email, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           nom = excluded.nom,
           adresse = excluded.adresse,
           quartier = excluded.quartier,
           telephones_json = excluded.telephones_json,
           whatsapp = excluded.whatsapp,
           email = excluded.email,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= identite_entreprise.updated_at`
      )
      .run({
        nom: payload.nom,
        adresse: payload.adresse,
        quartier: payload.quartier,
        telephonesJson: JSON.stringify(payload.telephones),
        whatsapp: payload.whatsapp,
        email: payload.email,
        updatedAt: payload.updatedAt,
      });

    return { applique: resultat.changes > 0 };
  }

  async getIdentiteActuelle(): Promise<IdentiteRow | null> {
    const row = this.db.prepare("SELECT nom, adresse, quartier, telephones_json, whatsapp, email, updated_at FROM identite_entreprise WHERE id = 'singleton'").get() as
      | { nom: string; adresse: string; quartier: string; telephones_json: string; whatsapp: string; email: string; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      nom: row.nom,
      adresse: row.adresse,
      quartier: row.quartier,
      telephones: JSON.parse(row.telephones_json) as string[],
      whatsapp: row.whatsapp,
      email: row.email,
      updatedAt: row.updated_at,
    };
  }

  async definirRecuperation(
    hashArgon2id: string,
    cleChiffreeSauvegardeJson: string | null,
    cleChiffreeCloudBackupJson: string | null
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO installation_recuperation (id, hash, cle_chiffree_sauvegarde, cle_chiffree_cloud_backup, updated_at)
         VALUES ('singleton', @hash, @cle, @cleCloud, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           hash = excluded.hash,
           cle_chiffree_sauvegarde = excluded.cle_chiffree_sauvegarde,
           cle_chiffree_cloud_backup = excluded.cle_chiffree_cloud_backup,
           updated_at = excluded.updated_at`
      )
      .run({ hash: hashArgon2id, cle: cleChiffreeSauvegardeJson, cleCloud: cleChiffreeCloudBackupJson, updatedAt: new Date().toISOString() });
  }

  async getRecuperationHash(): Promise<string | null> {
    const row = this.db.prepare("SELECT hash FROM installation_recuperation WHERE id = 'singleton'").get() as { hash: string } | undefined;
    return row?.hash ?? null;
  }

  async getRecuperationCleChiffree(): Promise<string | null> {
    const row = this.db.prepare("SELECT cle_chiffree_sauvegarde FROM installation_recuperation WHERE id = 'singleton'").get() as
      | { cle_chiffree_sauvegarde: string | null }
      | undefined;
    return row?.cle_chiffree_sauvegarde ?? null;
  }

  async getRecuperationCleChiffreeCloudBackup(): Promise<string | null> {
    const row = this.db.prepare("SELECT cle_chiffree_cloud_backup FROM installation_recuperation WHERE id = 'singleton'").get() as
      | { cle_chiffree_cloud_backup: string | null }
      | undefined;
    return row?.cle_chiffree_cloud_backup ?? null;
  }

  async appliquerOperationCompte(payload: CompteCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const resultat = this.db
      .prepare(
        `INSERT INTO comptes_utilisateurs (id, identifiant, hash_mot_de_passe, nom, role, actif, deleted_at, updated_at)
         VALUES (@id, @identifiant, @hashMotDePasse, @nom, @role, @actif, @deletedAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           identifiant = excluded.identifiant,
           hash_mot_de_passe = excluded.hash_mot_de_passe,
           nom = excluded.nom,
           role = excluded.role,
           actif = excluded.actif,
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= comptes_utilisateurs.updated_at`
      )
      .run({
        id: payload.compteId,
        identifiant: payload.identifiant,
        hashMotDePasse: payload.hashMotDePasse,
        nom: payload.nom,
        role: payload.role,
        actif: payload.actif ? 1 : 0,
        deletedAt,
        updatedAt: payload.updatedAt,
      });

    return { applique: resultat.changes > 0 };
  }

  async trouverCompteParIdentifiant(identifiant: string): Promise<CompteRow | null> {
    const row = this.db
      .prepare(
        "SELECT id, identifiant, hash_mot_de_passe as hashMotDePasse, nom, role, actif FROM comptes_utilisateurs WHERE identifiant = ? AND deleted_at IS NULL"
      )
      .get(identifiant) as { id: string; identifiant: string; hashMotDePasse: string; nom: string; role: string; actif: number } | undefined;
    if (!row) return null;
    return { id: row.id, identifiant: row.identifiant, hashMotDePasse: row.hashMotDePasse, nom: row.nom, role: row.role, actif: row.actif === 1 };
  }

  async listerComptesActifs(): Promise<CompteCatchupRow[]> {
    const rows = this.db
      .prepare("SELECT id, identifiant, nom, role, actif FROM comptes_utilisateurs WHERE deleted_at IS NULL")
      .all() as { id: string; identifiant: string; nom: string; role: string; actif: number }[];
    return rows.map((r) => ({ id: r.id, identifiant: r.identifiant, nom: r.nom, role: r.role, actif: r.actif === 1 }));
  }

  async appliquerOperationEmplacement(payload: EmplacementCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const resultat = this.db
      .prepare(
        `INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, actif, deleted_at, updated_at)
         VALUES (@id, @nom, @type, @ville, @estPointDeVente, @actif, @deletedAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           nom = excluded.nom,
           type = excluded.type,
           ville = excluded.ville,
           est_point_de_vente = excluded.est_point_de_vente,
           actif = excluded.actif,
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= emplacements.updated_at`
      )
      .run({
        id: payload.emplacementId,
        nom: payload.nom,
        type: payload.type,
        ville: payload.ville,
        estPointDeVente: payload.estPointDeVente ? 1 : 0,
        actif: payload.actif ? 1 : 0,
        deletedAt,
        updatedAt: payload.updatedAt,
      });

    return { applique: resultat.changes > 0 };
  }

  async listerEmplacementsActifs(): Promise<EmplacementRow[]> {
    const rows = this.db
      .prepare("SELECT id, nom, type, ville, est_point_de_vente as estPointDeVente, actif FROM emplacements WHERE deleted_at IS NULL")
      .all() as { id: string; nom: string; type: string; ville: string; estPointDeVente: number; actif: number }[];
    return rows.map((r) => ({ id: r.id, nom: r.nom, type: r.type, ville: r.ville, estPointDeVente: r.estPointDeVente === 1, actif: r.actif === 1 }));
  }

  async validerEtAppliquerOperationStock(demande: DemandeValidationStock): Promise<ResultatValidationStock> {
    const db = this.db;
    const executer = db.transaction((): ResultatValidationStock => {
      const lecture = db.prepare("SELECT quantite FROM stock_central WHERE produit_id = ? AND emplacement_id = ?");
      const etats = demande.deltas.map((d) => {
        const row = lecture.get(d.produitId, d.emplacementId) as { quantite: number } | undefined;
        return { ...d, actuel: row?.quantite ?? 0 };
      });

      const insuffisants = etats.filter((e) => e.actuel + e.delta < 0);
      if (insuffisants.length > 0) {
        return {
          success: false,
          raison: "stock_insuffisant",
          details: insuffisants.map((e) => ({ produitId: e.produitId, emplacementId: e.emplacementId, disponible: e.actuel, demande: -e.delta })),
        };
      }

      const upsert = db.prepare(
        `INSERT INTO stock_central (produit_id, emplacement_id, quantite) VALUES (@produitId, @emplacementId, @quantite)
         ON CONFLICT(produit_id, emplacement_id) DO UPDATE SET quantite = excluded.quantite`
      );
      const stockApres = etats.map((e) => {
        const quantite = e.actuel + e.delta;
        upsert.run({ produitId: e.produitId, emplacementId: e.emplacementId, quantite });
        return { produitId: e.produitId, emplacementId: e.emplacementId, quantite };
      });

      let numero: string | undefined;
      if (demande.demandeNumeroFacture) {
        const prefix = demande.demandeNumeroFacture.prefix;
        const ligne = db.prepare("SELECT dernier FROM compteurs_facture WHERE prefix = ?").get(prefix) as { dernier: number } | undefined;
        const prochain = (ligne?.dernier ?? 0) + 1;
        db.prepare(
          `INSERT INTO compteurs_facture (prefix, dernier) VALUES (?, ?)
           ON CONFLICT(prefix) DO UPDATE SET dernier = excluded.dernier`
        ).run(prefix, prochain);
        numero = `${prefix}${String(prochain).padStart(4, "0")}`;
      }

      return { success: true, numero, stockApres };
    });

    return executer();
  }

  async initialiserStockCentral(lignes: LigneInitialisationStock[]): Promise<{ lignesAppliquees: number }> {
    const db = this.db;
    const upsert = db.prepare(
      `INSERT INTO stock_central (produit_id, emplacement_id, quantite) VALUES (@produitId, @emplacementId, @quantite)
       ON CONFLICT(produit_id, emplacement_id) DO UPDATE SET quantite = excluded.quantite`
    );
    const executer = db.transaction((): number => {
      for (const l of lignes) upsert.run(l);
      return lignes.length;
    });
    return { lignesAppliquees: executer() };
  }

  async listerStockCentral(): Promise<LigneStockCentral[]> {
    return this.db
      .prepare("SELECT produit_id as produitId, emplacement_id as emplacementId, quantite FROM stock_central")
      .all() as LigneStockCentral[];
  }

  private static readonly SELECT_POSTE =
    "SELECT id, nom, role, statut, enregistre_le as enregistreLe, dernier_contact_le as dernierContactLe, updated_at as updatedAt FROM postes";

  async getPoste(id: string): Promise<PosteRow | null> {
    const row = this.db.prepare(`${SqliteServerStorage.SELECT_POSTE} WHERE id = ?`).get(id) as PosteRow | undefined;
    return row ?? null;
  }

  async listerPostes(): Promise<PosteRow[]> {
    return this.db.prepare(`${SqliteServerStorage.SELECT_POSTE} ORDER BY enregistre_le ASC`).all() as PosteRow[];
  }

  async creerPosteAnnexeSiLimiteNonAtteinte(maintenant: string): Promise<ResultatCreationPosteAnnexe> {
    const MAX_PCX = 5;
    const db = this.db;
    const executer = db.transaction((): ResultatCreationPosteAnnexe => {
      const { n } = db.prepare("SELECT COUNT(*) as n FROM postes WHERE role = 'pcx'").get() as { n: number };
      if (n >= MAX_PCX) return { success: false, raison: "limite_atteinte" };
      const id = randomUUID();
      db.prepare("INSERT INTO postes (id, nom, role, statut, enregistre_le, updated_at) VALUES (?, NULL, 'pcx', 'actif', ?, ?)").run(id, maintenant, maintenant);
      return { success: true, poste: { id, nom: null, role: "pcx", statut: "actif", enregistreLe: maintenant, dernierContactLe: null, updatedAt: maintenant } };
    });
    return executer();
  }

  async obtenirOuCreerPosteShop(maintenant: string): Promise<PosteRow> {
    const db = this.db;
    const executer = db.transaction((): PosteRow => {
      const existant = db.prepare(`${SqliteServerStorage.SELECT_POSTE} WHERE role = 'shop' LIMIT 1`).get() as PosteRow | undefined;
      if (existant) return existant;
      const id = randomUUID();
      db.prepare("INSERT INTO postes (id, nom, role, statut, enregistre_le, updated_at) VALUES (?, NULL, 'shop', 'actif', ?, ?)").run(id, maintenant, maintenant);
      return { id, nom: null, role: "shop", statut: "actif", enregistreLe: maintenant, dernierContactLe: null, updatedAt: maintenant };
    });
    return executer();
  }

  async definirNomPoste(id: string, nom: string, maintenant: string): Promise<{ applique: boolean }> {
    const resultat = this.db.prepare("UPDATE postes SET nom = ?, updated_at = ? WHERE id = ?").run(nom, maintenant, id);
    return { applique: resultat.changes > 0 };
  }

  async bloquerPoste(id: string, maintenant: string): Promise<{ applique: boolean }> {
    const resultat = this.db.prepare("UPDATE postes SET statut = 'bloque', updated_at = ? WHERE id = ?").run(maintenant, id);
    return { applique: resultat.changes > 0 };
  }

  async reautoriserPoste(id: string, maintenant: string): Promise<{ applique: boolean }> {
    const resultat = this.db.prepare("UPDATE postes SET statut = 'actif', updated_at = ? WHERE id = ?").run(maintenant, id);
    return { applique: resultat.changes > 0 };
  }

  async retirerPoste(id: string): Promise<{ applique: boolean }> {
    const resultat = this.db.prepare("DELETE FROM postes WHERE id = ?").run(id);
    return { applique: resultat.changes > 0 };
  }
}
