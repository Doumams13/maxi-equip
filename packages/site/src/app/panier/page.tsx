"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/CartContext";
import { CartTable } from "@/components/cart/CartTable";
import { CartSummary } from "@/components/cart/CartSummary";
import { EmptyState } from "@/components/ui/states";

export default function CartPage() {
  const { state, totalFcfa, itemCount } = useCart();

  return (
    <div className="mx-auto max-w-[1180px] px-[18px] py-8 sm:px-7 sm:pb-16">
      <h1 className="mb-6 font-display text-[clamp(24px,3vw,36px)] text-forest-deep">Votre sélection</h1>

      {state.lines.length === 0 ? (
        <EmptyState
          title="Votre sélection est vide"
          description="Parcourez le catalogue pour ajouter des carreaux à votre demande."
          action={
            <Link href="/catalogue" className="text-sm font-semibold text-forest hover:underline">
              Voir le catalogue
            </Link>
          }
        />
      ) : (
        <div className="grid gap-9 md:grid-cols-[1.6fr_1fr] md:items-start">
          <CartTable lines={state.lines} />
          <CartSummary totalFcfa={totalFcfa} itemCount={itemCount} />
        </div>
      )}
    </div>
  );
}
