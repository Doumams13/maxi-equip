/**
 * Informations d'entreprise utilisées par le site public.
 *
 * Chaque valeur ci-dessous indique sa source. Rien n'est inventé : quand une
 * information précise manquait dans les documents fournis, une valeur
 * provisoire non bloquante est utilisée et signalée explicitement (voir
 * rapport de fin de phase).
 */
export const siteConfig = {
  companyName: "MAXI EQUIP",

  /**
   * Phase SEO — domaine de production déjà référencé ailleurs dans le
   * monorepo (voir packages/api/src/core/cors.ts, §14 : "maxi-equip.com /
   * api.maxi-equip.com"). Source unique pour metadataBase, canonical,
   * sitemap.xml et robots.txt — jamais un domaine ".example" en dur
   * dupliqué à plusieurs endroits.
   */
  url: "https://maxi-equip.com",
  /**
   * Correction — la refonte précise explicitement : "MAXI EQUIP vend
   * UNIQUEMENT des CARREAUX. Il ne s'agit pas d'une entreprise générale
   * de matériaux de construction." L'ancienne valeur ("Quincaillerie et
   * Vente de Matériaux de Construction") contredisait directement cette
   * règle — corrigée pour refléter fidèlement l'activité réelle.
   */
  legalName: "MAXI EQUIP — Spécialiste du carrelage",
  tagline: "Le carrelage qui donne du caractère à vos espaces",
  slogan: "Construire Ensemble",
  description:
    "MAXI EQUIP est spécialiste du carrelage à Libreville, Gabon : faïence, grès cérame, mosaïque et antidérapant, dans toutes les tailles, pour tous vos projets.",
  city: "Libreville, Gabon",

  // Source : DOCUMENTS/MAXI EQUIP Entete..pdf et Facture_MAXI_EQUIP (1).pdf
  // (en-tête et gabarit de facture officiels fournis par MAXI EQUIP).
  contact: {
    phoneDisplay: "066 33 87 30",
    /**
     * Numéro utilisé pour le bouton WhatsApp.
     * ⚠️ PROVISOIRE — À CONFIRMER : les documents fournis donnent un numéro de
     * téléphone officiel unique (066 33 87 30, en-tête MAXI EQUIP) mais ne le
     * qualifient pas explicitement de "numéro WhatsApp". Le cahier des
     * charges (§9) exige un "bouton WhatsApp vers le numéro défini par MAXI
     * EQUIP" sans donner ce numéro séparément. Ce numéro est donc repris par
     * défaut (choix provisoire non bloquant), au format international pour
     * l'URL wa.me (+241 correspond à l'indicatif du Gabon). À REMPLACER dès
     * que MAXI EQUIP confirme le numéro WhatsApp exact — un seul fichier à
     * modifier (celui-ci).
     */
    whatsappNumberIntl: "+24166338730",
    email: "bempatra@gamil.com",
  },

  // Source : cahier des charges §9 et Synthèse d'architecture étape 4
  // ("SHOP identifié comme point de vente ; Akébé et Akanda mentionnés comme
  // dépôts de stockage, jamais comme lieux d'achat").
  legalMentions: {
    rccm: "GA-LBV-01-2025-B13-00187",
    nif: "2025 0100 6503 M",
    bp: "BP 22103, Libreville, Gabon",
  },

  currency: "FCFA",
} as const;

/**
 * `numero` : correction "L'appli gère les infos du site" — permet de
 * passer le numéro réellement synchronisé depuis l'application
 * (services/settings/index.ts, `getEffectiveContactInfo()`) au lieu de
 * toujours utiliser la valeur statique. Optionnel — sans lui, comportement
 * strictement inchangé (repli sur `siteConfig.contact.whatsappNumberIntl`).
 * Toujours nettoyé de tout caractère non numérique (espaces, tirets...)
 * avant de construire l'URL wa.me, qui n'accepte que des chiffres — une
 * saisie humaine côté app ("+241 66 33 87 30") ne doit jamais produire un
 * lien cassé.
 */
export function buildWhatsAppUrl(message?: string, numero?: string): string {
  const numeroBrut = numero || siteConfig.contact.whatsappNumberIntl;
  const numeroNettoye = numeroBrut.replace(/\D/g, "");
  const base = `https://wa.me/${numeroNettoye}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
