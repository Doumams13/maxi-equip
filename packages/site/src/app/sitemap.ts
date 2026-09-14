import type { MetadataRoute } from "next";
import { catalogRepository } from "@/services/catalog";

const BASE_URL = "https://www.maxi-equip.example";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const models = await catalogRepository.listModels({}, "recent");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/catalogue`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const productRoutes: MetadataRoute.Sitemap = models.map((m) => ({
    url: `${BASE_URL}/catalogue/${m.slug}`,
    lastModified: m.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...productRoutes];
}
