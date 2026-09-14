/**
 * Limitation de fréquence — correction "Intégration Site Phase 5".
 * router.ts documentait déjà que le rate limiting serait "obligatoire
 * avant exposition publique" (Phase 3.5.1) : cette étape expose pour la
 * première fois une vraie route publique non authentifiée à un trafic
 * potentiellement non maîtrisé (soumission de demandes depuis le site).
 *
 * Solution volontairement simple (cahier des charges du site : "rate
 * limiting + honeypot, pas de CAPTCHA en V1") — une fenêtre fixe en
 * mémoire, par adresse IP. Suffisante pour dissuader un abus grossier,
 * jamais conçue comme une protection contre une attaque distribuée
 * sophistiquée — cohérent avec le niveau de maturité du reste du projet.
 *
 * EN MÉMOIRE, PERDU AU REDÉMARRAGE — acceptable ici : une limitation de
 * fréquence n'a pas besoin de survivre à un redémarrage du serveur pour
 * remplir son rôle, contrairement à des données métier.
 */

interface Fenetre {
  compte: number;
  debut: number;
}

const fenetres = new Map<string, Fenetre>();

export interface ResultatLimitation {
  autorise: boolean;
  reessayerDansSecondes?: number;
}

export function verifierLimitation(cle: string | undefined, maxParFenetre: number, dureeFenetreMs: number): ResultatLimitation {
  const cleReelle = cle ?? "inconnue";
  const maintenant = Date.now();
  const existante = fenetres.get(cleReelle);

  if (!existante || maintenant - existante.debut >= dureeFenetreMs) {
    fenetres.set(cleReelle, { compte: 1, debut: maintenant });
    return { autorise: true };
  }

  if (existante.compte < maxParFenetre) {
    existante.compte += 1;
    return { autorise: true };
  }

  const reessayerDansSecondes = Math.ceil((existante.debut + dureeFenetreMs - maintenant) / 1000);
  return { autorise: false, reessayerDansSecondes };
}

/** Réservé aux tests — jamais appelé par le code de production. */
export function reinitialiserLimitationPourTests(): void {
  fenetres.clear();
}
