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
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex items-end justify-between">
        <h2 className="font-display text-xl font-bold text-ink-800 sm:text-2xl">
          Modèles mis en avant
        </h2>
        <Link href="/catalogue" className="text-sm font-semibold text-green-700 hover:underline">
          Voir tout le catalogue →
        </Link>
      </div>

      {models.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Aucun modèle mis en avant pour le moment"
            description="Le catalogue complet reste disponible."
            action={
              <Link href="/catalogue" className="text-sm font-semibold text-green-700 hover:underline">
                Découvrir le catalogue
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((m) => (
            <ProductCard key={m.id} model={m} promotions={promotions} />
          ))}
        </div>
      )}
    </section>
  );
}
