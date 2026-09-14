/**
 * Structure d'une demande de commande envoyée depuis le site (cahier des
 * charges §8 : "Catalogue → produit → taille → quantité → panier →
 * informations client → envoi"). Cette forme correspond à ce que l'API
 * centrale exposera en Phase 3/4 sous /v1/public/requests — elle est définie
 * dès maintenant pour que le passage du mock à l'appel réel ne change aucune
 * autre partie du site (voir src/services/requestService.ts).
 */
export interface OrderRequestLine {
  productModelId: string;
  productModelName: string;
  variantId: string;
  size: string;
  quantity: number;
  /**
   * Correction "Intégration Site Phase 5" — omis par erreur dans la
   * version initiale alors que le prix est déjà connu côté panier
   * (`CartLine.unitPriceFcfa`) : sans lui, une demande arriverait dans
   * MAXI-EQUIP sans indication de prix, obligeant le personnel à
   * deviner. Reste un prix INDICATIF (cahier des charges) — le
   * personnel confirme toujours le prix réel lors du traitement.
   */
  unitPriceFcfa: number;
}

export interface OrderRequestInput {
  customerName: string;
  phone: string;
  /** Localisation/adresse — obligatoire (cahier des charges §8). */
  location: string;
  /** Facultatif (cahier des charges §8). */
  email?: string;
  /** Facultatif (cahier des charges §8). */
  comment?: string;
  lines: OrderRequestLine[];
  /**
   * Champ piège ("honeypot") contre les soumissions automatisées — doit
   * toujours rester vide. Préparé dès le frontend conformément à la
   * Synthèse d'architecture (étape 5) et au cahier des charges (protection du
   * formulaire public : rate limiting + honeypot, pas de CAPTCHA en V1).
   * La vraie limitation de fréquence sera appliquée côté API, pas ici.
   */
  websiteHoneypot?: string;
}

export interface OrderRequestResult {
  requestId: string;
  submittedAt: string;
}

export type OrderRequestError =
  | { kind: "validation"; message: string }
  | { kind: "network"; message: string }
  | { kind: "unknown"; message: string };
