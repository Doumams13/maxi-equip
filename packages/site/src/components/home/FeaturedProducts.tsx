import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { EmptyState } from "@/components/ui/states";

export function FeaturedProducts({
  models,
  promotions,
}: {
  models: ProductModel[];
  promotions: Promotion[];
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex items-end justify-between">
        <h2 className="font-display text-2xl text-stone-900 sm:text-3xl">Modèles mis en avant</h2>
        <Link href="/catalogue" className="text-sm font-semibold text-pine-700 underline decoration-1 underline-offset-4 hover:text-pine-800">
          Voir tout le catalogue
        </Link>
      </div>

      {models.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Aucun modèle mis en avant pour le moment"
            description="Le catalogue complet reste disponible."
            action={
              <Link href="/catalogue" className="text-sm font-semibold text-pine-700 hover:underline">
                Découvrir le catalogue
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <ProductCard key={m.id} model={m} promotions={promotions} />
          ))}
        </div>
      )}
    </section>
  );
}
