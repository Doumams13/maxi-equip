import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { catalogRepository } from "@/services/catalog";
import { Gallery } from "@/components/product/Gallery";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { ErrorState } from "@/components/ui/states";

interface ProductPageProps {
  params: { modelSlug: string };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const model = await catalogRepository.getModelBySlug(params.modelSlug);
  if (!model) return { title: "Modèle introuvable" };
  return {
    title: `${model.name} — ${model.type}`,
    description: model.description,
    openGraph: {
      title: model.name,
      description: model.description,
      images: model.images[0] ? [{ url: model.images[0].url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  let model;
  let promotions;
  let related;

  try {
    model = await catalogRepository.getModelBySlug(params.modelSlug);
    if (!model) notFound();
    [promotions, related] = await Promise.all([
      catalogRepository.listPromotions(),
      catalogRepository.listModels({ type: model.type }, "recent"),
    ]);
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger cette fiche produit pour le moment."} />
      </div>
    );
  }

  const otherModels = related.filter((m) => m.id !== model.id).slice(0, 3);

  return (
    <div>
      <div className="mx-auto max-w-[1400px] px-5 pt-6 sm:px-10">
        <nav aria-label="Fil d'Ariane" className="text-sm text-ink/50">
          <Link href="/catalogue" className="hover:text-ember">Catalogue</Link>
          <span className="mx-2">/</span>
          <span className="text-ink/70">{model.name}</span>
        </nav>
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-12 px-5 py-10 sm:px-10 lg:grid-cols-2 lg:gap-20">
        <Gallery images={model.images} productName={model.name} />

        <div>
          <p className="font-display text-lg italic text-ink/50">{model.type}</p>
          <h1 className="mt-1 font-display text-display-2 italic leading-none text-ink">{model.name}</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/60">{model.description}</p>

          <div className="mt-8 border-t border-ink/15 pt-8">
            <PurchasePanel model={model} promotions={promotions} />
          </div>
        </div>
      </div>

      {otherModels.length > 0 && (
        <section className="bg-paper">
          <div className="mx-auto max-w-[1400px] px-5 pb-24 sm:px-10">
            <p className="font-display text-lg italic text-ink/50">Autres modèles en {model.type}</p>
            <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-3">
              {otherModels.map((m) => (
                <ProductCard key={m.id} model={m} promotions={promotions ?? []} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
