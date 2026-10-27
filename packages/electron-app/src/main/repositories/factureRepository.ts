import type Database from "better-sqlite3-multiple-ciphers";
import { randomUUID } from "node:crypto";
import type { Facture, IdentiteEntrepriseSnapshot, LigneFacture, LigneReleveInterne } from "@maxi-equip/shared-types";

interface FactureRow {
  id: string;
  numero: string;
  date: string;
  emplacement_id: string;
  client_nom: string;
  client_telephone: string | null;
  client_adresse: string | null;
  vendeur_utilisateur_id: string;
  vendeur_nom_manuel: string | null;
  mode_reglement: string | null;
  total: number;
  remise: number;
  statut_paiement: "reservation" | "payee";
  montant_paye: number;
  statut_livraison: "en_attente" | "livree";
  livree_le: string | null;
  annulee_le: string | null;
  annulee_par: string | null;
  motif_annulation: string | null;
  corrigee_par_facture_id: string | null;
  identite_snapshot_json: string | null;
}

function rowToFacture(row: FactureRow, lignes: LigneFacture[]): Facture {
  return {
    id: row.id,
    numero: row.numero,
    date: row.date,
    emplacementId: row.emplacement_id,
    clientNom: row.client_nom,
    clientTelephone: row.client_telephone,
    clientAdresse: row.client_adresse,
    vendeurUtilisateurId: row.vendeur_utilisateur_id,
    vendeurNomManuel: row.vendeur_nom_manuel,
    modeReglement: row.mode_reglement,
    lignes,
    total: row.total,
    remise: row.remise,
    statutPaiement: row.statut_paiement,
    montantPaye: row.montant_paye,
    statutLivraison: row.statut_livraison,
    livreeLe: row.livree_le,
    annuleeLe: row.annulee_le,
    annuleePar: row.annulee_par,
    motifAnnulation: row.motif_annulation,
    corrigeeParFactureId: row.corrigee_par_facture_id,
    // Correction Phase Finale, Bloc 6 — jamais reconstruit : `null` si la
    // facture est antérieure à cette évolution ou si le JSON est illisible.
    identiteSnapshot: row.identite_snapshot_json ? (safeParseIdentiteSnapshot(row.identite_snapshot_json)) : null,
    createdAt: "",
    updatedAt: "",
  };
}

function safeParseIdentiteSnapshot(json: string): IdentiteEntrepriseSnapshot | null {
  try {
    return JSON.parse(json) as IdentiteEntrepriseSnapshot;
  } catch {
    return null; // JSON corrompu — jamais une exception qui bloquerait la lecture de toute la facture.
  }
}

export class FactureRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Prochain numéro séquentiel FAC-AAAA-XXXX (Phase 0 §6 : numérotation des factures).
   *
   * SÉCURITÉ VERSION ACTUELLE (audit "Phase 3 — Numérotation des
   * factures") : cette méthode est TOUJOURS appelée à l'intérieur de la
   * même transaction synchrone que l'insertion de la facture elle-même
   * (voir VenteService.enregistrerVente — aucun `await` entre les deux),
   * et c'est son seul point d'appel dans tout le projet. Comme
   * JavaScript est mono-thread et que better-sqlite3 sérialise déjà les
   * transactions d'écriture au niveau du moteur SQLite, ce calcul et
   * l'insertion qui suit forment un bloc atomique — y compris si
   * l'application venait un jour à être lancée deux fois simultanément
   * (aucun risque de doublon observé, aucune modification nécessaire ici
   * pour l'installation unique actuelle). Un filet de sécurité
   * supplémentaire, indépendant de cette méthode, existe déjà au niveau
   * de la base : `idx_factures_numero_actif` (voir migrate.ts) refuse
   * tout doublon de `numero` parmi les factures actives, même si cette
   * garantie applicative venait à être un jour cassée par erreur.
   *
   * PRÉPARATION ARCHITECTURALE FUTURE — NON IMPLÉMENTÉE : ce numéro
   * reste et doit rester un identifiant purement AFFICHÉ (jamais
   * utilisé pour les relations entre tables, qui reposent exclusivement
   * sur `id`, un UUID technique). Le jour où plusieurs installations
   * partageront un serveur central, ce numéro local devra être distingué
   * de l'UUID technique de synchronisation : la stratégie envisageable
   * (jamais décidée ni implémentée ici) consisterait soit à n'exposer ce
   * numéro simple qu'au sein d'une seule installation à la fois, soit à
   * le faire coexister avec un numéro canonique attribué par le serveur
   * central après synchronisation — sans jamais changer le format
   * `FAC-AAAA-XXXX` déjà familier aux utilisateurs. Aucun identifiant
   * d'appareil ni préfixe technique n'est ajouté par ce commentaire —
   * c'est une note d'intention, pas du code.
   */
  /**
   * Correction "travail à distance / plusieurs machines en parallèle"
   * (2026-10-22) — PRÉPARATION ARCHITECTURALE FUTURE ci-dessus,
   * maintenant implémentée : le préfixe seul (ex. "FAC-2026-"), calculé
   * ici pour que VenteService.enregistrerVente l'envoie au serveur
   * central (ValidationStockDistanteService), qui attribue alors le
   * PROCHAIN numéro complet lui-même — format `FAC-AAAA-XXXX` inchangé,
   * jamais un numéro technique/d'appareil ajouté.
   */
  prefixNumeroCourant(): string {
    return `FAC-${new Date().getFullYear()}-`;
  }

  nextNumero(): string {
    const prefix = this.prefixNumeroCourant();
    const row = this.db
      .prepare("SELECT numero FROM factures WHERE numero LIKE ? ORDER BY numero DESC LIMIT 1")
      .get(`${prefix}%`) as { numero: string } | undefined;
    const nextSeq = row ? parseInt(row.numero.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  }

  /**
   * Toutes les factures — actives ET annulées (correction : "une facture
   * annulée doit rester visible dans l'onglet Factures", §3). Le statut
   * (actif/annulé) est porté par `annuleeLe`, jamais par l'absence de la
   * ligne — plus aucune facture n'est masquée par cette méthode.
   */
  list(limit = 200): Facture[] {
    const rows = this.db.prepare("SELECT * FROM factures ORDER BY date DESC LIMIT ?").all(limit) as FactureRow[];
    return rows.map((row) => rowToFacture(row, this.getLignes(row.id)));
  }

  findById(id: string): Facture | null {
    const row = this.db.prepare("SELECT * FROM factures WHERE id = ?").get(id) as FactureRow | undefined;
    return row ? rowToFacture(row, this.getLignes(row.id)) : null;
  }

  /** Facture unique avec le nom/rôle du vendeur résolu — utilisé pour la génération du document PDF. */
  findByIdAvecVendeur(id: string): (Facture & { vendeurNom: string | null; vendeurRole: string | null }) | null {
    const facture = this.findById(id);
    if (!facture) return null;
    const u = this.db.prepare("SELECT nom, role FROM utilisateurs WHERE id = ?").get(facture.vendeurUtilisateurId) as
      | { nom: string; role: string }
      | undefined;
    return { ...facture, vendeurNom: u?.nom ?? null, vendeurRole: u?.role ?? null };
  }

  /** Nombre de factures ACTIVES uniquement — indicateurs du dashboard (une facture annulée ne compte jamais). */
  count(): number {
    return (this.db.prepare("SELECT COUNT(*) as n FROM factures WHERE annulee_le IS NULL").get() as { n: number }).n;
  }

  /** Somme des totaux des factures ACTIVES uniquement — chiffre d'affaires (dashboard §3/§13). Une facture annulée ne compte jamais dans le CA. */
  sommeTotal(): number {
    return (this.db.prepare("SELECT COALESCE(SUM(total), 0) as s FROM factures WHERE annulee_le IS NULL").get() as { s: number }).s;
  }

  /** Total facturé sur le mois en cours (factures actives uniquement) — bandeau d'en-tête de l'écran Factures. */
  sommeTotalMoisCourant(): { nombre: number; total: number } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as nombre, COALESCE(SUM(total), 0) as total FROM factures
         WHERE annulee_le IS NULL AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`
      )
      .get() as { nombre: number; total: number };
    return row;
  }

  /**
   * Total facturé sur le jour en cours (factures actives uniquement) —
   * correction "voir le revenu journalier" (2026-10-21), dashboard
   * Administrateur. Même principe que sommeTotalMoisCourant() ci-dessus
   * (strftime sur la date SQLite), jamais recalculé côté JS pour rester
   * cohérent avec elle.
   */
  sommeTotalJourCourant(): number {
    return (
      this.db
        .prepare(
          `SELECT COALESCE(SUM(total), 0) as s FROM factures
           WHERE annulee_le IS NULL AND strftime('%Y-%m-%d', date) = strftime('%Y-%m-%d', 'now')`
        )
        .get() as { s: number }
    ).s;
  }

  /**
   * Bilan d'activité (2026-10-21) — agrégats sur une plage de dates LIBRE
   * (contrairement à sommeTotalJourCourant/MoisCourant ci-dessus, bornées
   * au jour/mois en cours) : CA, nombre de factures et remises accordées,
   * factures actives uniquement. `debut`/`fin` sont des bornes ISO
   * [debut, fin] INCLUSIVES — l'appelant (BilanScreen) passe la fin de
   * journée (23:59:59.999) pour une plage se terminant "aujourd'hui".
   */
  bilanVentesEntre(debut: string, fin: string): { caTotal: number; nombreFactures: number; remiseTotale: number } {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) as caTotal, COUNT(*) as nombreFactures, COALESCE(SUM(remise), 0) as remiseTotale
         FROM factures WHERE annulee_le IS NULL AND date >= ? AND date <= ?`
      )
      .get(debut, fin) as { caTotal: number; nombreFactures: number; remiseTotale: number };
    return row;
  }

  /**
   * Produits les plus vendus sur une plage de dates LIBRE — même principe
   * que topProduitsVendus() ci-dessous (référence, jamais le motif — voir
   * sa propre correction "motif → référence"), borné à la période.
   */
  topProduitsVendusEntre(debut: string, fin: string, limite = 5): { label: string; quantite: number }[] {
    const rows = this.db
      .prepare(
        `SELECT COALESCE(lf.reference, lf.motif || ' — ' || lf.taille) as label, SUM(lf.quantite) as quantite
         FROM lignes_facture lf
         JOIN factures f ON f.id = lf.facture_id
         WHERE f.annulee_le IS NULL AND f.date >= ? AND f.date <= ?
         GROUP BY COALESCE(lf.reference, lf.motif || ' — ' || lf.taille) ORDER BY quantite DESC LIMIT ?`
      )
      .all(debut, fin, limite) as { label: string; quantite: number }[];
    return rows;
  }

  /**
   * Produits les plus vendus, agrégés depuis les lignes de facture des
   * factures ACTIVES uniquement (§7/§13 d'une correction précédente,
   * complété pour exclure les ventes annulées).
   *
   * Correction "motif → référence" (2026-10-21) : affiche la référence du
   * produit plutôt que son motif (plusieurs produits différents peuvent
   * partager le même motif, ex. plusieurs tailles d'un même carreau — la
   * référence identifie une variante précise). `COALESCE` vers l'ancien
   * libellé motif+taille UNIQUEMENT pour les lignes de facture antérieures
   * à l'ajout de la référence (`reference` NULL) — jamais une valeur
   * inventée pour ces lignes historiques.
   */
  topProduitsVendus(limite = 5): { label: string; quantite: number }[] {
    const rows = this.db
      .prepare(
        `SELECT COALESCE(lf.reference, lf.motif || ' — ' || lf.taille) as label, SUM(lf.quantite) as quantite
         FROM lignes_facture lf
         JOIN factures f ON f.id = lf.facture_id
         WHERE f.annulee_le IS NULL
         GROUP BY COALESCE(lf.reference, lf.motif || ' — ' || lf.taille) ORDER BY quantite DESC LIMIT ?`
      )
      .all(limite) as { label: string; quantite: number }[];
    return rows;
  }

  private getLignes(factureId: string): LigneFacture[] {
    const rows = this.db
      .prepare(
        `SELECT produit_id as produitId, motif, reference, taille, quantite, prix_unitaire as prixUnitaire,
                prix_unitaire_normal as prixUnitaireNormal, promotion_id as promotionId,
                promotion_libelle as promotionLibelle, promotion_type as promotionType,
                promotion_valeur as promotionValeur, surface_carton_m2 as surfaceCartonM2
         FROM lignes_facture WHERE facture_id = ?`
      )
      .all(factureId) as LigneFacture[];
    return rows;
  }

  /**
   * Crée la facture CLIENT et ses lignes. N'écrit JAMAIS de donnée
   * fournisseur/coût d'achat (le type LigneFacture ne le permet
   * structurellement pas — voir packages/domain/src/invoicing).
   */
  create(input: {
    numero: string;
    date: string;
    emplacementId: string;
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    vendeurUtilisateurId: string;
    vendeurNomManuel: string | null;
    modeReglement: string | null;
    lignes: LigneFacture[];
    total: number;
    /** Remise commerciale en FCFA — voir shared-types/facture.ts. Jamais optionnel : l'appelant doit toujours trancher explicitement (0 si aucune). */
    remise: number;
    /** Statut de paiement — voir shared-types/facture.ts. Jamais optionnel, même valeur de principe que remise. */
    statutPaiement: "reservation" | "payee";
    /** Montant réellement encaissé — voir shared-types/facture.ts (déjà validé par domain.validerMontantPaye avant l'appel). */
    montantPaye: number;
    /** Correction Phase Finale, Bloc 6 — instantané de l'identité entreprise au moment de la vente, jamais relu en direct plus tard. */
    identiteSnapshot: IdentiteEntrepriseSnapshot | null;
  }): string {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO factures
         (id, numero, date, emplacement_id, client_nom, client_telephone, client_adresse, vendeur_utilisateur_id, vendeur_nom_manuel, mode_reglement, total, remise, statut_paiement, montant_paye, statut_livraison, identite_snapshot_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?)`
      )
      .run(
        id,
        input.numero,
        input.date,
        input.emplacementId,
        input.clientNom,
        input.clientTelephone,
        input.clientAdresse,
        input.vendeurUtilisateurId,
        input.vendeurNomManuel,
        input.modeReglement,
        input.total,
        input.remise,
        input.statutPaiement,
        input.montantPaye,
        input.identiteSnapshot ? JSON.stringify(input.identiteSnapshot) : null,
        now,
        now
      );

    const insertLigne = this.db.prepare(
      `INSERT INTO lignes_facture
         (id, facture_id, produit_id, motif, reference, taille, quantite, prix_unitaire,
          prix_unitaire_normal, promotion_id, promotion_libelle, promotion_type, promotion_valeur, surface_carton_m2)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ligne of input.lignes) {
      insertLigne.run(
        randomUUID(), id, ligne.produitId, ligne.motif, ligne.reference, ligne.taille, ligne.quantite, ligne.prixUnitaire,
        ligne.prixUnitaireNormal ?? null, ligne.promotionId ?? null, ligne.promotionLibelle ?? null,
        ligne.promotionType ?? null, ligne.promotionValeur ?? null, ligne.surfaceCartonM2 ?? null
      );
    }

    return id;
  }

  /**
   * Insère une facture reçue d'un autre poste — correction "visibilité
   * croisée Factures/Historique entre postes" (2026-10-27), Phase 4.
   * Conserve l'`id` EXACT d'origine (jamais un nouvel UUID local, même
   * principe que les autres `creerDepuisServeur` de ce projet) : c'est
   * cet id qui permet à une annulation reçue plus tard de retrouver la
   * bonne facture. Idempotent par construction (`SELECT` avant
   * `INSERT`) — un écho de sa propre machine d'origine, ou un second
   * passage du balayage de rattrapage, ne crée jamais de doublon.
   *
   * `statutLivraison` n'est volontairement PAS reçu ici (absent du
   * payload "vente", voir venteService.ts) : une facture reçue démarre
   * toujours "en_attente", comme une facture créée localement — un
   * changement de statut de livraison ultérieur sur son poste d'origine
   * ne se propage pas (limite connue, hors périmètre de cette
   * correction, qui porte sur la VISIBILITÉ des factures/mouvements,
   * pas sur la réplication complète de tous leurs changements d'état).
   *
   * Les lignes n'ont pas d'id stable à conserver (`LigneFacture` n'en
   * expose aucun, voir shared-types/facture.ts) — regénérées localement,
   * exactement comme `create()` ci-dessus le fait déjà.
   *
   * Renvoie `false` sans rien écrire si l'insertion échoue (typiquement
   * une clé étrangère pas encore résolvable localement —
   * `emplacement_id`/`vendeur_utilisateur_id`, voir
   * EmplacementSyncService/CompteSyncService) : jamais bloquant, une
   * nouvelle tentative aura lieu au prochain cycle de synchronisation
   * (voir SyncRepository.listerNonAppliquees).
   */
  creerDepuisServeur(facture: {
    id: string;
    numero: string;
    date: string;
    emplacementId: string;
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    vendeurUtilisateurId: string;
    vendeurNomManuel: string | null;
    modeReglement: string | null;
    lignes: LigneFacture[];
    total: number;
    remise: number;
    statutPaiement: "reservation" | "payee";
    montantPaye: number;
    identiteSnapshot: IdentiteEntrepriseSnapshot | null;
  }): boolean {
    const existe = this.db.prepare("SELECT id FROM factures WHERE id = ?").get(facture.id) as { id: string } | undefined;
    if (existe) return true;

    try {
      const executer = this.db.transaction(() => {
        const now = new Date().toISOString();
        this.db
          .prepare(
            `INSERT INTO factures
             (id, numero, date, emplacement_id, client_nom, client_telephone, client_adresse, vendeur_utilisateur_id, vendeur_nom_manuel, mode_reglement, total, remise, statut_paiement, montant_paye, statut_livraison, identite_snapshot_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?)`
          )
          .run(
            facture.id,
            facture.numero,
            facture.date,
            facture.emplacementId,
            facture.clientNom,
            facture.clientTelephone,
            facture.clientAdresse,
            facture.vendeurUtilisateurId,
            facture.vendeurNomManuel,
            facture.modeReglement,
            facture.total,
            facture.remise,
            facture.statutPaiement,
            facture.montantPaye,
            facture.identiteSnapshot ? JSON.stringify(facture.identiteSnapshot) : null,
            now,
            now
          );

        const insertLigne = this.db.prepare(
          `INSERT INTO lignes_facture
             (id, facture_id, produit_id, motif, reference, taille, quantite, prix_unitaire,
              prix_unitaire_normal, promotion_id, promotion_libelle, promotion_type, promotion_valeur, surface_carton_m2)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const ligne of facture.lignes) {
          insertLigne.run(
            randomUUID(), facture.id, ligne.produitId, ligne.motif, ligne.reference, ligne.taille, ligne.quantite, ligne.prixUnitaire,
            ligne.prixUnitaireNormal ?? null, ligne.promotionId ?? null, ligne.promotionLibelle ?? null,
            ligne.promotionType ?? null, ligne.promotionValeur ?? null, ligne.surfaceCartonM2 ?? null
          );
        }
      });
      executer();
      return true;
    } catch {
      // Violation de clé étrangère (emplacement/vendeur pas encore
      // résolvable localement) — jamais bloquant, retenté au prochain cycle.
      return false;
    }
  }

  /**
   * Applique une annulation reçue d'un autre poste — correction
   * "visibilité croisée Factures/Historique entre postes" (2026-10-27),
   * Phase 4. Utilise le timestamp D'ORIGINE (`annuleeLe`, transmis dans
   * le payload), JAMAIS "maintenant" (contrairement à `annuler()`
   * ci-dessus, appelé uniquement pour une annulation réalisée SUR ce
   * poste). Idempotent et jamais bloquant :
   * - la facture correspondante n'existe pas encore localement (reçue
   *   avant que sa "vente" d'origine ait pu s'appliquer, ou jamais
   *   reçue) → ne fait rien, DOIT être retenté au prochain cycle ;
   * - déjà annulée (écho de sa propre machine d'origine — qui a annulé
   *   via `annuler()` ci-dessus, pas ce chemin — ou second passage du
   *   balayage de rattrapage) → ne fait rien, mais c'est un succès : il
   *   n'y a plus rien à faire, jamais besoin de retenter.
   *
   * Distingue donc DEUX `false` différents pour l'appelant : `applique:
   * false` (rien à faire, ne JAMAIS retenter — déjà dans l'état visé)
   * vs `applique: true` avec `effectuee: false` serait trompeur, d'où
   * la forme `{ traitee: boolean }` ci-dessous — `traitee: false`
   * signifie EXCLUSIVEMENT "pas encore prêt, retenter" (voir
   * SyncRepository.listerNonAppliquees).
   */
  appliquerAnnulationDepuisServeur(annulation: { factureId: string; motif: string; annuleePar: string; annuleeLe: string }): { traitee: boolean } {
    const facture = this.db.prepare("SELECT annulee_le FROM factures WHERE id = ?").get(annulation.factureId) as { annulee_le: string | null } | undefined;
    if (!facture) return { traitee: false };
    if (facture.annulee_le) return { traitee: true };
    this.db
      .prepare("UPDATE factures SET annulee_le = ?, annulee_par = ?, motif_annulation = ?, updated_at = ? WHERE id = ?")
      .run(annulation.annuleeLe, annulation.annuleePar, annulation.motif, annulation.annuleeLe, annulation.factureId);
    return { traitee: true };
  }

  /**
   * Change le statut (paiement + livraison) d'une facture — correction
   * "Réservation / Acompte". Remplace l'ancienne `marquerLivree()`, trop
   * étroite pour couvrir les 3 statuts affichés ("Réservation" / "Payée —
   * non livrée" / "Payée — livrée") : désormais un seul point d'écriture,
   * librement réversible dans les deux sens pour les statuts de livraison
   * (aucun verrou "terminus" — décision explicite), sauf retour en arrière
   * vers "Réservation" qui n'a pas de sens une fois le solde encaissé
   * (refusé en amont, dans VenteService, jamais ici).
   */
  changerStatut(id: string, statut: { statutPaiement: "reservation" | "payee"; montantPaye: number; statutLivraison: "en_attente" | "livree" }): void {
    const now = new Date().toISOString();
    const livreeLe = statut.statutLivraison === "livree" ? now : null;
    this.db
      .prepare("UPDATE factures SET statut_paiement = ?, montant_paye = ?, statut_livraison = ?, livree_le = ?, updated_at = ? WHERE id = ?")
      .run(statut.statutPaiement, statut.montantPaye, statut.statutLivraison, livreeLe, now, id);
  }

  /**
   * Annulation (§5/§6/§21) — suppression douce uniquement : la facture
   * disparaît des factures actives (`list()` la filtre déjà), mais reste
   * en base avec son motif, consultable via l'historique. Ne touche
   * jamais aux mouvements de stock ni à leur restauration — cette
   * responsabilité appartient à VenteService (règle métier, pas
   * persistance pure).
   */
  annuler(id: string, motif: string, annuleePar: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE factures SET annulee_le = ?, annulee_par = ?, motif_annulation = ?, updated_at = ? WHERE id = ?")
      .run(now, annuleePar, motif, now, id);
  }

  /**
   * Marque une facture annulée comme "déjà corrigée" — empêche l'écran
   * Factures de proposer une seconde correction à partir de la même
   * erreur (le bouton Modifier disparaît une fois cet identifiant
   * renseigné). Appelée uniquement APRÈS la création réussie de la
   * nouvelle facture, jamais avant.
   */
  marquerCorrigee(factureOrigineId: string, nouvelleFactureId: string): void {
    this.db.prepare("UPDATE factures SET corrigee_par_facture_id = ?, updated_at = ? WHERE id = ?").run(nouvelleFactureId, new Date().toISOString(), factureOrigineId);
  }

  /**
   * Crée le relevé interne d'approvisionnement — table PHYSIQUEMENT
   * séparée de la facture, jamais transmise au client (Corrections §7).
   */
  createReleveInterne(factureId: string, lignes: LigneReleveInterne[]): void {
    if (lignes.length === 0) return;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO releves_internes_approvisionnement (id, facture_id, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(id, factureId, now, now);

    const insertLigne = this.db.prepare(
      `INSERT INTO lignes_releve_interne (id, releve_id, motif, taille, quantite, fournisseur, prix_achat, prix_vente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ligne of lignes) {
      insertLigne.run(randomUUID(), id, ligne.motif, ligne.taille, ligne.quantite, ligne.fournisseur, ligne.prixAchat, ligne.prixVente);
    }
  }

  /**
   * Factures avec le nom/rôle du vendeur résolu — Consolidation
   * Administrateur/Gérant §11 : nécessaire pour permettre à
   * l'Administrateur de voir "qui a vendu", information ensuite
   * anonymisée pour le Gérant au niveau IPC (jamais ici — ce dépôt ne
   * fait que fournir la donnée brute).
   */
  /**
   * Correction "Audit Phase 2 — pagination Factures" : remplace le
   * plafond fixe de listAvecVendeur(50) par une vraie pagination
   * BASE DE DONNÉES — recherche, filtre de statut, filtre de vendeur et
   * tri appliqués en SQL AVANT de découper en pages (LIMIT/OFFSET),
   * jamais l'inverse. Seules les 10 lignes de la page demandée sont
   * chargées en mémoire, quel que soit le nombre total de factures.
   *
   * Le filtrage par vendeur se fait par `vendeur_utilisateur_id` (jamais
   * par un nom affiché, qui dépend de l'anonymisation — une préoccupation
   * d'affichage, pas de données) : la décision de savoir QUELS vendeurs
   * un utilisateur a le droit de filtrer reste prise plus haut (IPC),
   * jamais ici.
   *
   * Limite connue et assumée : la recherche texte utilise `LIKE` en
   * SQLite, qui ne met en minuscules correctement que les caractères
   * ASCII (contrairement à l'ancien `.toLowerCase()` JavaScript,
   * pleinement Unicode). Une recherche sur un nom de client accentué
   * dans une casse différente de celle enregistrée pourrait ne pas
   * matcher parfaitement — cas limite rare, signalé ici plutôt que
   * masqué.
   */
  listAvecVendeurPagine(filtres: {
    recherche: string;
    statutFiltre: "tous" | "annulee" | "en_attente" | "livree";
    vendeurUtilisateurId: string | null;
    /**
     * Correction "recherche limitée à client/numéro" (2026-10-22, retour
     * utilisateur) : inclut `u.nom` (compte réellement utilisé pour
     * enregistrer la vente) ET `f.vendeur_nom_manuel` (Corrections §7,
     * quand ce n'est pas le compte connecté qui est réellement à l'origine
     * de la vente) dans la recherche texte libre. DÉCISION PRISE PLUS HAUT
     * (IPC, jamais ici — même principe que `vendeurUtilisateurId`
     * ci-dessus) : un Gérant ne doit jamais pouvoir découvrir quels
     * vendeurs existent ni deviner leur activité en tâtonnant dans la
     * barre de recherche (ça contournerait silencieusement
     * `anonymiserFactures`, qui ne masque que le résultat APRÈS coup, pas
     * la capacité de filtrer dessus) — seul un Administrateur doit passer
     * `true` ici.
     */
    inclureVendeurDansRecherche: boolean;
    colonneTri: "numero" | "date" | "client" | "vendeur" | "montant" | "statut" | null;
    direction: "asc" | "desc";
    page: number;
    tailleParPage: number;
  }): { resultats: (Facture & { vendeurNom: string | null; vendeurRole: string | null; aAchatExterieur: boolean })[]; totalResultats: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    const q = filtres.recherche.trim();
    if (q) {
      if (filtres.inclureVendeurDansRecherche) {
        conditions.push("(f.numero LIKE ? OR f.client_nom LIKE ? OR u.nom LIKE ? OR f.vendeur_nom_manuel LIKE ?)");
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      } else {
        conditions.push("(f.numero LIKE ? OR f.client_nom LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }
    }
    if (filtres.statutFiltre === "annulee") {
      conditions.push("f.annulee_le IS NOT NULL");
    } else if (filtres.statutFiltre === "en_attente" || filtres.statutFiltre === "livree") {
      conditions.push("f.annulee_le IS NULL AND f.statut_livraison = ?");
      params.push(filtres.statutFiltre);
    }
    if (filtres.vendeurUtilisateurId) {
      conditions.push("f.vendeur_utilisateur_id = ?");
      params.push(filtres.vendeurUtilisateurId);
    }
    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const colonnesTri: Record<string, string> = {
      numero: "f.numero",
      date: "f.date",
      client: "f.client_nom",
      vendeur: "COALESCE(u.nom, '')",
      montant: "f.total",
      // Reproduit l'ordre "annulée avant/après les autres statuts" tel
      // que trié côté client auparavant (comparaison alphabétique de la
      // valeur affichée : 'annulee' vs 'en_attente'/'livree').
      statut: "CASE WHEN f.annulee_le IS NOT NULL THEN 'annulee' ELSE f.statut_livraison END",
    };
    const ordreSql = filtres.colonneTri ? colonnesTri[filtres.colonneTri] : "f.date";
    const directionSql = filtres.direction === "asc" ? "ASC" : "DESC";

    const totalResultats = (
      this.db
        .prepare(
          `SELECT COUNT(*) as n FROM factures f LEFT JOIN utilisateurs u ON u.id = f.vendeur_utilisateur_id ${whereSql}`
        )
        .get(...params) as { n: number }
    ).n;

    const offset = (filtres.page - 1) * filtres.tailleParPage;
    const rows = this.db
      .prepare(
        `SELECT f.*, u.nom as vendeurNom, u.role as vendeurRole
         FROM factures f
         LEFT JOIN utilisateurs u ON u.id = f.vendeur_utilisateur_id
         ${whereSql}
         ORDER BY ${ordreSql} ${directionSql}
         LIMIT ? OFFSET ?`
      )
      .all(...params, filtres.tailleParPage, offset) as (FactureRow & { vendeurNom: string | null; vendeurRole: string | null })[];

    const factures = rows.map((row) => ({ ...rowToFacture(row, this.getLignes(row.id)), vendeurNom: row.vendeurNom, vendeurRole: row.vendeurRole }));

    // Même logique que listAvecVendeur — une seule requête groupée,
    // appliquée uniquement aux factures de LA PAGE (10 au maximum),
    // jamais à l'ensemble de la base.
    let facturesAvecReleve = new Set<string>();
    if (factures.length > 0) {
      const placeholders = factures.map(() => "?").join(",");
      facturesAvecReleve = new Set(
        (
          this.db
            .prepare(`SELECT DISTINCT facture_id as factureId FROM releves_internes_approvisionnement WHERE facture_id IN (${placeholders})`)
            .all(...factures.map((f) => f.id)) as { factureId: string }[]
        ).map((r) => r.factureId)
      );
    }

    return {
      resultats: factures.map((f) => ({ ...f, aAchatExterieur: facturesAvecReleve.has(f.id) })),
      totalResultats,
    };
  }

  /**
   * Détermine la page (tri par défaut : date décroissante, aucun filtre)
   * où se trouve une facture donnée — nécessaire pour la navigation
   * cliquable depuis l'Historique/le Tableau de bord (correction "Audit
   * Phase 2 — pagination Factures") : puisqu'une seule page est chargée
   * à la fois, il n'est plus possible de calculer cette page côté
   * Renderer à partir de la liste complète (elle n'existe plus en
   * mémoire). Calcule le rang réel via une requête `COUNT`, jamais en
   * rechargeant toutes les factures pour les compter côté client.
   */
  trouverPageParDefaut(factureId: string, tailleParPage: number): number | null {
    const facture = this.db.prepare("SELECT date FROM factures WHERE id = ?").get(factureId) as { date: string } | undefined;
    if (!facture) return null;
    const rang = (this.db.prepare("SELECT COUNT(*) as n FROM factures WHERE date > ?").get(facture.date) as { n: number }).n;
    return Math.floor(rang / tailleParPage) + 1;
  }

  /**
   * Liste des vendeurs ayant réellement enregistré au moins une facture —
   * utilisée pour peupler le filtre "Vendeur" côté Admin uniquement (la
   * décision de qui a le droit de voir cette liste complète reste prise
   * dans l'IPC, jamais ici : un Gérant ne doit voir que lui-même).
   */
  listVendeursDistincts(): { id: string; nom: string }[] {
    return this.db
      .prepare(
        `SELECT DISTINCT u.id, u.nom
         FROM factures f
         JOIN utilisateurs u ON u.id = f.vendeur_utilisateur_id
         ORDER BY u.nom`
      )
      .all() as { id: string; nom: string }[];
  }

  /**
   * Document interne d'approvisionnement — accessible à tous les
   * utilisateurs ayant accès à la vente, sans distinction Admin/Gérant
   * (§9 de la correction). N'existe (au sens utile) que pour les lignes
   * ayant réellement eu un complément externe ; la quantité interne est
   * déduite (quantité totale de la ligne facture − quantité externe
   * enregistrée dans le relevé), jamais stockée deux fois séparément.
   */
  getDocumentInterne(
    factureId: string
  ): { motif: string; taille: string; quantiteTotale: number; quantiteInterne: number; quantiteExterne: number; fournisseur: string | null; prixAchat: number | null }[] {
    const lignesFacture = this.getLignes(factureId);
    const releve = this.db
      .prepare(
        `SELECT lri.motif, lri.taille, lri.quantite, lri.fournisseur, lri.prix_achat as prixAchat
         FROM lignes_releve_interne lri
         JOIN releves_internes_approvisionnement r ON r.id = lri.releve_id
         WHERE r.facture_id = ?`
      )
      .all(factureId) as { motif: string; taille: string; quantite: number; fournisseur: string; prixAchat: number }[];

    return lignesFacture.map((lf) => {
      const externe = releve.find((r) => r.motif === lf.motif && r.taille === lf.taille);
      return {
        motif: lf.motif,
        taille: lf.taille,
        quantiteTotale: lf.quantite,
        quantiteInterne: lf.quantite - (externe?.quantite ?? 0),
        quantiteExterne: externe?.quantite ?? 0,
        fournisseur: externe?.fournisseur ?? null,
        prixAchat: externe?.prixAchat ?? null,
      };
    });
  }

  /**
   * Reconstruit les données d'une vente à partir d'une facture existante
   * (correction §4 : "Modifier" une facture annulée doit préremplir les
   * informations existantes). La répartition par dépôt est reconstruite
   * depuis les mouvements réellement enregistrés pour cette facture —
   * jamais stockée séparément, toujours dérivée de la source de vérité.
   */
  getDonneesPourModification(factureId: string): {
    clientNom: string;
    clientTelephone: string | null;
    clientAdresse: string | null;
    modeReglement: string | null;
    /** Remise de la facture d'origine — conservée telle quelle pour la correction (voir VentesScreen, "la remise doit être conservée et recalculée correctement"). */
    remise: number;
    /** Statut de paiement de la facture d'origine — conservé pour la correction, même principe que remise. */
    statutPaiement: "reservation" | "payee";
    /** Montant payé de la facture d'origine — conservé pour la correction, même principe que remise. */
    montantPaye: number;
    lignes: {
      produitId: string | null;
      motif: string;
      taille: string;
      quantite: number;
      prixUnitaire: number;
      allocationsDepots: { emplacementId: string; quantite: number }[];
      fournisseurExterne: string | null;
      prixAchatExterne: number | null;
    }[];
  } | null {
    const facture = this.findById(factureId);
    if (!facture) return null;
    const documentInterne = this.getDocumentInterne(factureId);
    const mouvements = this.db
      .prepare(
        "SELECT produit_id as produitId, emplacement_id as emplacementId, quantite FROM mouvements WHERE facture_id = ? AND type = 'sortie' AND emplacement_id IS NOT NULL"
      )
      .all(factureId) as { produitId: string; emplacementId: string; quantite: number }[];

    return {
      clientNom: facture.clientNom,
      clientTelephone: facture.clientTelephone,
      clientAdresse: facture.clientAdresse,
      modeReglement: facture.modeReglement,
      remise: facture.remise,
      statutPaiement: facture.statutPaiement,
      montantPaye: facture.montantPaye,
      lignes: facture.lignes.map((l) => {
        const doc = documentInterne.find((d) => d.motif === l.motif && d.taille === l.taille);
        const allocations = mouvements.filter((m) => m.produitId === l.produitId).map((m) => ({ emplacementId: m.emplacementId, quantite: m.quantite }));
        return {
          produitId: l.produitId,
          motif: l.motif,
          taille: l.taille,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          allocationsDepots: allocations,
          fournisseurExterne: doc?.fournisseur ?? null,
          prixAchatExterne: doc?.prixAchat ?? null,
        };
      }),
    };
  }
}
