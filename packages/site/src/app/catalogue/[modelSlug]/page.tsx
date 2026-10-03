import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { catalogRepository } from "@/services/catalog";
import { Gallery } from "@/components/product/Gallery";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { ErrorState } from "@/components/ui/states";
import { siteConfig } from "@/config/site";
import { getEffectiveContactInfo } from "@/services/settings";
import type { ProductModel, Promotion } from "@/lib/types/catalog";

interface ProductPageProps {
  params: { modelSlug: string };
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const model = await catalogRepository.getModelBySlug(params.modelSlug);
  // Modèle introuvable : ni canonique ni indexation — la page rendra un
  // vrai 404 (notFound(), voir plus bas), jamais présentée aux moteurs
  // de recherche comme une fiche produit valide.
  if (!model) return { title: "Modèle introuvable", robots: { index: false, follow: false } };

  const titre = `${model.name} — ${model.type}`;
  const image = [...model.images].sort((a, b) => a.order - b.order)[0];

  return {
    title: titre,
    description: model.description,
    alternates: { canonical: `/catalogue/${model.slug}` },
    openGraph: {
      title: model.name,
      description: model.description,
      images: image ? [{ url: image.url, alt: image.alt }] : undefined,
    },
    twitter: {
      title: model.name,
      description: model.description,
      images: image ? [image.url] : undefined,
    },
  };
}

/**
 * Données structurées (Phase SEO) — Product (avec fourchette de prix
 * réelle, aucune disponibilité/stock inventée, jamais transmise au site
 * public — cf. types/catalog.ts) et BreadcrumbList (reflète exactement
 * le fil d'Ariane déjà visible juste en dessous, jamais une hiérarchie
 * inventée).
 */
function jsonLdProduit(model: ProductModel, nomEntreprise: string) {
  const image = [...model.images].sort((a, b) => a.order - b.order)[0];
  const prix = model.variants.map((v) => v.priceFcfa);
  const url = `${siteConfig.url}/catalogue/${model.slug}`;

  const produit: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: model.name,
    description: model.description,
    url,
    ...(image ? { image: image.url.startsWith("http") ? image.url : `${siteConfig.url}${image.url}` } : {}),
    category: model.type,
    brand: { "@type": "Brand", name: nomEntreprise },
  };

  if (prix.length > 0) {
    produit["offers"] = {
      "@type": "AggregateOffer",
      priceCurrency: "XAF",
      lowPrice: Math.min(...prix),
      highPrice: Math.max(...prix),
      offerCount: prix.length,
      url,
    };
  }

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "Catalogue", item: `${siteConfig.url}/catalogue` },
      { "@type": "ListItem", position: 3, name: model.name, item: url },
    ],
  };

  return [produit, breadcrumb];
}

export default async function ProductPage({ params }: ProductPageProps) {
  let model: ProductModel | null;
  let promotions: Promotion[] = [];

  // Correction (Phase SEO, §10 "erreurs 404 évidentes") — bug réel
  // identifié : Next.js interdit explicitement d'appeler `notFound()`
  // depuis l'intérieur d'un `try/catch` (et le relancer depuis le
  // `catch` après l'avoir intercepté ne fonctionne pas non plus — la
  // signal spécial de Next.js n'est alors plus reconnu). Avec l'ancien
  // code, `notFound()` était appelé À L'INTÉRIEUR du `try`, capturé par
  // le `catch` comme une erreur ordinaire : la page affichait
  // "NEXT_NOT_FOUND" comme message d'erreur générique ET répondait 200
  // au lieu de 404 (mauvais pour l'indexation : un modèle inexistant
  // semblait être une page valide). Corrigé en ne laissant plus JAMAIS
  // `notFound()` s'exécuter à l'intérieur du `try` — le `catch` continue
  // de gérer exactement les mêmes erreurs qu'avant (API injoignable...).
  try {
    model = await catalogRepository.getModelBySlug(params.modelSlug);
    if (model) {
      promotions = await catalogRepository.listPromotions();
    }
  } catch (error) {
    return (
      <div className="mx-auto max-w-[1320px] px-[18px] py-20 sm:px-7">
        <ErrorState description={error instanceof Error ? error.message : "Impossible de charger cette fiche produit pour le moment."} />
      </div>
    );
  }

  if (!model) notFound();

  const contact = await getEffectiveContactInfo();

  return (
    <div className="mx-auto max-w-[1320px] px-[18px] py-7 sm:px-7 sm:pb-16">
      {jsonLdProduit(model, contact.nom).map((bloc, i) => (
        // eslint-disable-next-line react/no-danger
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bloc) }} />
      ))}

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
