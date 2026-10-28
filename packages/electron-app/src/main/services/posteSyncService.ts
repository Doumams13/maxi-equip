import { getConfigurationSync, getConfigurationCloudBackup, definirConfigurationSyncLocale } from "./syncConfig.js";

const DELAI_MAX_REQUETE_MS = 15_000;

export interface PosteInfo {
  id: string;
  nom: string | null;
  role: "shop" | "pcx";
  statut: "actif" | "bloque";
  enregistreLe: string;
  dernierContactLe: string | null;
}

export type ResultatAction = { success: true } | { success: false; message: string };
export type ResultatLectureMoi = { success: true; poste: PosteInfo | null } | { success: false; message: string };
export type ResultatLectureListe = { success: true; postes: PosteInfo[] } | { success: false; message: string };

/**
 * Identité et registre des postes — système multiposte fiable
 * (2026-10-28). Même garde d'isolation que `EmplacementSyncService`/
 * `pousserMotDePasseRecuperation` : AUCUN appel réseau n'est jamais
 * émis si la synchronisation n'est pas configurée (`jwt === null`) —
 * une installation indépendante n'atteint jamais ce code.
 */
export class PosteSyncService {
  private async requete<T>(
    chemin: string,
    options: { method: "GET" | "POST"; body?: unknown }
  ): Promise<{ success: true; data: T } | { success: false; message: string }> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}${chemin}`, {
        method: options.method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null;
        return { success: false, message: corps?.error?.message ?? `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }
      return { success: true, data: (await reponse.json()) as T };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, message: `Connexion internet requise pour cette opération : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }

  async obtenirMoi(): Promise<ResultatLectureMoi> {
    const res = await this.requete<{ poste: PosteInfo | null }>("/v1/app/postes/moi", { method: "GET" });
    return res.success ? { success: true, poste: res.data.poste } : res;
  }

  async lister(): Promise<ResultatLectureListe> {
    const res = await this.requete<{ postes: PosteInfo[] }>("/v1/app/postes/list", { method: "GET" });
    return res.success ? { success: true, postes: res.data.postes } : res;
  }

  async definirNom(nom: string): Promise<ResultatAction> {
    const res = await this.requete<{ success: true }>("/v1/app/postes/definir-nom", { method: "POST", body: { nom } });
    return res.success ? { success: true } : res;
  }

  async bloquer(posteId: string): Promise<ResultatAction> {
    const res = await this.requete<{ success: true }>("/v1/app/postes/bloquer", { method: "POST", body: { posteId } });
    return res.success ? { success: true } : res;
  }

  async reautoriser(posteId: string): Promise<ResultatAction> {
    const res = await this.requete<{ success: true }>("/v1/app/postes/reautoriser", { method: "POST", body: { posteId } });
    return res.success ? { success: true } : res;
  }

  async retirer(posteId: string): Promise<ResultatAction> {
    const res = await this.requete<{ success: true }>("/v1/app/postes/retirer", { method: "POST", body: { posteId } });
    return res.success ? { success: true } : res;
  }

  /**
   * Bascule de PC Shop vers le registre des postes (bouton Administrateur
   * de Paramètres, décision explicite — jamais une action technique
   * faite à la place de l'utilisateur, voir re-emettre-moi.ts côté API).
   * Remplace UNIQUEMENT le jeton dans la configuration locale, en
   * préservant `apiUrl`/`cloudBackup` déjà en place — jamais une
   * seconde logique de persistance, voir `installationRecuperationService.ts`
   * qui appelle cette même fonction après une restauration.
   */
  async rejoindreRegistre(): Promise<ResultatAction> {
    const res = await this.requete<{ jwt: string; poste: PosteInfo }>("/v1/app/postes/re-emettre-moi", { method: "POST" });
    if (!res.success) return res;

    const { apiUrl } = getConfigurationSync();
    const cloudBackup = getConfigurationCloudBackup();
    definirConfigurationSyncLocale({ apiUrl, jwt: res.data.jwt, ...(cloudBackup ? { cloudBackup } : {}) });
    return { success: true };
  }
}
