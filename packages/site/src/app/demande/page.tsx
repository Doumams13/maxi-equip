"use client";

import { useCart } from "@/lib/cart/CartContext";
import { RequestForm } from "@/components/forms/RequestForm";
import { OrderRecap } from "@/components/forms/OrderRecap";

export default function DemandePage() {
  const { state, totalFcfa } = useCart();

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-16 sm:px-10">
      <h1 className="font-display text-display-1 italic leading-none text-ink">Envoyer ma demande</h1>
      <p className="mt-4 max-w-lg text-sm text-ink/60">
        Renseignez vos coordonnées : MAXI EQUIP vous recontactera pour confirmer votre commande. Aucun paiement n&apos;est demandé ici.
      </p>

      <div className="mt-12 grid gap-14 lg:grid-cols-[1fr_320px]">
        <RequestForm />
        {state.lines.length > 0 && <OrderRecap lines={state.lines} totalFcfa={totalFcfa} />}
      </div>
    </div>
  );
}
