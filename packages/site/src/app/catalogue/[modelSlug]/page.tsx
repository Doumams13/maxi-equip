import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { catalogRepository } from "@/services/catalog";
import { Gallery } from "@/components/product/Gallery";
import { PurchasePanel } from "@/components/product/PurchasePanel";
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
    openGraph: { title: model.name, description: model.description, images: model.images[0] ? [{ url: model.images[0].url }] : undefined },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  let model;
  let promotions;

  try {
    model = await catalogRepository.getModelBySlug(params.modelSlug);
    if (!model) notFound();
    promotions = await catalogRepository.listPromotions();
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1320px] px-[18px] py-20 sm:px-7">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger cette fiche produit pour le moment."} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] px-[18px] py-7 sm:px-7 sm:pb-16">
      <p className="mb-6.5 text-[13px] text-ink-mute">
        <Link href="/catalogue" className="underline hover:text-ink">
          Catalogue
        </Link>{" "}
        / <span>{model.name}</span>
      </p>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-14">
        <Gallery images={model.images} productName={model.name} />
        <PurchasePanel model={model} promotions={promotions} />
      </div>
    </div>
  );
}
