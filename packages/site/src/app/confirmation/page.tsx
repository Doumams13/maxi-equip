import { buildWhatsAppUrl, siteConfig } from "@/config/site";
import { LinkButton } from "@/components/ui/Button";

export default function ConfirmationPage({
  searchParams,
}: {
  searchParams: { requestId?: string };
}) {
  const requestId = searchParams.requestId;

  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center bg-pine-50 text-pine-700">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 className="mt-6 font-display text-3xl text-stone-900 sm:text-4xl">Votre demande a bien été envoyée</h1>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">
        MAXI EQUIP va examiner votre demande et vous recontactera au numéro que vous avez indiqué. Ceci n&apos;est pas
        une confirmation de vente : rien n&apos;a encore été payé ni réservé.
      </p>

      {requestId && (
        <p className="mt-5 text-xs text-stone-400">
          Référence de votre demande : <span className="font-mono">{requestId}</span>
        </p>
      )}

      <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <LinkButton href="/catalogue">Continuer à parcourir le catalogue</LinkButton>
        <a
          href={buildWhatsAppUrl(
            `Bonjour ${siteConfig.companyName}, je viens d'envoyer une demande${requestId ? ` (réf. ${requestId})` : ""} depuis le site.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800 hover:border-stone-900"
        >
          Suivre sur WhatsApp
        </a>
      </div>
    </div>
  );
}
