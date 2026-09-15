"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { CartTable } from "@/components/cart/CartTable";
import { CartSummary } from "@/components/cart/CartSummary";
import { EmptyState } from "@/components/ui/states";

export default function CartPage() {
  const { state, totalFcfa, itemCount } = useCart();

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-10">
      <h1 className="font-display text-display-1 italic leading-none text-ink">Votre panier</h1>

      {state.lines.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Rien ici pour le moment"
            description="Parcourez le catalogue pour ajouter des carreaux à votre demande."
            action={
              <Link href="/catalogue" className="font-display text-lg italic text-ember hover:underline">
                Voir le catalogue
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-12 grid gap-14 lg:grid-cols-[1fr_320px]">
          <CartTable lines={state.lines} />
          <CartSummary totalFcfa={totalFcfa} itemCount={itemCount} />
        </div>
      )}
    </div>
  );
}
