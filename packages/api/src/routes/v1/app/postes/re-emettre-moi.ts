import type { Route } from "../../../../core/types.js";
import { obtenirOuCreerPosteShop } from "../../../../core/posteStore.js";
import { emettreJetonApplication } from "../../../../core/emissionJetonApplication.js";
import { getJwtSecret } from "../../../../core/config.js";

const DUREE_JETON_SECONDES = 365 * 24 * 60 * 60;

/**
 * POST /v1/app/postes/re-emettre-moi — système multiposte fiable
 * (2026-10-28), bascule du PC Shop vers le registre des postes.
 *
 * AVANT cette correction, le PC Shop n'a jamais obtenu de jeton via
 * `verifier-recuperation` (c'est la toute première installation,
 * jamais une restauration) — son `sub` actuel est un `randomUUID()`
 * jeté à l'époque de `emissionJetonApplication.ts`, jamais persisté
 * dans `postes`. Décision explicite (jamais une action technique faite
 * à la place de l'utilisateur) : un nouveau bouton Administrateur dans
 * Paramètres appelle CETTE route, volontairement, une fois.
 *
 * Le `sub` du jeton actuel de l'appelant n'est JAMAIS réutilisé ici —
 * `obtenirOuCreerPosteShop` cherche/crée la ligne `role = 'shop'` par
 * son RÔLE, pas par l'ancien `sub` (qui n'a aucune signification). Un
 * second appel (ex. double-clic) est sûr : la ligne "shop" existe déjà,
 * un nouveau jeton portant le MÊME id lui est simplement réémis —
 * jamais une seconde ligne créée (voir idx_postes_role_shop_unique).
 *
 * Le client remplace ENSUITE sa configuration de synchronisation
 * locale avec ce nouveau jeton (voir posteSyncService.ts côté
 * Electron, `definirConfigurationSyncLocale`) — cette route ne modifie
 * jamais rien côté client elle-même.
 */
export const postesReEmettreMoiRoute: Route = {
  method: "POST",
  path: "/app/postes/re-emettre-moi",
  trustLevel: "app",
  handler: async () => {
    const poste = await obtenirOuCreerPosteShop(new Date().toISOString());
    const jwt = emettreJetonApplication(poste.id, getJwtSecret(), DUREE_JETON_SECONDES);
    return { status: 200, body: { jwt, poste } };
  },
};
