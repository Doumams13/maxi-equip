import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { catalogRepository } from "@/services/catalog";
import { Gallery } from "@/components/product/Gallery";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { Badge } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";

interface ProductPageProps {
  params: { modelSlug: string };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const model = await catalogRepository.getModelBySlug(params.modelSlug);
  if (!model) {
    return { title: "Modèle introuvable" };
  }
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
    if (!model) {
      notFound();
    }
    [promotions, related] = await Promise.all([
      catalogRepository.listPromotions(),
      catalogRepository.listModels({ type: model.type }, "recent"),
    ]);
  } catch (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <ErrorState
          description={
            error instanceof Error
              ? error.message
              : "Impossible de charger cette fiche produit pour le moment."
          }
        />
      </div>
    );
  }

  const otherModels = related.filter((m) => m.id !== model.id).slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Fil d'Ariane" className="mb-6 text-sm text-ink-500">
        <Link href="/catalogue" className="hover:underline">Catalogue</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-700">{model.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery images={model.images} productName={model.name} />

        <div>
          <Badge tone="type">{model.type}</Badge>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink-800 sm:text-3xl">
            {model.name}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">{model.description}</p>

          <div className="mt-6 border-t border-ink-100 pt-6">
            <PurchasePanel model={model} promotions={promotions} />
          </div>
        </div>
      </div>

      {otherModels.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-xl font-bold text-ink-800">
            Autres modèles en {model.type}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {otherModels.map((m) => (
              <ProductCard key={m.id} model={m} promotions={promotions ?? []} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
