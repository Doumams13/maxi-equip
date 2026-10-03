import { buildWhatsAppUrl } from "@/config/site";
import { getEffectiveContactInfo } from "@/services/settings";

/**
 * Bouton WhatsApp flottant, visible sur toutes les pages (voir
 * app/layout.tsx) — demande explicite : un accès direct toujours visible
 * à l'écran, distinct du lien WhatsApp déjà présent dans le pied de page
 * (Footer.tsx), qui reste inchangé. Même numéro, même mécanisme
 * (`getEffectiveContactInfo` + `buildWhatsAppUrl`) — jamais une seconde
 * source de vérité pour ce numéro.
 */
export async function WhatsAppFloatingButton() {
  const contact = await getEffectiveContactInfo();
  return (
    <a
      href={buildWhatsAppUrl(`Bonjour ${contact.nom}, j'ai une question.`, contact.whatsapp)}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-[13.5px] font-semibold text-white shadow-lg transition-transform hover:scale-105"
      aria-label={`Contacter ${contact.nom} sur WhatsApp`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.76.46 3.48 1.34 5L2 22l5.17-1.35A9.96 9.96 0 0 0 12.04 22c5.52 0 10-4.48 10-10S17.56 2 12.04 2Zm0 18.18c-1.6 0-3.17-.43-4.54-1.24l-.33-.2-3.07.8.82-3-.21-.34a8.17 8.17 0 0 1-1.26-4.4c0-4.52 3.68-8.2 8.2-8.2s8.2 3.68 8.2 8.2-3.68 8.18-8.2 8.18Zm4.5-6.13c-.25-.12-1.47-.73-1.7-.81-.23-.08-.4-.12-.56.12-.17.25-.65.81-.8.97-.14.17-.3.19-.55.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.3.37-.44.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08s.9 2.41 1.02 2.58c.12.17 1.78 2.72 4.32 3.81.6.26 1.08.42 1.44.53.6.19 1.15.17 1.59.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.29Z" />
      </svg>
      WhatsApp
    </a>
  );
}
