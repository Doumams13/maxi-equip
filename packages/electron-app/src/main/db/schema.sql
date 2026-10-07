-- Schéma initial de la base locale (SQLite / SQLCipher).
-- Reflète les entités validées (Synthèse §6, Corrections §2-§9).
-- Phase 0 : structure préparée. Les contraintes métier fines (ex. montants
-- positifs, cohérence des statuts) seront renforcées en Phase 1 au niveau
-- du domaine, en complément de ce schéma.

PRAGMA foreign_keys = ON;

-- ==========================================================
-- Emplacements (SHOP + dépôts)
-- ==========================================================
CREATE TABLE IF NOT EXISTS emplacements (
  id                 TEXT PRIMARY KEY,
  nom                TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('shop', 'depot')),
  ville              TEXT NOT NULL,
  est_point_de_vente INTEGER NOT NULL CHECK (est_point_de_vente IN (0, 1)),
  -- Correction "Points de vente dynamiques" : archivage (jamais une
  -- suppression physique, §5/§9 — les ventes/entrées/transferts/stock
  -- historiques doivent rester intacts et consultables). 1 = actif par
  -- défaut, y compris pour SHOP/Akébé/Akanda déjà existants.
  actif              INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- ==========================================================
-- Catalogue
-- ==========================================================

-- Modèles de carreaux (motif/patron) — regroupe plusieurs variantes (formats).
-- Les images appartiennent au modèle, pas à une variante spécifique.
CREATE TABLE IF NOT EXISTS modeles_produit (
  id            TEXT PRIMARY KEY,
  motif         TEXT NOT NULL,
  type          TEXT NOT NULL,
  -- Position d'affichage dans la vitrine du site public (0 = premier),
  -- NULL = non sélectionné — voir shared-types/produit.ts.
  ordre_vitrine INTEGER,
  deleted_at    TEXT,
  deleted_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_modeles_produit_type ON modeles_produit (type);
CREATE INDEX IF NOT EXISTS idx_modeles_produit_updated_at ON modeles_produit (updated_at);

-- Variantes (formats/tailles) d'un modèle — chacune a son propre prix et sa
-- propre référence. Le motif/type sont dénormalisés depuis le modèle pour
-- l'affichage dans les factures/mouvements sans jointure supplémentaire.
CREATE TABLE IF NOT EXISTS produits (
  id            TEXT PRIMARY KEY,
  modele_id     TEXT REFERENCES modeles_produit (id),
  motif         TEXT NOT NULL,
  type          TEXT NOT NULL,
  taille        TEXT NOT NULL,
  taille_tri    REAL NOT NULL,
  largeur       REAL,
  hauteur       REAL,
  reference     TEXT NOT NULL,
  prix          INTEGER NOT NULL,
  seuil_alerte  INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  deleted_by    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_produits_taille_tri ON produits (taille_tri);
CREATE INDEX IF NOT EXISTS idx_produits_updated_at ON produits (updated_at);
-- L'index sur modele_id n'est JAMAIS créé ici (même bug déjà corrigé une
-- fois pour mouvements.utilisateur_id, voir migrate.ts) : sur une base
-- existante créée avant la colonne modele_id, "CREATE TABLE IF NOT
-- EXISTS produits" ci-dessus est un no-op (la colonne n'est pas
-- ajoutée), et cette ligne échouerait avec "no such column: modele_id"
-- avant même que la migration dédiée (ajouterIndexModeleIdProduitsSiAbsent)
-- n'ait la moindre chance de s'exécuter. Créé uniquement dans migrate.ts,
-- après avoir garanti que la colonne existe.
-- Unicité de la référence UNIQUEMENT parmi les produits actifs (correction
-- Phase 2 §5) : un produit réellement supprimé (soft delete) ne doit
-- jamais bloquer la réutilisation de sa référence par un nouveau produit.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produits_reference_actif ON produits (reference) WHERE deleted_at IS NULL;

-- Images de carreaux — liées au modèle (pas à une variante), une même
-- galerie couvre toutes les tailles d'un même motif.
CREATE TABLE IF NOT EXISTS images_produit (
  id           TEXT PRIMARY KEY,
  modele_id    TEXT NOT NULL REFERENCES modeles_produit (id),
  kind         TEXT NOT NULL CHECK (kind IN ('produit', 'logo')),
  chemin_local TEXT NOT NULL,
  url_cloud    TEXT,
  ordre        INTEGER NOT NULL DEFAULT 0,
  est_principale INTEGER NOT NULL DEFAULT 0 CHECK (est_principale IN (0, 1)),
  sync_status  TEXT NOT NULL CHECK (sync_status IN ('pending', 'sent', 'confirmed', 'error')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- ==========================================================
-- Stock et mouvements
-- ==========================================================
CREATE TABLE IF NOT EXISTS stocks (
  id             TEXT PRIMARY KEY,
  produit_id     TEXT NOT NULL REFERENCES produits (id),
  emplacement_id TEXT NOT NULL REFERENCES emplacements (id),
  quantite       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (produit_id, emplacement_id)
);

CREATE TABLE IF NOT EXISTS mouvements (
  id                          TEXT PRIMARY KEY,
  type                        TEXT NOT NULL CHECK (type IN ('entree', 'sortie', 'transfert')),
  produit_id                  TEXT NOT NULL REFERENCES produits (id),
  emplacement_id              TEXT REFERENCES emplacements (id),
  emplacement_source_id       TEXT REFERENCES emplacements (id),
  emplacement_destination_id  TEXT REFERENCES emplacements (id),
  quantite                    INTEGER NOT NULL CHECK (quantite > 0),
  date                        TEXT NOT NULL,
  facture_id                  TEXT REFERENCES factures (id),
  utilisateur_id              TEXT REFERENCES utilisateurs (id),
  note                        TEXT,
  -- Annulation d'un mouvement manuel (entrée/sortie saisie par erreur,
  -- jamais une sortie de vente — voir shared-types/stock.ts) — jamais
  -- supprimé, seulement annoté, même principe que factures.annulee_le.
  annule_le                   TEXT,
  annule_par                  TEXT REFERENCES utilisateurs (id),
  motif_annulation            TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mouvements_produit ON mouvements (produit_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_date ON mouvements (date);

-- ==========================================================
-- Facturation (facture client / relevé interne strictement séparés)
-- ==========================================================
CREATE TABLE IF NOT EXISTS factures (
  id                     TEXT PRIMARY KEY,
  numero                 TEXT NOT NULL,
  date                   TEXT NOT NULL,
  emplacement_id         TEXT NOT NULL REFERENCES emplacements (id),
  client_nom             TEXT NOT NULL,
  client_telephone       TEXT,
  client_adresse         TEXT,
  vendeur_utilisateur_id TEXT NOT NULL REFERENCES utilisateurs (id),
  vendeur_nom_manuel     TEXT,
  mode_reglement         TEXT,
  total                  INTEGER NOT NULL,
  -- Remise commerciale en FCFA, correction "Remise / Négociation" —
  -- jamais NULL, une remise absente vaut 0 (voir shared-types/facture.ts).
  remise                 INTEGER NOT NULL DEFAULT 0,
  -- Statut de paiement, correction "Réservation / Acompte" — jamais NULL.
  -- "reservation" = acompte versé (montant_paye < total net), "payee" =
  -- réglé intégralement (montant_paye === total net). Indépendant du
  -- statut de livraison ci-dessous (voir shared-types/facture.ts).
  statut_paiement        TEXT NOT NULL DEFAULT 'payee' CHECK (statut_paiement IN ('reservation', 'payee')),
  montant_paye           INTEGER NOT NULL DEFAULT 0,
  -- "Facturation" : statut de livraison (jamais de statut "non payée" —
  -- une facture n'existe qu'une fois le paiement confirmé, §13).
  statut_livraison       TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut_livraison IN ('en_attente', 'livree')),
  livree_le              TEXT,
  -- Annulation (§5/§6/§21) : suppression douce uniquement — jamais de
  -- perte de données, la vente reste dans l'historique avec son motif.
  annulee_le             TEXT,
  annulee_par            TEXT REFERENCES utilisateurs (id),
  motif_annulation       TEXT,
  -- Renseigné UNIQUEMENT sur une facture annulée, une fois qu'elle a
  -- servi de base à une correction via "Modifier" — empêche de proposer
  -- une seconde correction à partir de la même erreur déjà traitée.
  corrigee_par_facture_id TEXT REFERENCES factures (id),
  -- Correction Phase Finale, Bloc 6 : instantané JSON de l'identité
  -- entreprise (nom/adresse/quartier/téléphones/responsables) au moment
  -- de la vente — jamais relu en direct depuis parametres_entreprise
  -- pour une facture déjà émise. NULL pour les factures antérieures à
  -- cette évolution (voir migrate.ts).
  identite_snapshot_json TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lignes_facture (
  id                   TEXT PRIMARY KEY,
  facture_id           TEXT NOT NULL REFERENCES factures (id),
  produit_id           TEXT REFERENCES produits (id),
  motif                TEXT NOT NULL,
  reference            TEXT,
  taille               TEXT NOT NULL,
  quantite             INTEGER NOT NULL CHECK (quantite > 0),
  prix_unitaire        INTEGER NOT NULL,
  -- Champs promotion : renseignés uniquement si une promotion était active
  -- au moment de la vente — conservés même si la promotion est supprimée.
  prix_unitaire_normal INTEGER,
  promotion_id         TEXT,
  promotion_libelle    TEXT,
  promotion_type       TEXT,
  promotion_valeur     REAL
  -- Volontairement AUCUN champ fournisseur / prix d'achat ici (Corrections §7/§9 point 12).
);

-- Document interne, jamais transmis au client — table physiquement distincte.
CREATE TABLE IF NOT EXISTS releves_internes_approvisionnement (
  id          TEXT PRIMARY KEY,
  facture_id  TEXT NOT NULL REFERENCES factures (id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lignes_releve_interne (
  id                TEXT PRIMARY KEY,
  releve_id         TEXT NOT NULL REFERENCES releves_internes_approvisionnement (id),
  motif             TEXT NOT NULL,
  taille            TEXT NOT NULL,
  quantite          INTEGER NOT NULL CHECK (quantite > 0),
  fournisseur       TEXT NOT NULL,
  prix_achat        INTEGER NOT NULL,
  prix_vente        INTEGER NOT NULL
);

-- ==========================================================
-- Demandes du site + notifications
-- ==========================================================
CREATE TABLE IF NOT EXISTS demandes (
  id               TEXT PRIMARY KEY,
  numero           TEXT NOT NULL UNIQUE,
  statut           TEXT NOT NULL CHECK (statut IN
                     ('nouvelle','en_cours','a_contacter','contactee','confirmee','refusee','annulee')),
  client_nom       TEXT NOT NULL,
  client_telephone TEXT NOT NULL,
  client_adresse   TEXT NOT NULL,
  client_email     TEXT,
  commentaire      TEXT,
  facture_id       TEXT REFERENCES factures (id),
  refus_motif      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Correction "Intégration Site Phase 5" : produit_id n'est JAMAIS une
-- clé étrangère vers produits(id) — une demande vient d'une source
-- externe (le site vitrine) dont le catalogue n'est pas garanti d'être
-- synchronisé avec les identifiants réels de cette installation.
-- Traité comme une donnée informative dénormalisée, exactement comme
-- motif/taille/prix_indicatif juste en dessous — jamais un identifiant
-- garanti résoluble localement. Le personnel choisit le vrai produit
-- lui-même lors du traitement (écran Vente, jamais deviné).
CREATE TABLE IF NOT EXISTS lignes_demande (
  id               TEXT PRIMARY KEY,
  demande_id       TEXT NOT NULL REFERENCES demandes (id),
  produit_id       TEXT NOT NULL,
  motif            TEXT NOT NULL,
  taille           TEXT NOT NULL,
  quantite         INTEGER NOT NULL CHECK (quantite > 0),
  prix_indicatif   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('demande', 'stock', 'sync')),
  titre       TEXT NOT NULL,
  message     TEXT NOT NULL,
  lue         INTEGER NOT NULL DEFAULT 0 CHECK (lue IN (0, 1)),
  demande_id  TEXT REFERENCES demandes (id),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ==========================================================
-- Promotions
-- ==========================================================
CREATE TABLE IF NOT EXISTS promotions (
  id              TEXT PRIMARY KEY,
  libelle         TEXT NOT NULL,
  type_reduction  TEXT NOT NULL CHECK (type_reduction IN ('pourcentage', 'montant_fixe')),
  valeur          REAL NOT NULL CHECK (valeur > 0),
  perimetre       TEXT NOT NULL CHECK (perimetre IN ('global', 'cible')),
  date_debut      TEXT NOT NULL,
  date_fin        TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promotions_date ON promotions (date_debut, date_fin);

-- Produits ciblés par une promotion de périmètre "cible".
-- Table vide pour les promotions "global" (les deux ne coexistent jamais).
CREATE TABLE IF NOT EXISTS promotion_produits (
  promotion_id  TEXT NOT NULL REFERENCES promotions (id) ON DELETE CASCADE,
  produit_id    TEXT NOT NULL REFERENCES produits (id),
  PRIMARY KEY (promotion_id, produit_id)
);

-- ==========================================================
-- Utilisateurs (Administrateur / Gérant)
-- ==========================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
  id             TEXT PRIMARY KEY,
  nom            TEXT NOT NULL,
  identifiant    TEXT NOT NULL UNIQUE,
  -- Hachage Argon2id du mot de passe. Jamais le mot de passe en clair (Synthèse §2/§3).
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('administrateur', 'gerant')),
  actif          INTEGER NOT NULL DEFAULT 1 CHECK (actif IN (0, 1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- ==========================================================
-- Paramètres entreprise (singleton — une seule ligne, id fixe 'singleton')
-- ==========================================================
CREATE TABLE IF NOT EXISTS parametres_entreprise (
  id         TEXT PRIMARY KEY CHECK (id = 'singleton'),
  nom        TEXT NOT NULL,
  logo_url   TEXT,
  adresse    TEXT NOT NULL,
  ville      TEXT NOT NULL,
  telephone  TEXT NOT NULL,
  email      TEXT NOT NULL,
  whatsapp   TEXT NOT NULL,
  -- Correction "Paramètres — Administrateur/Gérant configurables" :
  -- noms des responsables affichés sur les documents (facture, document
  -- interne) — jamais confondus avec le rôle de connexion "administrateur"
  -- /"gerant" (permissions), qui reste inchangé. NULL = non configuré,
  -- jamais une chaîne "undefined" affichée sur un document.
  nom_administrateur TEXT,
  nom_gerant         TEXT,
  updated_at TEXT NOT NULL
);

-- Numéros de téléphone de l'entreprise — plusieurs possibles (correction
-- "Paramètres" §Identité : "je ne veux pas limiter l'entreprise à un seul
-- numéro"). Table séparée plutôt qu'une colonne unique sur
-- parametres_entreprise, qui ne gardait qu'un seul numéro (`telephone`,
-- conservée telle quelle pour ne rien casser, mais plus utilisée en
-- écriture après cette correction — voir migration).
CREATE TABLE IF NOT EXISTS telephones_entreprise (
  id         TEXT PRIMARY KEY,
  numero     TEXT NOT NULL,
  ordre      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ==========================================================
-- Tables TECHNIQUES — locales uniquement, jamais répliquées au cloud
-- (Synthèse §6/§7, Corrections §3)
-- ==========================================================
CREATE TABLE IF NOT EXISTS boite_envoi (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'confirmed', 'error')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boite_envoi_status ON boite_envoi (status);

CREATE TABLE IF NOT EXISTS journal_sauvegardes (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('fermeture', 'quotidienne', 'manuelle')),
  location    TEXT NOT NULL CHECK (location IN ('disque_local', 'cloud')),
  chemin      TEXT,
  status      TEXT NOT NULL CHECK (status IN ('ok', 'echec')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_factures_pdf (
  id           TEXT PRIMARY KEY,
  facture_id   TEXT NOT NULL REFERENCES factures (id),
  chemin_local TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- Correction "SHOP sur la facture" : le nom du magasin affiché sur les
-- documents vient de la table `parametres_entreprise` définie ci-dessus
-- (colonne `nom`, singleton id='singleton') — jamais du nom interne de
-- l'emplacement point-de-vente ("SHOP", un identifiant technique
-- distinct du nom commercial affiché aux clients). Aucune nouvelle table
-- créée ici : une table dédiée existait déjà, la réutiliser était la
-- bonne approche plutôt que d'en dupliquer une seconde.
