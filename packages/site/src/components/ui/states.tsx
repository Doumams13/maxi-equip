import type { ReactNode } from "react";

/**
 * États UI obligatoires (consigne explicite de la phase : "ne laisse pas des
 * écrans blancs en cas d'erreur"). Utilisés par toutes les pages qui
 * dépendent d'un service (catalogue, produit, panier, demande).
 */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-ink-200 bg-ink-50 px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold text-ink-800">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Une erreur est survenue",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-status-error/30 bg-status-errorBg px-6 py-14 text-center"
    >
      <p className="font-display text-lg font-semibold text-status-error">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-600">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Chargement du catalogue"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-lg border border-ink-100 bg-white">
          <div className="aspect-square bg-ink-100" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 rounded bg-ink-100" />
            <div className="h-3 w-1/3 rounded bg-ink-100" />
            <div className="h-5 w-1/2 rounded bg-ink-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
