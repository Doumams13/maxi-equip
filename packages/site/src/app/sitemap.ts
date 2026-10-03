import type { MetadataRoute } from "next";
import { catalogRepository } from "@/services/catalog";
import { siteConfig } from "@/config/site";

const BASE_URL = siteConfig.url;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/catalogue`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Correction "Intégration Site Phase 5, §6/§7" — bug réel corrigé :
  // sitemap.xml est généré au moment du BUILD (aucun `dynamic`/`revalidate`
  // ici). Sans ce garde-fou, une API momentanément injoignable au moment
  // précis du build ferait échouer la génération de TOUT le site (build
  // entier en échec), pas seulement du sitemap — bien pire que la simple
  // dégradation attendue pour une indisponibilité de l'API. Un sitemap
  // réduit aux pages statiques reste infiniment préférable à un
  // déploiement bloqué.
  try {
    const models = await catalogRepository.listModels({}, "recent");
    const productRoutes: MetadataRoute.Sitemap = models.map((m) => ({
      url: `${BASE_URL}/catalogue/${m.slug}`,
      lastModified: m.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
    return [...staticRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
