import { buildWhatsAppUrl, siteConfig } from "@/config/site";
import { LinkButton } from "@/components/ui/Button";

export default function ConfirmationPage({ searchParams }: { searchParams: { requestId?: string } }) {
  const requestId = searchParams.requestId;

  return (
    <div className="bg-ink text-paper">
      <div className="mx-auto flex min-h-[70vh] max-w-[900px] flex-col items-center justify-center px-5 py-20 text-center sm:px-10">
        <p className="font-display text-lg italic text-paper/60">C&apos;est fait</p>
        <h1 className="mt-2 font-display text-display-1 italic leading-none text-paper">Votre demande a bien été envoyée</h1>
        <p className="mt-6 max-w-lg text-sm leading-relaxed text-paper/70">
          MAXI EQUIP va examiner votre demande et vous recontactera au numéro que vous avez indiqué. Ceci n&apos;est pas une confirmation de vente :
          rien n&apos;a encore été payé ni réservé.
        </p>

        {requestId && (
          <p className="mt-5 text-xs text-paper/40">
            Référence : <span className="font-mono">{requestId}</span>
          </p>
        )}

        <div className="mt-10 flex flex-col items-center gap-5 sm:flex-row">
          <LinkButton href="/catalogue" variant="outline-light">
            Continuer à parcourir
          </LinkButton>
          <a
            href={buildWhatsAppUrl(`Bonjour ${siteConfig.companyName}, je viens d'envoyer une demande${requestId ? ` (réf. ${requestId})` : ""} depuis le site.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-lg italic text-paper underline decoration-ember decoration-2 underline-offset-8 hover:text-ember"
          >
            Suivre sur WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
