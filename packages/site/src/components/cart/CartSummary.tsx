"use client";

import { formatFcfa } from "@/lib/format";
import { LinkButton } from "@/components/ui/Button";

export function CartSummary({ totalFcfa, itemCount }: { totalFcfa: number; itemCount: number }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 p-5">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink-500">
        Résumé
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-500">Articles</dt>
          <dd className="font-semibold text-ink-800">{itemCount}</dd>
        </div>
        <div className="flex justify-between border-t border-ink-200 pt-2">
          <dt className="text-ink-700">Total estimé</dt>
          <dd className="font-display text-lg font-bold text-ink-800">{formatFcfa(totalFcfa)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-500">
        Ce montant est une estimation. Il ne s&apos;agit pas d&apos;un paiement : votre demande
        sera confirmée par MAXI EQUIP.
      </p>
      <LinkButton href="/demande" size="lg" fullWidth className="mt-4">
        Envoyer ma demande
      </LinkButton>
    </div>
  );
}
