import type Database from "better-sqlite3-multiple-ciphers";
import DatabaseCtor from "better-sqlite3-multiple-ciphers";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getSchemaVersion } from "../db/migrate.js";

/**
 * Service de sauvegarde — Phase 3.8. Indépendant de l'interface (Partie
 * 13) : ne connaît ni IPC ni React, uniquement le système de fichiers et
 * la base SQLite.
 *
 * ═══════════════════════════════════════════════════════════════════
 * DÉCISION DE SÉCURITÉ IMPORTANTE — clé de déchiffrement dans metadata.json
 * ═══════════════════════════════════════════════════════════════════
 * La base MAXI-EQUIP est chiffrée (SQLCipher), avec une clé stockée
 * séparément (`db.key`), elle-même chiffrée via `safeStorage`/DPAPI —
 * donc strictement liée à CETTE machine (voir db/index.ts). Une
 * sauvegarde qui ne contiendrait QUE `database.sqlite` chiffré serait
 * inutilisable sur toute autre machine, ce qui contredirait l'objectif
 * explicite de la Partie 2 ("protéger toutes les données nécessaires
 * pour reconstruire l'état de MAXI-EQUIP").
 *
 * DÉCISION RETENUE : la clé de déchiffrement RÉELLE (en clair) est
 * incluse dans `metadata.json`. Conséquence directe, jamais masquée :
 * le dossier de sauvegarde devient lui-même un secret aussi sensible
 * que la base de données elle-même, et doit être protégé en
 * conséquence par l'utilisateur (stockage sûr, jamais partagé). C'est
 * exactement le même niveau de confiance que la situation actuelle, où
 * `db.key` et `maxi-equip.sqlite` vivent déjà côte à côte sur le même
 * disque. Signalé explicitement dans l'interface (ParametresScreen.tsx)
 * et dans le rapport de cette correction — jamais une hypothèse
 * silencieuse.
 *
 * ═══════════════════════════════════════════════════════════════════
 * MÉTHODE DE COPIE — VACUUM INTO, jamais fs.copyFile (Partie 5)
 * ═══════════════════════════════════════════════════════════════════
 * `fs.copyFile` sur un fichier WAL actif copierait potentiellement un
 * état incohérent. `VACUUM INTO` est la commande SQLite native conçue
 * pour ce cas exact : copie transactionnellement cohérente en une seule
 * opération atomique, y compris les données non encore "checkpointées"
 * du WAL — vérifié concrètement avant d'écrire ce service (voir le
 * rapport de cette correction). `Database.prototype.backup()` natif a,
 * lui, échoué avec cette bibliothèque sur une base chiffrée
 * ("incompatible source and target databases") — VACUUM INTO fonctionne
 * correctement là où il échoue.
 */

export type TypeSauvegarde = "manual" | "automatic" | "safety";

export interface ResultatSauvegarde {
  success: boolean;
  chemin?: string;
  message?: string;
}

export interface EntreeSauvegardeAutomatique {
  chemin: string;
  createdAt: string;
}

export interface StatutSauvegarde {
  derniereAutomatique: { createdAt: string } | null;
}

const NOM_APPLICATION = "MAXI-EQUIP";
const VERSION_APPLICATION = "0.1.0"; // Reprend packages/electron-app/package.json — jamais recalculé dynamiquement pour rester simple (Partie 20 point 9).
const FORMAT_SAUVEGARDE = "MAXI_EQUIP_BACKUP";
const VERSION_FORMAT_SAUVEGARDE = 1;

/** Centralisés ici, jamais dispersés (Partie 10/11) — faciles à ajuster plus tard. */
export const DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS = 24 * 60 * 60 * 1000; // 24h
export const NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES = 10;

interface Metadata {
  format: string;
  formatVersion: number;
  application: { name: string; version: string };
  backup: { createdAt: string; type: TypeSauvegarde };
  database: { filename: string; schemaVersion: number; encryptionKeyHex: string };
}

function horodatageNomDossier(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

export class BackupService {
  constructor(
    private readonly db: Database.Database,
    private readonly cleChiffrement: string,
    private readonly dossierSauvegardesInternes: string
  ) {}

  private dossierPourType(type: TypeSauvegarde): string {
    if (type === "automatic") return join(this.dossierSauvegardesInternes, "auto");
    if (type === "safety") return join(this.dossierSauvegardesInternes, "safety");
    return this.dossierSauvegardesInternes;
  }

  /**
   * Cœur du service — utilisé par les trois types. `dossierParent` est
   * toujours fourni par l'appelant : pour une sauvegarde manuelle,
   * c'est le dossier choisi par l'utilisateur (Partie 8) ; pour
   * automatique/safety, un sous-dossier interne dédié (Partie 9).
   *
   * Construit d'abord dans un dossier temporaire à côté de la
   * destination finale, sur le même volume (jamais le dossier
   * temporaire système, qui pourrait être sur un disque différent et
   * rendre le déplacement final non atomique) — puis renommé seulement
   * après vérification complète (Partie 6).
   */
  private creerSauvegardeInterne(dossierParent: string, type: TypeSauvegarde): ResultatSauvegarde {
    if (!existsSync(dossierParent)) {
      try {
        mkdirSync(dossierParent, { recursive: true });
      } catch (err) {
        return { success: false, message: `Impossible de créer le dossier de destination : ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    let nomFinal = `${NOM_APPLICATION}_BACKUP_${horodatageNomDossier(new Date())}`;
    let cheminFinal = join(dossierParent, nomFinal);
    // Garantit un nom unique même si deux sauvegardes sont créées dans la
    // même seconde (résolution du nom normalisé) — jamais un écrasement
    // silencieux d'une sauvegarde déjà existante.
    let suffixe = 1;
    while (existsSync(cheminFinal)) {
      suffixe++;
      nomFinal = `${NOM_APPLICATION}_BACKUP_${horodatageNomDossier(new Date())}_${suffixe}`;
      cheminFinal = join(dossierParent, nomFinal);
    }
    const cheminTemporaire = join(dossierParent, `.tmp-${randomUUID()}`);

    try {
      mkdirSync(cheminTemporaire, { recursive: false });
    } catch (err) {
      return { success: false, message: `Impossible d'écrire à cet emplacement : ${err instanceof Error ? err.message : String(err)}` };
    }

    const cheminBaseCopie = join(cheminTemporaire, "database.sqlite");

    try {
      this.db.exec(`VACUUM INTO '${cheminBaseCopie.replace(/'/g, "''")}'`);

      const metadata: Metadata = {
        format: FORMAT_SAUVEGARDE,
        formatVersion: VERSION_FORMAT_SAUVEGARDE,
        application: { name: NOM_APPLICATION, version: VERSION_APPLICATION },
        backup: { createdAt: new Date().toISOString(), type },
        database: { filename: "database.sqlite", schemaVersion: getSchemaVersion(this.db), encryptionKeyHex: this.cleChiffrement },
      };
      writeFileSync(join(cheminTemporaire, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

      this.verifierSauvegarde(cheminTemporaire);

      renameSync(cheminTemporaire, cheminFinal);

      return { success: true, chemin: cheminFinal };
    } catch (err) {
      rmSync(cheminTemporaire, { recursive: true, force: true });
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Échec de la sauvegarde : ${message}` };
    }
  }

  /**
   * Vérifications réelles (Partie 6) : fichier présent, non vide,
   * metadata.json lisible et cohérent, base réellement ouvrable AVEC LA
   * MÊME CLÉ, et `PRAGMA integrity_check` réellement exécuté.
   */
  private verifierSauvegarde(dossier: string): void {
    const cheminBase = join(dossier, "database.sqlite");
    const cheminMetadata = join(dossier, "metadata.json");

    if (!existsSync(cheminBase)) throw new Error("La base sauvegardée est introuvable après la copie.");
    if (statSync(cheminBase).size === 0) throw new Error("La base sauvegardée est vide.");
    if (!existsSync(cheminMetadata)) throw new Error("metadata.json est introuvable après la copie.");

    let metadata: Metadata;
    try {
      metadata = JSON.parse(readFileSync(cheminMetadata, "utf-8")) as Metadata;
    } catch {
      throw new Error("metadata.json est illisible (JSON invalide).");
    }
    if (metadata.format !== FORMAT_SAUVEGARDE) throw new Error("metadata.json ne correspond pas au format MAXI-EQUIP.");

    const copie = new DatabaseCtor(cheminBase, { readonly: true });
    try {
      copie.pragma(`key='${this.cleChiffrement}'`);
      copie.pragma("cipher_version");
      const integrite = copie.pragma("integrity_check", { simple: true }) as string;
      if (integrite !== "ok") throw new Error(`Vérification d'intégrité SQLite échouée : ${integrite}`);
      copie.prepare("SELECT COUNT(*) as n FROM parametres_entreprise").get();
    } finally {
      copie.close();
    }
  }

  /** Partie 7/8 : l'emplacement est toujours choisi par l'utilisateur en amont (dialog côté IPC) — jamais deviné ici. */
  creerSauvegardeManuelle(dossierChoisiParUtilisateur: string): ResultatSauvegarde {
    return this.creerSauvegardeInterne(dossierChoisiParUtilisateur, "manual");
  }

  /** Partie 12 : architecture prête, jamais appelée automatiquement dans cette étape (aucune restauration n'existe encore pour la déclencher). */
  creerSauvegardeSecurite(): ResultatSauvegarde {
    return this.creerSauvegardeInterne(this.dossierPourType("safety"), "safety");
  }

  /**
   * Partie 9/10 : une sauvegarde automatique au maximum toutes les
   * `DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS`. Retourne `null` (jamais une
   * erreur) si le délai n'est pas encore écoulé.
   */
  creerSauvegardeAutomatiqueSiNecessaire(): ResultatSauvegarde | null {
    const dossierAuto = this.dossierPourType("automatic");
    const derniere = this.listerSauvegardesAutomatiques()[0];

    if (derniere) {
      const age = Date.now() - new Date(derniere.createdAt).getTime();
      if (age < DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS) return null;
    }

    const resultat = this.creerSauvegardeInterne(dossierAuto, "automatic");
    if (resultat.success) this.purgerAnciennesSauvegardesAutomatiques();
    return resultat;
  }

  /** Partie 11 : trie par date de création réelle (metadata.json), plus fiable que le nom de dossier ou la date de modification du fichier. */
  listerSauvegardesAutomatiques(): EntreeSauvegardeAutomatique[] {
    const dossierAuto = this.dossierPourType("automatic");
    if (!existsSync(dossierAuto)) return [];

    const entrees: EntreeSauvegardeAutomatique[] = [];
    for (const nom of readdirSync(dossierAuto)) {
      if (nom.startsWith(".tmp-")) continue;
      const cheminMetadata = join(dossierAuto, nom, "metadata.json");
      if (!existsSync(cheminMetadata)) continue;
      try {
        const metadata = JSON.parse(readFileSync(cheminMetadata, "utf-8")) as Metadata;
        entrees.push({ chemin: join(dossierAuto, nom), createdAt: metadata.backup.createdAt });
      } catch {
        // Dossier corrompu/illisible ignoré, jamais supprimé automatiquement (Partie 6).
      }
    }
    return entrees.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /** Partie 11 : ne touche jamais aux sauvegardes manuelles ou de sécurité — ne lit et ne supprime que le sous-dossier `auto`. */
  purgerAnciennesSauvegardesAutomatiques(): void {
    const toutes = this.listerSauvegardesAutomatiques();
    const aSupprimer = toutes.slice(NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES);
    for (const entree of aSupprimer) {
      rmSync(entree.chemin, { recursive: true, force: true });
    }
  }

  getStatut(): StatutSauvegarde {
    const derniere = this.listerSauvegardesAutomatiques()[0];
    return { derniereAutomatique: derniere ? { createdAt: derniere.createdAt } : null };
  }
}
