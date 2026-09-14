import Link from "next/link";
import { buildWhatsAppUrl, siteConfig } from "@/config/site";

export default function ConfirmationPage({
  searchParams,
}: {
  searchParams: { requestId?: string };
}) {
  const requestId = searchParams.requestId;

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-700">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h1 className="mt-5 font-display text-2xl font-bold text-ink-800 sm:text-3xl">
        Votre demande a bien été envoyée
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        MAXI EQUIP va examiner votre demande et vous recontactera au numéro que vous avez
        indiqué. Ceci n&apos;est pas une confirmation de vente : rien n&apos;a encore été payé
        ni réservé.
      </p>

      {requestId && (
        <p className="mt-4 text-xs text-ink-400">
          Référence de votre demande : <span className="font-mono">{requestId}</span>
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/catalogue"
          className="rounded-md bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          Continuer à parcourir le catalogue
        </Link>
        <a
          href={buildWhatsAppUrl(
            `Bonjour ${siteConfig.companyName}, je viens d'envoyer une demande${requestId ? ` (réf. ${requestId})` : ""} depuis le site.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-ink-200 px-6 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          Suivre sur WhatsApp
        </a>
      </div>
    </div>
  );
}
