import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panier", "/demande", "/confirmation"],
    },
    sitemap: "https://www.maxi-equip.example/sitemap.xml",
  };
}
