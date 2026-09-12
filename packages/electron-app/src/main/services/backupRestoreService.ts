import DatabaseCtor from "better-sqlite3-multiple-ciphers";
import { existsSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { BackupService, TypeSauvegarde } from "./backupService.js";
import { FORMAT_SAUVEGARDE } from "./backupService.js";
import { recupererCleAvecMotDePasse, type CleProtegeeParMotDePasse } from "./backupCrypto.js";
import { SCHEMA_VERSION } from "../db/migrate.js";

/**
 * Service de restauration — Phase 3.9. Indépendant de l'interface et
 * d'Electron : ne connaît ni IPC ni `app.relaunch()` (laissé à
 * l'appelant IPC, pour rester testable avec du Node pur). Réutilise
 * `BackupService.creerSauvegardeSecurite()` déjà existant (Phase 3.8),
 * jamais une seconde implémentation de la sauvegarde de sécurité.
 *
 * PRINCIPE : rien n'est jamais modifié avant que TOUT ait été vérifié.
 * `analyserSauvegarde()` est en lecture seule intégrale.
 * `executerRestauration()` revalide tout depuis le début (défense en
 * profondeur), résout la clé, vérifie une copie de la sauvegarde AVANT
 * de toucher au fichier réellement utilisé par l'application, crée et
 * vérifie une sauvegarde de sécurité, puis échange les fichiers via un
 * renommage réversible (l'ancien fichier live est déplacé, jamais
 * supprimé, tant que le nouveau n'est pas confirmé fonctionnel).
 *
 * CLÉ DE LA BASE RESTAURÉE : toujours réencodée avec la clé de CETTE
 * installation (jamais celle de la sauvegarde), via PRAGMA rekey +
 * VACUUM — exactement le mécanisme déjà vérifié et utilisé par
 * BackupService pour les sauvegardes manuelles. Sans cette étape, la
 * base restaurée resterait chiffrée avec une clé différente de celle
 * que `db.key` fournira au prochain démarrage.
 */

export type CompatibiliteSauvegarde = "ok" | "avertissement" | "incompatible";

export interface AnalyseSauvegarde {
  compatible: CompatibiliteSauvegarde;
  message: string;
  type?: TypeSauvegarde;
  necessiteMotDePasse: boolean;
  createdAt?: string;
  vulnerable: boolean;
}

export interface ResultatRestauration {
  success: boolean;
  message?: string;
  etape?: "analyse" | "mot_de_passe" | "safety" | "restauration" | "verification";
}

interface MetadataRestauration {
  format: string;
  formatVersion: number;
  backup: { createdAt: string; type: TypeSauvegarde };
  database: {
    filename: string;
    schemaVersion: number;
    keyProtection?: CleProtegeeParMotDePasse;
    encryptionKeyHex?: string;
  };
}

function lireMetadataBrut(dossier: string): { brut: string; metadata: MetadataRestauration } {
  const brut = readFileSync(join(dossier, "metadata.json"), "utf-8");
  return { brut, metadata: JSON.parse(brut) as MetadataRestauration };
}

export class BackupRestoreService {
  constructor(
    private readonly backupService: BackupService,
    private readonly cleInstallation: string,
    private readonly cheminBaseLive: string,
    private readonly fermerBase: () => void
  ) {}

  analyserSauvegarde(dossier: string): AnalyseSauvegarde {
    const echec = (message: string): AnalyseSauvegarde => ({ compatible: "incompatible", message, necessiteMotDePasse: false, vulnerable: false });

    if (!existsSync(dossier)) return echec("Le dossier de sauvegarde est introuvable.");
    const cheminMetadata = join(dossier, "metadata.json");
    const cheminBase = join(dossier, "database.sqlite");
    if (!existsSync(cheminMetadata)) return echec("metadata.json est introuvable dans ce dossier — ce n'est pas une sauvegarde MAXI-EQUIP valide.");
    if (!existsSync(cheminBase)) return echec("database.sqlite est introuvable dans ce dossier.");

    let brut: string;
    let metadata: MetadataRestauration;
    try {
      const lu = lireMetadataBrut(dossier);
      brut = lu.brut;
      metadata = lu.metadata;
    } catch {
      return echec("metadata.json est illisible (JSON invalide).");
    }

    if (metadata.format !== FORMAT_SAUVEGARDE) return echec("Ce dossier ne correspond pas au format de sauvegarde MAXI-EQUIP.");
    if (!metadata.backup || !["manual", "automatic", "safety"].includes(metadata.backup.type)) {
      return echec("Le type de sauvegarde est inconnu ou non reconnu.");
    }
    if (typeof metadata.database?.schemaVersion !== "number") return echec("La version du schéma de la sauvegarde est absente ou invalide.");
    if (metadata.database.schemaVersion > SCHEMA_VERSION) {
      return echec(
        `Cette sauvegarde provient d'une version plus récente de MAXI-EQUIP (schéma ${metadata.database.schemaVersion}, cette installation gère jusqu'au schéma ${SCHEMA_VERSION}). Mettez à jour l'application avant de restaurer cette sauvegarde.`
      );
    }
    if (statSync(cheminBase).size === 0) return echec("Le fichier de base de la sauvegarde est vide.");

    const vulnerable = brut.includes("encryptionKeyHex");
    const necessiteMotDePasse = metadata.backup.type === "manual" && !vulnerable;

    if (metadata.formatVersion === 1 || vulnerable) {
      return {
        compatible: "avertissement",
        message:
          "Cette sauvegarde a été créée avant la correction de sécurité de MAXI-EQUIP et contient une clé de chiffrement non protégée. Elle peut être restaurée, mais n'était pas sécurisée en tant que fichier — assurez-vous qu'elle n'a jamais été partagée ni exposée.",
        type: metadata.backup.type,
        necessiteMotDePasse: false,
        createdAt: metadata.backup.createdAt,
        vulnerable: true,
      };
    }

    return {
      compatible: "ok",
      message: "Cette sauvegarde est valide et compatible avec cette installation.",
      type: metadata.backup.type,
      necessiteMotDePasse,
      createdAt: metadata.backup.createdAt,
      vulnerable: false,
    };
  }

  async executerRestauration(dossier: string, motDePasse?: string): Promise<ResultatRestauration> {
    const analyse = this.analyserSauvegarde(dossier);
    if (analyse.compatible === "incompatible") return { success: false, message: analyse.message, etape: "analyse" };

    const { metadata } = lireMetadataBrut(dossier);
    const cheminBaseSauvegarde = join(dossier, "database.sqlite");

    let cleSauvegarde: string;
    if (metadata.database.encryptionKeyHex) {
      cleSauvegarde = metadata.database.encryptionKeyHex;
    } else if (metadata.backup.type === "manual") {
      if (!metadata.database.keyProtection || !motDePasse) {
        return { success: false, message: "Un mot de passe est requis pour cette sauvegarde.", etape: "mot_de_passe" };
      }
      try {
        cleSauvegarde = recupererCleAvecMotDePasse(metadata.database.keyProtection, motDePasse);
      } catch {
        return { success: false, message: "Mot de passe incorrect ou sauvegarde invalide.", etape: "mot_de_passe" };
      }
    } else {
      cleSauvegarde = this.cleInstallation;
    }

    try {
      const test = new DatabaseCtor(cheminBaseSauvegarde, { readonly: true });
      try {
        test.pragma(`key='${cleSauvegarde}'`);
        test.pragma("cipher_version");
        const integrite = test.pragma("integrity_check", { simple: true }) as string;
        if (integrite !== "ok") throw new Error(`Intégrité invalide : ${integrite}`);
        test.prepare("SELECT COUNT(*) as n FROM parametres_entreprise").get();
      } finally {
        test.close();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message:
          metadata.backup.type === "manual"
            ? "Mot de passe incorrect ou sauvegarde invalide."
            : `Cette sauvegarde ne peut pas être ouverte sur cette installation : ${message}`,
        etape: "verification",
      };
    }

    const safety = this.backupService.creerSauvegardeSecurite();
    if (!safety.success) {
      return { success: false, message: `Restauration annulée : impossible de créer une sauvegarde de sécurité (${safety.message}).`, etape: "safety" };
    }

    const dossierLive = dirname(this.cheminBaseLive);
    const cheminStaging = join(dossierLive, `.restore-staging-${randomUUID()}.sqlite`);
    try {
      const copieTest = new DatabaseCtor(cheminBaseSauvegarde, { readonly: true });
      copieTest.pragma(`key='${cleSauvegarde}'`);
      copieTest.pragma("cipher_version");
      copieTest.exec(`VACUUM INTO '${cheminStaging.replace(/'/g, "''")}'`);
      copieTest.close();

      const staging = new DatabaseCtor(cheminStaging);
      staging.pragma(`key='${cleSauvegarde}'`);
      staging.pragma("cipher_version");
      staging.pragma(`rekey='${this.cleInstallation}'`);
      staging.exec("VACUUM");
      staging.close();

      const verifStaging = new DatabaseCtor(cheminStaging, { readonly: true });
      verifStaging.pragma(`key='${this.cleInstallation}'`);
      verifStaging.pragma("cipher_version");
      const integriteStaging = verifStaging.pragma("integrity_check", { simple: true }) as string;
      verifStaging.close();
      if (integriteStaging !== "ok") throw new Error(`Intégrité invalide après rechiffrement : ${integriteStaging}`);
    } catch (err) {
      rmSync(cheminStaging, { force: true });
      return { success: false, message: `Échec de préparation de la restauration : ${err instanceof Error ? err.message : String(err)}`, etape: "restauration" };
    }

    this.fermerBase();
    const cheminSauvegardePreRestauration = `${this.cheminBaseLive}.pre-restore-${Date.now()}`;
    try {
      if (existsSync(this.cheminBaseLive)) renameSync(this.cheminBaseLive, cheminSauvegardePreRestauration);
      for (const suffixe of ["-wal", "-shm"]) {
        const c = `${this.cheminBaseLive}${suffixe}`;
        if (existsSync(c)) rmSync(c, { force: true });
      }
      renameSync(cheminStaging, this.cheminBaseLive);

      const verifFinale = new DatabaseCtor(this.cheminBaseLive, { readonly: true });
      verifFinale.pragma(`key='${this.cleInstallation}'`);
      verifFinale.pragma("cipher_version");
      const ok = verifFinale.pragma("integrity_check", { simple: true }) as string;
      verifFinale.close();
      if (ok !== "ok") throw new Error(`Intégrité invalide sur le fichier restauré : ${ok}`);
    } catch (err) {
      rmSync(this.cheminBaseLive, { force: true });
      if (existsSync(cheminSauvegardePreRestauration)) renameSync(cheminSauvegardePreRestauration, this.cheminBaseLive);
      rmSync(cheminStaging, { force: true });
      return {
        success: false,
        message: `Erreur pendant la restauration, l'état précédent a été automatiquement restauré : ${err instanceof Error ? err.message : String(err)}`,
        etape: "restauration",
      };
    }

    rmSync(cheminSauvegardePreRestauration, { force: true });

    return { success: true };
  }
}
