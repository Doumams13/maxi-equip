import type { Route } from "../../../../core/types.js";
import { ValidationError, UnauthorizedError, NotFoundError, TooManyRequestsError, ForbiddenError } from "../../../../core/errors.js";
import { verifierRecuperation, getCleChiffreeSauvegarde, getCleChiffreeCloudBackup } from "../../../../core/recuperationInstallationStore.js";
import { emettreJetonApplication } from "../../../../core/emissionJetonApplication.js";
import { getJwtSecret, getB2RecuperationConfig } from "../../../../core/config.js";
import { genererUrlsDerniereSauvegarde } from "../../../../core/b2Presigner.js";
import { verifierLimitation } from "../../../../core/rateLimiter.js";
import { creerPosteAnnexeSiLimiteNonAtteinte } from "../../../../core/posteStore.js";

const MAX_TENTATIVES = 5;
const FENETRE_MS = 15 * 60 * 1000;

/**
 * POST /v1/public/installation/verifier-recuperation — PUBLIQUE par
 * nécessité : une installation fraîche n'a par définition encore AUCUN
 * jeton (voir l'échange sur le vol du PC Shop — le but est justement de
 * ne plus dépendre d'un accès SSH au VPS pour en obtenir un). Protégée
 * par un rate limiting par IP (voir core/rateLimiter.ts, comblant le
 * manque signalé dans router.ts) — 5 tentatives / 15 min, sinon 429.
 *
 * Réponses distinguées volontairement :
 *  - 404 "aucune récupération configurée" : jamais définie côté serveur
 *    (première installation de tous les temps) — l'app doit alors
 *    proposer la configuration initiale classique, jamais un mot de
 *    passe erroné.
 *  - 401 : mot de passe incorrect.
 *  - 403 : les 5 postes annexes autorisés par cette installation sont
 *    déjà tous enregistrés (voir core/posteStore.ts) — un admin doit
 *    explicitement en retirer un avant qu'une nouvelle restauration ne
 *    puisse réussir ici.
 *  - 429 : trop de tentatives.
 *  - 200 { jwt, downloadUrls } : jeton frais émis + 3 URLs présignées
 *    (database/metadata/checksum) vers la dernière sauvegarde SQLite
 *    (`downloadUrls: null` si aucune sauvegarde cloud n'a encore été
 *    configurée/produite — l'app doit alors avertir plutôt que
 *    d'échouer silencieusement).
 *
 *    Système multiposte fiable (2026-10-28) : le `sub` de ce jeton
 *    n'est PLUS une valeur jetée — il est désormais l'identifiant
 *    technique d'une ligne `postes` fraîchement créée (toujours
 *    NOUVELLE, jamais celle d'un poste déjà existant, même en cas de
 *    réinstallation d'une machine physiquement déjà connue : voir
 *    serverStorage.ts/PosteRow — c'est précisément ce qui garantit
 *    qu'un poste supprimé puis réinstallé ne regagne jamais
 *    automatiquement une ancienne autorisation). La vérification de la
 *    limite de 5 postes annexes et la création de cette ligne sont
 *    atomiques (voir creerPosteAnnexeSiLimiteNonAtteinte), pour ne
 *    jamais permettre à 6 restaurations simultanées de passer la limite.
 */
export const verifierRecuperationRoute: Route = {
  method: "POST",
  path: "/public/installation/verifier-recuperation",
  trustLevel: "public",
  handler: async (req) => {
    // Préfixe dédié : verifierLimitation() partage une même table de
    // compteurs entre TOUTES les routes qui l'appellent (voir
    // core/rateLimiter.ts, clé = IP seule) — sans préfixe, un client
    // épuisant son quota sur /v1/public/requests se retrouverait aussi
    // bloqué ici par erreur, et inversement. Namespace nécessaire dès
    // qu'une deuxième route publique limitée en fréquence existe.
    const limitation = verifierLimitation(req.ip ? `installation-recuperation:${req.ip}` : undefined, MAX_TENTATIVES, FENETRE_MS);
    if (!limitation.autorise) {
      throw new TooManyRequestsError(
        `Trop de tentatives — réessayez dans ${limitation.reessayerDansSecondes ?? 900} secondes.`
      );
    }

    const body = req.body as { motDePasse?: unknown } | undefined;
    if (!body || typeof body.motDePasse !== "string" || body.motDePasse.length === 0) {
      throw new ValidationError("motDePasse (chaîne non vide) est requis.");
    }

    const resultat = await verifierRecuperation(body.motDePasse);
    if (resultat === "aucune_recuperation_configuree") {
      throw new NotFoundError("Aucune récupération n'est configurée sur ce serveur.");
    }
    if (resultat === "mot_de_passe_incorrect") {
      throw new UnauthorizedError("Mot de passe incorrect.");
    }

    // Système multiposte fiable (2026-10-28) — crée la ligne `postes`
    // (toujours un nouveau poste annexe, jamais la réutilisation d'un
    // ancien) ET vérifie la limite de 5 postes annexes dans la MÊME
    // transaction atomique (voir creerPosteAnnexeSiLimiteNonAtteinte) —
    // AVANT de signer le jeton, pour que son `sub` soit toujours
    // l'identifiant d'un poste réellement enregistré.
    const resultatPoste = await creerPosteAnnexeSiLimiteNonAtteinte(new Date().toISOString());
    if (!resultatPoste.success) {
      throw new ForbiddenError("Le nombre maximal de postes annexes (5) est déjà atteint pour cette installation — un administrateur doit en retirer un avant de continuer.");
    }

    // 365 jours — même durée que celle utilisée jusqu'ici pour l'émission
    // manuelle via emettre-jwt-installation.ts, jamais la valeur par
    // défaut de 24h (pensée pour un tout autre usage, voir
    // emissionJetonApplication.ts).
    const DUREE_JETON_RECUPERATION_SECONDES = 365 * 24 * 60 * 60;
    const jwt = emettreJetonApplication(resultatPoste.poste.id, getJwtSecret(), DUREE_JETON_RECUPERATION_SECONDES);

    const configB2 = getB2RecuperationConfig();
    const downloadUrls = configB2 ? await genererUrlsDerniereSauvegarde(configB2) : null;

    // Sûr de renvoyer ce blob maintenant : l'appelant vient de prouver
    // qu'il connaît le mot de passe (seule clé de déchiffrement possible
    // pour ce blob, voir backupCrypto.ts côté Electron) — jamais renvoyé
    // avant ce point.
    const cleChiffreeSauvegardeJson = await getCleChiffreeSauvegarde();
    const cleChiffreeSauvegarde = cleChiffreeSauvegardeJson ? JSON.parse(cleChiffreeSauvegardeJson) : null;

    const cleChiffreeCloudBackupJson = await getCleChiffreeCloudBackup();
    const cleChiffreeCloudBackup = cleChiffreeCloudBackupJson ? JSON.parse(cleChiffreeCloudBackupJson) : null;

    return { status: 200, body: { jwt, downloadUrls, cleChiffreeSauvegarde, cleChiffreeCloudBackup } };
  },
};
