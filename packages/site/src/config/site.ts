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
  legalName: "MAXI EQUIP — Quincaillerie et Vente de Matériaux de Construction",
  tagline: "Équiper aujourd'hui vos projets de demain",
  slogan: "Construire Ensemble",
  description:
    "Vente de carreaux et matériaux de construction à Libreville, Gabon : faïence, grès cérame, mosaïque et antidérapant pour tous vos projets.",
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

export function buildWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${siteConfig.contact.whatsappNumberIntl.replace("+", "")}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
