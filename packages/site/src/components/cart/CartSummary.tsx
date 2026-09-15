"use client";

import { formatFcfa } from "@/lib/format";
import { LinkButton } from "@/components/ui/primitives";

export function CartSummary({ totalFcfa, itemCount }: { totalFcfa: number; itemCount: number }) {
  return (
    <div className="sticky top-24 rounded bg-surface-soft p-7">
      <h3 className="mb-4.5 font-display text-lg">Récapitulatif</h3>
      <div className="flex justify-between py-2 text-sm text-ink-mute">
        <span>Articles</span>
        <span>{itemCount}</span>
      </div>
      <div className="mt-2.5 flex justify-between border-t border-ink/[0.14] pt-4 font-display text-base font-bold">
        <span>Total estimé</span>
        <span>{formatFcfa(totalFcfa)}</span>
      </div>
      <LinkButton href="/demande" fullWidth className="mt-5">
        Envoyer ma demande
      </LinkButton>
      <p className="mt-3 text-xs leading-relaxed text-ink-mute">
        Ce total est indicatif. Le prix définitif est confirmé par un conseiller MAXI EQUIP selon les quantités et le mode de retrait.
      </p>
    </div>
  );
}
