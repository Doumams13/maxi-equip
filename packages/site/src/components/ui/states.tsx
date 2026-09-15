import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 border-t border-ink/15 px-6 py-24 text-center">
      <p className="max-w-md font-display text-3xl italic text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink/60">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Un imprévu s'est glissé ici", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 border-t border-status-error/30 px-6 py-24 text-center">
      <p className="max-w-md font-display text-3xl italic text-status-error">{title}</p>
      {description && <p className="max-w-md text-sm text-ink/70">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingGrid({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement du catalogue" className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5] bg-ink/10" />
          <div className="mt-4 h-5 w-2/3 bg-ink/10" />
          <div className="mt-2 h-4 w-1/3 bg-ink/10" />
        </div>
      ))}
    </div>
  );
}
