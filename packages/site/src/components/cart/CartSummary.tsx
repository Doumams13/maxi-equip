"use client";

import { formatFcfa } from "@/lib/format";
import { LinkButton } from "@/components/ui/Button";

export function CartSummary({ totalFcfa, itemCount }: { totalFcfa: number; itemCount: number }) {
  return (
    <div className="border-t-2 border-ink pt-6">
      <p className="font-display text-lg italic text-ink/50">Récapitulatif</p>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink/60">Articles</dt>
          <dd className="text-ink">{itemCount}</dd>
        </div>
        <div className="flex justify-between border-t border-ink/15 pt-3">
          <dt className="text-ink">Total estimé</dt>
          <dd className="font-display text-2xl italic text-ink">{formatFcfa(totalFcfa)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-ink/45">
        Ce montant est une estimation. Il ne s&apos;agit pas d&apos;un paiement : votre demande sera confirmée par MAXI EQUIP.
      </p>
      <LinkButton href="/demande" size="lg" fullWidth className="mt-6">
        Envoyer ma demande
      </LinkButton>
    </div>
  );
}
