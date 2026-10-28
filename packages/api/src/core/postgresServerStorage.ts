import pg from "pg";
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

const { Pool } = pg;

/**
 * Implémentation PostgreSQL — Bloc 1 (remédiation pré-production).
 * Même contrat, même comportement fonctionnel que `SqliteServerStorage`
 * (idempotence par upsert conditionné sur `updated_at`, jamais une
 * seconde logique métier) — seule la syntaxe SQL change (dialecte
 * PostgreSQL : `$1,$2,...`, `ON CONFLICT ... DO UPDATE ... WHERE` — pris
 * en charge nativement par PostgreSQL comme par SQLite).
 *
 * Le pool gère la reconnexion automatiquement (comportement par défaut
 * de `pg` : une connexion en erreur est retirée du pool, une nouvelle
 * est ouverte à la prochaine requête) — jamais un mécanisme de retry
 * maison en plus.
 */
export class PostgresServerStorage implements ServerStorage {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.pool.on("error", (err) => {
      // Erreur sur une connexion IDLE du pool (ex. coupure réseau) —
      // jamais laissé remonter comme une exception non gérée qui
      // arrêterait le processus : le pool ouvre une nouvelle connexion à
      // la prochaine requête.
      // eslint-disable-next-line no-console
      console.error("[postgres] erreur sur une connexion inactive du pool :", err.message);
    });
  }

  /** Crée le schéma s'il est absent — idempotent, jamais destructif, même principe que les migrations SQLite. */
  async migrer(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS operations_synchronisees (
        curseur      BIGSERIAL PRIMARY KEY,
        entity_type  TEXT NOT NULL,
        entity_id    TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        recu_le      TEXT NOT NULL,
        UNIQUE (entity_type, entity_id)
      );

      CREATE TABLE IF NOT EXISTS catalogue_modeles (
        id            TEXT PRIMARY KEY,
        motif         TEXT NOT NULL,
        type          TEXT NOT NULL,
        slug          TEXT NOT NULL UNIQUE,
        ordre_vitrine INTEGER,
        deleted_at    TEXT,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalogue_produits (
        id         TEXT PRIMARY KEY,
        modele_id  TEXT NOT NULL,
        taille     TEXT NOT NULL,
        taille_tri DOUBLE PRECISION NOT NULL,
        largeur    DOUBLE PRECISION,
        hauteur    DOUBLE PRECISION,
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
        est_principale BOOLEAN NOT NULL DEFAULT FALSE,
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
        valeur         DOUBLE PRECISION NOT NULL,
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
        id                         TEXT PRIMARY KEY CHECK (id = 'singleton'),
        hash                       TEXT NOT NULL,
        cle_chiffree_sauvegarde    TEXT,
        updated_at                 TEXT NOT NULL
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
        actif             BOOLEAN NOT NULL DEFAULT TRUE,
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
        est_point_de_vente  BOOLEAN NOT NULL DEFAULT FALSE,
        actif               BOOLEAN NOT NULL DEFAULT TRUE,
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
      -- raisonnement complet. "id" devient le "sub" du JWT applicatif
      -- (voir emissionJetonApplication.ts) — avant cette table, "sub"
      -- était une valeur aléatoire jamais persistée.
      CREATE TABLE IF NOT EXISTS postes (
        id                  TEXT PRIMARY KEY,
        nom                 TEXT,
        role                TEXT NOT NULL CHECK (role IN ('shop', 'pcx')),
        statut              TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'bloque')),
        enregistre_le       TEXT NOT NULL,
        dernier_contact_le  TEXT,
        updated_at          TEXT NOT NULL
      );
      -- Un seul poste "shop" par installation (voir obtenirOuCreerPosteShop,
      -- qui s'appuie sur cet index pour détecter une création concurrente).
      CREATE UNIQUE INDEX IF NOT EXISTS idx_postes_role_shop_unique ON postes (role) WHERE role = 'shop';
    `);

    // BUG RÉEL CORRIGÉ (2026-09-29) : cette colonne a été ajoutée à
    // installation_recuperation APRÈS le premier déploiement de cette
    // table en production. `CREATE TABLE IF NOT EXISTS` ci-dessus ne
    // modifie jamais une table déjà existante — sans cet ALTER explicite,
    // la colonne resterait absente indéfiniment sur toute base déjà
    // migrée une première fois, faisant échouer silencieusement le
    // stockage de la clé CLOUD_BACKUP_* chiffrée. `ADD COLUMN IF NOT
    // EXISTS` reste idempotent pour une base neuve (colonne déjà créée
    // par le CREATE TABLE ci-dessus dans ce cas).
    await this.pool.query(`
      ALTER TABLE installation_recuperation ADD COLUMN IF NOT EXISTS cle_chiffree_cloud_backup TEXT;
    `);

    // BUG RÉEL CORRIGÉ (2026-10-07) : même raisonnement que ci-dessus —
    // `CREATE TABLE IF NOT EXISTS` ne touche jamais une table déjà
    // déployée en production, donc cette colonne resterait absente sans
    // cet ALTER explicite (voir validationCatalogueSync.ts/ModeleCataloguePayload).
    await this.pool.query(`
      ALTER TABLE catalogue_modeles ADD COLUMN IF NOT EXISTS ordre_vitrine INTEGER;
    `);
  }

  async fermer(): Promise<void> {
    await this.pool.end();
  }

  async enregistrerOperations(operations: OperationRecue[]): Promise<ResultatEnregistrement[]> {
    const maintenant = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const resultats: ResultatEnregistrement[] = [];
      for (const operation of operations) {
        const res = await client.query(
          `INSERT INTO operations_synchronisees (entity_type, entity_id, payload_json, recu_le)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (entity_type, entity_id) DO NOTHING`,
          [operation.entityType, operation.entityId, JSON.stringify(operation.payload), maintenant]
        );
        resultats.push({ entityId: operation.entityId, statut: (res.rowCount ?? 0) > 0 ? "cree" : "deja_traite" });
      }
      await client.query("COMMIT");
      return resultats;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listerOperationsDepuis(curseur: number, limite = 200): Promise<ResultatPull> {
    const res = await this.pool.query(
      "SELECT curseur, entity_type, entity_id, payload_json, recu_le FROM operations_synchronisees WHERE curseur > $1 ORDER BY curseur ASC LIMIT $2",
      [curseur, limite + 1]
    );
    const lignes = res.rows as { curseur: string; entity_type: string; entity_id: string; payload_json: string; recu_le: string }[];
    const hasMore = lignes.length > limite;
    const page = hasMore ? lignes.slice(0, limite) : lignes;

    return {
      operations: page.map((l) => ({
        curseur: Number(l.curseur),
        entityType: l.entity_type,
        entityId: l.entity_id,
        payload: JSON.parse(l.payload_json),
        recuLe: l.recu_le,
      })),
      hasMore,
    };
  }

  private async slugUnique(motif: string, modeleId: string): Promise<string> {
    const base = slugify(motif);
    const res = await this.pool.query("SELECT slug FROM catalogue_modeles WHERE id != $1", [modeleId]);
    const existants = new Set((res.rows as { slug: string }[]).map((r) => r.slug));
    if (!existants.has(base)) return base;
    let n = 2;
    while (existants.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  async appliquerOperationModele(payload: ModeleCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const slug = await this.slugUnique(payload.motif, payload.modeleId);

    const res = await this.pool.query(
      `INSERT INTO catalogue_modeles (id, motif, type, slug, ordre_vitrine, deleted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         motif = excluded.motif,
         type = excluded.type,
         slug = excluded.slug,
         ordre_vitrine = excluded.ordre_vitrine,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= catalogue_modeles.updated_at`,
      [payload.modeleId, payload.motif, payload.type, slug, payload.ordreVitrine, deletedAt, payload.updatedAt]
    );

    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async appliquerOperationProduit(payload: ProduitCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;

    const res = await this.pool.query(
      `INSERT INTO catalogue_produits (id, modele_id, taille, taille_tri, largeur, hauteur, reference, prix, deleted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         modele_id = excluded.modele_id,
         taille = excluded.taille,
         taille_tri = excluded.taille_tri,
         largeur = excluded.largeur,
         hauteur = excluded.hauteur,
         reference = excluded.reference,
         prix = excluded.prix,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= catalogue_produits.updated_at`,
      [payload.produitId, payload.modeleId, payload.taille, payload.tailleTri, payload.largeur, payload.hauteur, payload.reference, payload.prix, deletedAt, payload.updatedAt]
    );

    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async appliquerOperationPromotion(payload: PromotionCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO catalogue_promotions (id, libelle, type_reduction, valeur, perimetre, date_debut, date_fin, deleted_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           libelle = excluded.libelle,
           type_reduction = excluded.type_reduction,
           valeur = excluded.valeur,
           perimetre = excluded.perimetre,
           date_debut = excluded.date_debut,
           date_fin = excluded.date_fin,
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= catalogue_promotions.updated_at`,
        [payload.promotionId, payload.libelle, payload.typeReduction, payload.valeur, payload.perimetre, payload.dateDebut, payload.dateFin, deletedAt, payload.updatedAt]
      );

      const applique = (res.rowCount ?? 0) > 0;
      if (applique) {
        await client.query("DELETE FROM catalogue_promotion_produits WHERE promotion_id = $1", [payload.promotionId]);
        if (payload.operation !== "delete" && payload.perimetre === "cible") {
          for (const produitId of payload.produitIds) {
            await client.query(
              "INSERT INTO catalogue_promotion_produits (promotion_id, produit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
              [payload.promotionId, produitId]
            );
          }
        }
      }
      await client.query("COMMIT");
      return { applique };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async upsertImageMeta(payload: ImageSyncPayload, fichier?: { url: string; filename: string }): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO catalogue_images (id, modele_id, kind, ordre, est_principale, url, filename, deleted_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           modele_id = excluded.modele_id,
           kind = excluded.kind,
           ordre = excluded.ordre,
           est_principale = excluded.est_principale,
           url = COALESCE(excluded.url, catalogue_images.url),
           filename = COALESCE(excluded.filename, catalogue_images.filename),
           deleted_at = excluded.deleted_at,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at >= catalogue_images.updated_at`,
        [payload.imageId, payload.modeleId, payload.kind, payload.ordre, payload.estPrincipale, fichier?.url ?? null, fichier?.filename ?? null, deletedAt, payload.updatedAt]
      );

      const applique = (res.rowCount ?? 0) > 0;
      if (applique && payload.operation !== "delete" && payload.estPrincipale) {
        await client.query("UPDATE catalogue_images SET est_principale = FALSE, updated_at = $1 WHERE modele_id = $2 AND id != $3", [
          payload.updatedAt,
          payload.modeleId,
          payload.imageId,
        ]);
      }
      await client.query("COMMIT");
      return { applique };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findImageFilename(imageId: string): Promise<string | null> {
    const res = await this.pool.query("SELECT filename FROM catalogue_images WHERE id = $1", [imageId]);
    return (res.rows[0] as { filename: string | null } | undefined)?.filename ?? null;
  }

  async initialiserStockCentral(lignes: LigneInitialisationStock[]): Promise<{ lignesAppliquees: number }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const l of lignes) {
        await client.query(
          `INSERT INTO stock_central (produit_id, emplacement_id, quantite)
           VALUES ($1, $2, $3)
           ON CONFLICT (produit_id, emplacement_id) DO UPDATE SET quantite = EXCLUDED.quantite`,
          [l.produitId, l.emplacementId, l.quantite]
        );
      }
      await client.query("COMMIT");
      return { lignesAppliquees: lignes.length };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listerStockCentral(): Promise<LigneStockCentral[]> {
    const res = await this.pool.query(
      `SELECT produit_id as "produitId", emplacement_id as "emplacementId", quantite FROM stock_central`
    );
    return res.rows as LigneStockCentral[];
  }

  async listerModelesActifs(): Promise<ModeleRow[]> {
    const res = await this.pool.query(
      "SELECT id, motif, type, slug, ordre_vitrine as \"ordreVitrine\", updated_at as \"updatedAt\" FROM catalogue_modeles WHERE deleted_at IS NULL ORDER BY type, motif"
    );
    return res.rows as ModeleRow[];
  }

  async listerProduitsActifs(): Promise<ProduitRow[]> {
    const res = await this.pool.query(
      `SELECT id, modele_id as "modeleId", taille, taille_tri as "tailleTri", largeur, hauteur, reference, prix
       FROM catalogue_produits WHERE deleted_at IS NULL ORDER BY taille_tri`
    );
    return res.rows as ProduitRow[];
  }

  async listerImagesActives(): Promise<ImageRow[]> {
    const res = await this.pool.query(
      `SELECT id, modele_id as "modeleId", ordre, est_principale as "estPrincipale", url
       FROM catalogue_images WHERE deleted_at IS NULL AND kind = 'produit' AND url IS NOT NULL ORDER BY est_principale DESC, ordre`
    );
    return res.rows as ImageRow[];
  }

  async listerPromotionsActives(): Promise<PromotionRow[]> {
    const res = await this.pool.query(
      `SELECT id, libelle, type_reduction as "typeReduction", valeur, perimetre, date_debut as "dateDebut", date_fin as "dateFin"
       FROM catalogue_promotions WHERE deleted_at IS NULL`
    );
    const rows = res.rows as Omit<PromotionRow, "produitIds">[];
    const resultat: PromotionRow[] = [];
    for (const r of rows) {
      let produitIds: string[] = [];
      if (r.perimetre === "cible") {
        const liaisons = await this.pool.query("SELECT produit_id FROM catalogue_promotion_produits WHERE promotion_id = $1", [r.id]);
        produitIds = (liaisons.rows as { produit_id: string }[]).map((p) => p.produit_id);
      }
      resultat.push({ ...r, produitIds });
    }
    return resultat;
  }

  async appliquerOperationIdentite(payload: IdentiteCataloguePayload): Promise<{ applique: boolean }> {
    const res = await this.pool.query(
      `INSERT INTO identite_entreprise (id, nom, adresse, quartier, telephones_json, whatsapp, email, updated_at)
       VALUES ('singleton', $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         nom = excluded.nom,
         adresse = excluded.adresse,
         quartier = excluded.quartier,
         telephones_json = excluded.telephones_json,
         whatsapp = excluded.whatsapp,
         email = excluded.email,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= identite_entreprise.updated_at`,
      [payload.nom, payload.adresse, payload.quartier, JSON.stringify(payload.telephones), payload.whatsapp, payload.email, payload.updatedAt]
    );

    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async getIdentiteActuelle(): Promise<IdentiteRow | null> {
    const res = await this.pool.query(
      `SELECT nom, adresse, quartier, telephones_json as "telephonesJson", whatsapp, email, updated_at as "updatedAt"
       FROM identite_entreprise WHERE id = 'singleton'`
    );
    const row = res.rows[0] as { nom: string; adresse: string; quartier: string; telephonesJson: string; whatsapp: string; email: string; updatedAt: string } | undefined;
    if (!row) return null;
    return {
      nom: row.nom,
      adresse: row.adresse,
      quartier: row.quartier,
      telephones: JSON.parse(row.telephonesJson) as string[],
      whatsapp: row.whatsapp,
      email: row.email,
      updatedAt: row.updatedAt,
    };
  }

  async definirRecuperation(
    hashArgon2id: string,
    cleChiffreeSauvegardeJson: string | null,
    cleChiffreeCloudBackupJson: string | null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO installation_recuperation (id, hash, cle_chiffree_sauvegarde, cle_chiffree_cloud_backup, updated_at)
       VALUES ('singleton', $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         hash = excluded.hash,
         cle_chiffree_sauvegarde = excluded.cle_chiffree_sauvegarde,
         cle_chiffree_cloud_backup = excluded.cle_chiffree_cloud_backup,
         updated_at = excluded.updated_at`,
      [hashArgon2id, cleChiffreeSauvegardeJson, cleChiffreeCloudBackupJson, new Date().toISOString()]
    );
  }

  async getRecuperationHash(): Promise<string | null> {
    const res = await this.pool.query(`SELECT hash FROM installation_recuperation WHERE id = 'singleton'`);
    const row = res.rows[0] as { hash: string } | undefined;
    return row?.hash ?? null;
  }

  async getRecuperationCleChiffree(): Promise<string | null> {
    const res = await this.pool.query(`SELECT cle_chiffree_sauvegarde FROM installation_recuperation WHERE id = 'singleton'`);
    const row = res.rows[0] as { cle_chiffree_sauvegarde: string | null } | undefined;
    return row?.cle_chiffree_sauvegarde ?? null;
  }

  async getRecuperationCleChiffreeCloudBackup(): Promise<string | null> {
    const res = await this.pool.query(`SELECT cle_chiffree_cloud_backup FROM installation_recuperation WHERE id = 'singleton'`);
    const row = res.rows[0] as { cle_chiffree_cloud_backup: string | null } | undefined;
    return row?.cle_chiffree_cloud_backup ?? null;
  }

  async appliquerOperationCompte(payload: CompteCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const res = await this.pool.query(
      `INSERT INTO comptes_utilisateurs (id, identifiant, hash_mot_de_passe, nom, role, actif, deleted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         identifiant = excluded.identifiant,
         hash_mot_de_passe = excluded.hash_mot_de_passe,
         nom = excluded.nom,
         role = excluded.role,
         actif = excluded.actif,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= comptes_utilisateurs.updated_at`,
      [payload.compteId, payload.identifiant, payload.hashMotDePasse, payload.nom, payload.role, payload.actif, deletedAt, payload.updatedAt]
    );
    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async trouverCompteParIdentifiant(identifiant: string): Promise<CompteRow | null> {
    const res = await this.pool.query(
      `SELECT id, identifiant, hash_mot_de_passe as "hashMotDePasse", nom, role, actif
       FROM comptes_utilisateurs WHERE identifiant = $1 AND deleted_at IS NULL`,
      [identifiant]
    );
    const row = res.rows[0] as CompteRow | undefined;
    return row ?? null;
  }

  async listerComptesActifs(): Promise<CompteCatchupRow[]> {
    const res = await this.pool.query(`SELECT id, identifiant, nom, role, actif FROM comptes_utilisateurs WHERE deleted_at IS NULL`);
    return res.rows as CompteCatchupRow[];
  }

  async appliquerOperationEmplacement(payload: EmplacementCataloguePayload): Promise<{ applique: boolean }> {
    const deletedAt = payload.operation === "delete" ? payload.updatedAt : null;
    const res = await this.pool.query(
      `INSERT INTO emplacements (id, nom, type, ville, est_point_de_vente, actif, deleted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         nom = excluded.nom,
         type = excluded.type,
         ville = excluded.ville,
         est_point_de_vente = excluded.est_point_de_vente,
         actif = excluded.actif,
         deleted_at = excluded.deleted_at,
         updated_at = excluded.updated_at
       WHERE excluded.updated_at >= emplacements.updated_at`,
      [payload.emplacementId, payload.nom, payload.type, payload.ville, payload.estPointDeVente, payload.actif, deletedAt, payload.updatedAt]
    );
    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async listerEmplacementsActifs(): Promise<EmplacementRow[]> {
    const res = await this.pool.query(
      `SELECT id, nom, type, ville, est_point_de_vente as "estPointDeVente", actif FROM emplacements WHERE deleted_at IS NULL`
    );
    return res.rows as EmplacementRow[];
  }

  async validerEtAppliquerOperationStock(demande: DemandeValidationStock): Promise<ResultatValidationStock> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Idiome Postgres "verrouiller-ou-créer" en une seule requête : la
      // ligne est créée à 0 si absente, sinon mise à jour avec sa PROPRE
      // valeur (no-op fonctionnel) — dans les deux cas elle est verrouillée
      // (FOR UPDATE implicite d'un UPDATE/INSERT) jusqu'au COMMIT/ROLLBACK,
      // ce qui sérialise naturellement deux transactions concurrentes sur
      // le même (produit_id, emplacement_id) sans file d'attente maison.
      const etats: { produitId: string; emplacementId: string; delta: number; actuel: number }[] = [];
      for (const d of demande.deltas) {
        const res = await client.query(
          `INSERT INTO stock_central (produit_id, emplacement_id, quantite)
           VALUES ($1, $2, 0)
           ON CONFLICT (produit_id, emplacement_id) DO UPDATE SET quantite = stock_central.quantite
           RETURNING quantite`,
          [d.produitId, d.emplacementId]
        );
        const actuel = (res.rows[0] as { quantite: number }).quantite;
        etats.push({ ...d, actuel });
      }

      const insuffisants = etats.filter((e) => e.actuel + e.delta < 0);
      if (insuffisants.length > 0) {
        await client.query("ROLLBACK");
        return {
          success: false,
          raison: "stock_insuffisant",
          details: insuffisants.map((e) => ({ produitId: e.produitId, emplacementId: e.emplacementId, disponible: e.actuel, demande: -e.delta })),
        };
      }

      const stockApres: { produitId: string; emplacementId: string; quantite: number }[] = [];
      for (const e of etats) {
        const quantite = e.actuel + e.delta;
        await client.query(`UPDATE stock_central SET quantite = $1 WHERE produit_id = $2 AND emplacement_id = $3`, [
          quantite,
          e.produitId,
          e.emplacementId,
        ]);
        stockApres.push({ produitId: e.produitId, emplacementId: e.emplacementId, quantite });
      }

      let numero: string | undefined;
      if (demande.demandeNumeroFacture) {
        const prefix = demande.demandeNumeroFacture.prefix;
        const res = await client.query(
          `INSERT INTO compteurs_facture (prefix, dernier)
           VALUES ($1, 0)
           ON CONFLICT (prefix) DO UPDATE SET dernier = compteurs_facture.dernier
           RETURNING dernier`,
          [prefix]
        );
        const prochain = (res.rows[0] as { dernier: number }).dernier + 1;
        await client.query(`UPDATE compteurs_facture SET dernier = $1 WHERE prefix = $2`, [prochain, prefix]);
        numero = `${prefix}${String(prochain).padStart(4, "0")}`;
      }

      await client.query("COMMIT");
      return { success: true, numero, stockApres };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private static readonly SELECT_POSTE =
    `SELECT id, nom, role, statut, enregistre_le as "enregistreLe", dernier_contact_le as "dernierContactLe", updated_at as "updatedAt" FROM postes`;

  async getPoste(id: string): Promise<PosteRow | null> {
    const res = await this.pool.query(`${PostgresServerStorage.SELECT_POSTE} WHERE id = $1`, [id]);
    return (res.rows[0] as PosteRow | undefined) ?? null;
  }

  async listerPostes(): Promise<PosteRow[]> {
    const res = await this.pool.query(`${PostgresServerStorage.SELECT_POSTE} ORDER BY enregistre_le ASC`);
    return res.rows as PosteRow[];
  }

  async creerPosteAnnexeSiLimiteNonAtteinte(maintenant: string): Promise<ResultatCreationPosteAnnexe> {
    const MAX_PCX = 5;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Verrou consultatif scopé à la transaction (relâché automatiquement
      // au COMMIT/ROLLBACK) — sérialise toute tentative concurrente de
      // création d'un poste annexe le temps de compter puis d'insérer de
      // façon atomique. Nécessaire ici car, contrairement au verrouillage
      // de ligne de `validerEtAppliquerOperationStock`, aucune ligne
      // précise n'existe encore à verrouiller pour un tout premier poste.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('postes_limite_pcx'))");
      const compte = await client.query("SELECT COUNT(*)::int AS n FROM postes WHERE role = 'pcx'");
      const n = (compte.rows[0] as { n: number }).n;
      if (n >= MAX_PCX) {
        await client.query("ROLLBACK");
        return { success: false, raison: "limite_atteinte" };
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO postes (id, nom, role, statut, enregistre_le, updated_at) VALUES ($1, NULL, 'pcx', 'actif', $2, $2)`,
        [id, maintenant]
      );
      await client.query("COMMIT");
      return { success: true, poste: { id, nom: null, role: "pcx", statut: "actif", enregistreLe: maintenant, dernierContactLe: null, updatedAt: maintenant } };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async obtenirOuCreerPosteShop(maintenant: string): Promise<PosteRow> {
    const existant = await this.pool.query(`${PostgresServerStorage.SELECT_POSTE} WHERE role = 'shop' LIMIT 1`);
    if (existant.rows[0]) return existant.rows[0] as PosteRow;

    const id = randomUUID();
    try {
      await this.pool.query(
        `INSERT INTO postes (id, nom, role, statut, enregistre_le, updated_at) VALUES ($1, NULL, 'shop', 'actif', $2, $2)`,
        [id, maintenant]
      );
      return { id, nom: null, role: "shop", statut: "actif", enregistreLe: maintenant, dernierContactLe: null, updatedAt: maintenant };
    } catch (err) {
      // Violation de idx_postes_role_shop_unique : une autre requête
      // concurrente a créé le poste Shop entre le SELECT et cet INSERT
      // (fenêtre de course rare pour une action manuelle ponctuelle) —
      // relit la ligne réellement créée plutôt que propager l'erreur.
      if ((err as { code?: string }).code === "23505") {
        const relu = await this.pool.query(`${PostgresServerStorage.SELECT_POSTE} WHERE role = 'shop' LIMIT 1`);
        return relu.rows[0] as PosteRow;
      }
      throw err;
    }
  }

  async definirNomPoste(id: string, nom: string, maintenant: string): Promise<{ applique: boolean }> {
    const res = await this.pool.query(`UPDATE postes SET nom = $1, updated_at = $2 WHERE id = $3`, [nom, maintenant, id]);
    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async bloquerPoste(id: string, maintenant: string): Promise<{ applique: boolean }> {
    const res = await this.pool.query(`UPDATE postes SET statut = 'bloque', updated_at = $1 WHERE id = $2`, [maintenant, id]);
    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async reautoriserPoste(id: string, maintenant: string): Promise<{ applique: boolean }> {
    const res = await this.pool.query(`UPDATE postes SET statut = 'actif', updated_at = $1 WHERE id = $2`, [maintenant, id]);
    return { applique: (res.rowCount ?? 0) > 0 };
  }

  async retirerPoste(id: string): Promise<{ applique: boolean }> {
    const res = await this.pool.query(`DELETE FROM postes WHERE id = $1`, [id]);
    return { applique: (res.rowCount ?? 0) > 0 };
  }
}
