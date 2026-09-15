"use client";

import { formatFcfa } from "@/lib/format";
import { LinkButton } from "@/components/ui/Button";

export function CartSummary({ totalFcfa, itemCount }: { totalFcfa: number; itemCount: number }) {
  return (
    <div className="border-t-2 border-pine-700 bg-stone-50 p-6">
      <h2 className="font-display text-lg text-stone-900">Résumé</h2>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-stone-500">Articles</dt>
          <dd className="font-medium text-stone-800">{itemCount}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-200 pt-3">
          <dt className="text-stone-700">Total estimé</dt>
          <dd className="font-display text-xl text-stone-900">{formatFcfa(totalFcfa)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-stone-500">
        Ce montant est une estimation. Il ne s&apos;agit pas d&apos;un paiement : votre demande sera confirmée par MAXI
        EQUIP.
      </p>
      <LinkButton href="/demande" size="lg" fullWidth className="mt-5">
        Envoyer ma demande
      </LinkButton>
    </div>
  );
}
