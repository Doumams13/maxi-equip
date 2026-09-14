"use client";

import { useCart } from "@/lib/cart/CartContext";
import { RequestForm } from "@/components/forms/RequestForm";
import { OrderRecap } from "@/components/forms/OrderRecap";

export default function DemandePage() {
  const { state, totalFcfa } = useCart();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold text-ink-800 sm:text-3xl">
        Envoyer ma demande
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        Renseignez vos coordonnées : MAXI EQUIP vous recontactera pour confirmer votre commande.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <RequestForm />
        {state.lines.length > 0 && <OrderRecap lines={state.lines} totalFcfa={totalFcfa} />}
      </div>
    </div>
  );
}
