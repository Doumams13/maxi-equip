import type Database from "better-sqlite3-multiple-ciphers";
import DatabaseCtor from "better-sqlite3-multiple-ciphers";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { getSchemaVersion } from "../db/migrate.js";
import { type CleProtegeeParMotDePasse, protegerCleParMotDePasse, recupererCleAvecMotDePasse, LONGUEUR_MIN_MOT_DE_PASSE } from "./backupCrypto.js";

/**
 * Service de sauvegarde — Phase 3.8, corrigé pour la sécurité des
 * sauvegardes manuelles (correction "Sécurité et clarté des
 * sauvegardes"). Indépendant de l'interface : ne connaît ni IPC ni
 * React, uniquement le système de fichiers et la base SQLite.
 *
 * ═══════════════════════════════════════════════════════════════════
 * TROIS TYPES, TROIS NIVEAUX DE CONFIANCE — jamais confondus
 * ═══════════════════════════════════════════════════════════════════
 * - `automatic`/`safety` : sécurité LOCALE uniquement. Restaurées sur
 *   CETTE machine, où `db.key` existe déjà — ne contiennent donc AUCUNE
 *   information de clé dans `metadata.json`, ni en clair ni protégée.
 *   Jamais présentées comme portables vers une autre machine.
 * - `manual` : sauvegarde PORTABLE et protégée par un mot de passe
 *   choisi par l'utilisateur. Utilise une clé de chiffrement ALÉATOIRE,
 *   spécifique à cette sauvegarde (jamais la clé principale de
 *   l'installation), elle-même protégée par le mot de passe via
 *   `backupCrypto.ts` (scrypt + AES-256-GCM, primitives standards
 *   `node:crypto`, jamais une clé stockée en clair).
 *
 * ═══════════════════════════════════════════════════════════════════
 * MÉCANISME RÉEL — VACUUM INTO puis PRAGMA rekey (vérifié réellement)
 * ═══════════════════════════════════════════════════════════════════
 * 1. `VACUUM INTO` copie la base avec la clé PRINCIPALE (déjà vérifié
 *    fiable avec WAL actif, y compris non checkpointé — voir Phase 3.8).
 * 2. Pour une sauvegarde manuelle UNIQUEMENT : la COPIE (jamais la base
 *    source) est rouverte avec cette même clé principale, puis
 *    `PRAGMA rekey` vers une clé aléatoire fraîchement générée, suivi
 *    d'un `VACUUM` pour finaliser réellement le rechiffrement — vérifié
 *    concrètement que sans ce `VACUUM` après `rekey`, l'ancienne clé
 *    reste acceptée par erreur (comportement réel de cette bibliothèque,
 *    testé avant d'écrire ce code). Avec le `VACUUM`, l'ancienne clé est
 *    bien rejetée ensuite.
 * 3. La clé aléatoire est protégée par le mot de passe et stockée dans
 *    `metadata.json` sous forme chiffrée — jamais en clair.
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
const VERSION_APPLICATION = "0.1.0";
const FORMAT_SAUVEGARDE = "MAXI_EQUIP_BACKUP";
/**
 * Version 2 : `database.encryptionKeyHex` (clé en clair, corrigé) est
 * remplacé par `database.keyProtection` (présent uniquement pour
 * `manual`, jamais de clé en clair) — changement de structure
 * suffisamment important pour justifier l'incrément.
 */
const VERSION_FORMAT_SAUVEGARDE = 2;

export const DELAI_MIN_SAUVEGARDE_AUTOMATIQUE_MS = 24 * 60 * 60 * 1000;
export const NOMBRE_MAX_SAUVEGARDES_AUTOMATIQUES = 10;

interface Metadata {
  format: string;
  formatVersion: number;
  application: { name: string; version: string };
  backup: { createdAt: string; type: TypeSauvegarde };
  database: {
    filename: string;
    schemaVersion: number;
    keyProtection?: CleProtegeeParMotDePasse;
  };
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

  private creerSauvegardeInterne(dossierParent: string, type: TypeSauvegarde, motDePasse?: string): ResultatSauvegarde {
    if (!existsSync(dossierParent)) {
      try {
        mkdirSync(dossierParent, { recursive: true });
      } catch (err) {
        return { success: false, message: `Impossible de créer le dossier de destination : ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    let nomFinal = `${NOM_APPLICATION}_BACKUP_${horodatageNomDossier(new Date())}`;
    let cheminFinal = join(dossierParent, nomFinal);
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

      let keyProtection: CleProtegeeParMotDePasse | undefined;

      if (type === "manual") {
        if (!motDePasse) throw new Error("Un mot de passe est obligatoire pour une sauvegarde manuelle.");

        const cleAleatoire = randomBytes(32).toString("hex");
        const copie = new DatabaseCtor(cheminBaseCopie);
        try {
          copie.pragma(`key='${this.cleChiffrement}'`);
          copie.pragma("cipher_version");
          copie.pragma(`rekey='${cleAleatoire}'`);
          copie.exec("VACUUM");
        } finally {
          copie.close();
        }

        keyProtection = protegerCleParMotDePasse(cleAleatoire, motDePasse);
      }

      const metadata: Metadata = {
        format: FORMAT_SAUVEGARDE,
        formatVersion: VERSION_FORMAT_SAUVEGARDE,
        application: { name: NOM_APPLICATION, version: VERSION_APPLICATION },
        backup: { createdAt: new Date().toISOString(), type },
        database: { filename: "database.sqlite", schemaVersion: getSchemaVersion(this.db), ...(keyProtection ? { keyProtection } : {}) },
      };
      writeFileSync(join(cheminTemporaire, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

      this.verifierSauvegarde(cheminTemporaire, type, motDePasse);

      renameSync(cheminTemporaire, cheminFinal);

      return { success: true, chemin: cheminFinal };
    } catch (err) {
      rmSync(cheminTemporaire, { recursive: true, force: true });
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Échec de la sauvegarde : ${message}` };
    }
  }

  private verifierSauvegarde(dossier: string, type: TypeSauvegarde, motDePasse?: string): void {
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

    let cleAVerifier: string;
    if (type === "manual") {
      if (!metadata.database.keyProtection || !motDePasse) throw new Error("Informations de protection par mot de passe manquantes.");
      cleAVerifier = recupererCleAvecMotDePasse(metadata.database.keyProtection, motDePasse);
    } else {
      cleAVerifier = this.cleChiffrement;
    }

    const copie = new DatabaseCtor(cheminBase, { readonly: true });
    try {
      copie.pragma(`key='${cleAVerifier}'`);
      copie.pragma("cipher_version");
      const integrite = copie.pragma("integrity_check", { simple: true }) as string;
      if (integrite !== "ok") throw new Error(`Vérification d'intégrité SQLite échouée : ${integrite}`);
      copie.prepare("SELECT COUNT(*) as n FROM parametres_entreprise").get();
    } finally {
      copie.close();
    }
  }

  creerSauvegardeManuelle(dossierChoisiParUtilisateur: string, motDePasse: string): ResultatSauvegarde {
    if (!motDePasse || motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
      return { success: false, message: `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.` };
    }
    return this.creerSauvegardeInterne(dossierChoisiParUtilisateur, "manual", motDePasse);
  }

  creerSauvegardeSecurite(): ResultatSauvegarde {
    return this.creerSauvegardeInterne(this.dossierPourType("safety"), "safety");
  }

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
        // Dossier corrompu/illisible ignoré, jamais supprimé automatiquement.
      }
    }
    return entrees.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

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
