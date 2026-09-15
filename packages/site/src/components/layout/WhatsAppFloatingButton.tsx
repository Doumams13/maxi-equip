import { buildWhatsAppUrl, siteConfig } from "@/config/site";

export function WhatsAppFloatingButton() {
  return (
    <a
      href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, je souhaite avoir des informations sur vos carreaux.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contacter MAXI EQUIP sur WhatsApp"
      className="fixed bottom-6 right-6 z-40 bg-moss px-5 py-3 font-display text-base italic text-paper shadow-[0_12px_32px_rgba(20,18,15,0.35)] transition-colors hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
    >
      WhatsApp
    </a>
  );
}
