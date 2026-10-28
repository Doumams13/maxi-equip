import { getConfigurationSync } from "../services/syncConfig.js";

/**
 * Connexion centralisée — correction "travail à distance / plusieurs
 * machines en parallèle" (2026-10-22). Dès que la synchronisation est
 * configurée sur ce poste, AuthService.login() appelle ce service plutôt
 * que de vérifier le mot de passe localement (décision utilisateur
 * explicite : un compte créé par l'Administrateur doit être utilisable
 * depuis n'importe quel poste synchronisé). Sur un poste où la
 * synchronisation N'EST PAS configurée, ce service n'est jamais appelé —
 * la connexion reste 100% locale et hors-ligne, exactement comme avant
 * cette correction (y compris pour le tout premier compte Administrateur,
 * créé avant même qu'une configuration réseau existe).
 */

const DELAI_MAX_REQUETE_MS = 15_000;

export type ResultatLoginCentral =
  | { success: true; jwt: string; compte: { id: string; identifiant: string; nom: string; role: string } }
  | { success: false; raison: "identifiants_invalides" | "trop_de_tentatives" | "poste_bloque" | "hors_ligne" | "erreur_serveur"; message: string };

export class LoginCentralService {
  estConfiguree(): boolean {
    return getConfigurationSync().jwt !== null;
  }

  async login(identifiant: string, motDePasse: string): Promise<ResultatLoginCentral> {
    const { apiUrl, jwt } = getConfigurationSync();
    if (!jwt) {
      return { success: false, raison: "hors_ligne", message: "Synchronisation non configurée sur ce poste." };
    }

    const controller = new AbortController();
    const delai = setTimeout(() => controller.abort(), DELAI_MAX_REQUETE_MS);
    try {
      const reponse = await fetch(`${apiUrl}/v1/app/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ identifiant, motDePasse }),
        signal: controller.signal,
      });

      if (reponse.status === 401) {
        const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null;
        return { success: false, raison: "identifiants_invalides", message: corps?.error?.message ?? "Identifiant ou mot de passe incorrect." };
      }
      // Système multiposte fiable (2026-10-28) — 403 : le jeton
      // d'INSTALLATION de ce poste reste cryptographiquement valide,
      // mais ce poste a été bloqué par un administrateur (voir
      // router.ts/authentifier()) — distinct d'un 401 (identifiant/mot
      // de passe incorrect), jamais confondu avec lui.
      if (reponse.status === 403) {
        const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null;
        return { success: false, raison: "poste_bloque", message: corps?.error?.message ?? "Ce poste a été bloqué par un administrateur." };
      }
      if (reponse.status === 429) {
        const corps = (await reponse.json().catch(() => null)) as { error?: { message?: string } } | null;
        return { success: false, raison: "trop_de_tentatives", message: corps?.error?.message ?? "Trop de tentatives de connexion — réessayez plus tard." };
      }
      if (!reponse.ok) {
        return { success: false, raison: "erreur_serveur", message: `Le serveur a refusé la demande (HTTP ${reponse.status}).` };
      }

      const corps = (await reponse.json()) as { success: true; jwt: string; compte: { id: string; identifiant: string; nom: string; role: string } };
      return { success: true, jwt: corps.jwt, compte: corps.compte };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau inconnue.";
      return { success: false, raison: "hors_ligne", message: `Connexion internet requise pour se connecter depuis ce poste : ${message}` };
    } finally {
      clearTimeout(delai);
    }
  }
}
