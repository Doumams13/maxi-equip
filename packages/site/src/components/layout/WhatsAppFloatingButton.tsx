import { buildWhatsAppUrl, siteConfig } from "@/config/site";

/**
 * Accès WhatsApp permanent (cahier des charges §8/§9 : "bouton WhatsApp
 * accessible en permanence"). Placé en position fixe pour rester visible
 * pendant le défilement, y compris sur mobile.
 */
export function WhatsAppFloatingButton() {
  return (
    <a
      href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, je souhaite avoir des informations sur vos carreaux.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contacter MAXI EQUIP sur WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-pine-600 px-4 py-3 text-sm font-semibold text-white shadow-floating hover:bg-pine-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-800"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2.5c-5.28 0-9.56 4.28-9.56 9.56 0 1.69.44 3.33 1.28 4.78L2.5 21.5l4.83-1.24a9.53 9.53 0 0 0 4.71 1.24h.01c5.28 0 9.56-4.28 9.56-9.56S17.32 2.5 12.04 2.5Zm5.6 13.63c-.24.66-1.4 1.26-1.93 1.34-.5.08-1.12.11-1.8-.12a13.9 13.9 0 0 1-1.66-.62c-2.92-1.27-4.83-4.2-4.98-4.4-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.6-.37.8-.37h.57c.19 0 .43-.03.67.51.24.55.83 1.9.9 2.04.07.14.12.3.02.49-.1.19-.15.3-.3.47-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.3.76 1.26 1.64 2.04 1.13 1 2.07 1.32 2.37 1.47.3.15.47.13.65-.07.17-.2.73-.85.93-1.14.2-.29.39-.24.66-.14.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.13.07.72-.17 1.38Z" />
      </svg>
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
