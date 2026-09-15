import { buildWhatsAppUrl, siteConfig } from "@/config/site";
import { LinkButton } from "@/components/ui/primitives";

export default function ConfirmationPage({ searchParams }: { searchParams: { requestId?: string } }) {
  const requestId = searchParams.requestId;

  return (
    <div className="mx-auto max-w-[1180px] px-[18px] py-[70px] text-center sm:px-7">
      <h2 className="mb-3 font-display text-[26px]">Demande envoyée</h2>
      <p className="mx-auto max-w-[42ch] text-[14.5px] leading-relaxed text-ink-mute">
        Merci. Un conseiller MAXI EQUIP vous recontacte sous peu au numéro indiqué pour confirmer votre commande.
      </p>

      {requestId && (
        <p className="mt-4 text-xs text-ink-mute">
          Référence : <span className="font-mono">{requestId}</span>
        </p>
      )}

      <div className="mt-6.5 flex flex-wrap justify-center gap-3.5">
        <LinkButton href="/catalogue" variant="ghost">
          Retour au catalogue
        </LinkButton>
        <LinkButton
          href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, je viens d'envoyer une demande${requestId ? ` (réf. ${requestId})` : ""} depuis le site.`)}
          target="_blank"
          rel="noopener noreferrer"
          variant="clay"
        >
          Suivre sur WhatsApp
        </LinkButton>
      </div>
    </div>
  );
}
