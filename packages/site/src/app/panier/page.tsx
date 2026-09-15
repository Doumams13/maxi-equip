"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { CartTable } from "@/components/cart/CartTable";
import { CartSummary } from "@/components/cart/CartSummary";
import { EmptyState } from "@/components/ui/states";

export default function CartPage() {
  const { state, totalFcfa, itemCount } = useCart();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl text-stone-900 sm:text-4xl">Votre panier</h1>

      {state.lines.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Votre panier est vide"
            description="Parcourez le catalogue pour ajouter des carreaux à votre demande."
            action={
              <Link href="/catalogue" className="text-sm font-semibold text-pine-700 hover:underline">
                Voir le catalogue
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
          <CartTable lines={state.lines} />
          <CartSummary totalFcfa={totalFcfa} itemCount={itemCount} />
        </div>
      )}
    </div>
  );
}
