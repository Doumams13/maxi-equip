import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-ink-mute">
      <p className="font-display text-xl text-ink">{title}</p>
      {description && <p className="max-w-md text-sm">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = "Un imprévu s'est produit", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-display text-xl text-clay">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-mute">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingGrid({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Chargement" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square rounded-sm bg-ink/10" />
          <div className="mt-2.5 h-4 w-2/3 bg-ink/10" />
          <div className="mt-1.5 h-3 w-1/3 bg-ink/10" />
        </div>
      ))}
    </div>
  );
}
