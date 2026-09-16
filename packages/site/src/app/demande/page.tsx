"use client";

import { useCart } from "@/lib/cart/CartContext";
import { RequestForm } from "@/components/forms/RequestForm";
import { OrderRecap } from "@/components/forms/OrderRecap";

export default function DemandePage() {
  const { state, totalFcfa } = useCart();

  return (
    <div className="mx-auto max-w-[1320px] px-[18px] py-8 sm:px-7 sm:pb-16">
      <h1 className="font-display text-[clamp(26px,3vw,36px)] text-forest-deep">Envoyer une demande</h1>
      <p className="mt-3 max-w-[50ch] text-[14.5px] text-ink-mute">
        Transmettez votre panier à MAXI EQUIP. Un conseiller vous recontacte pour confirmer prix, disponibilité et
        retrait ou livraison. Il ne s&apos;agit pas d&apos;un paiement en ligne.
      </p>

      <div className="mt-9 grid gap-12 md:grid-cols-[1.2fr_1fr]">
        <RequestForm />
        {state.lines.length > 0 && <OrderRecap lines={state.lines} totalFcfa={totalFcfa} />}
      </div>
    </div>
  );
}
