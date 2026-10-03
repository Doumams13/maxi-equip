import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart/CartContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFloatingButton } from "@/components/layout/WhatsAppFloatingButton";
import { siteConfig } from "@/config/site";
import { getEffectiveContactInfo } from "@/services/settings";

/** Image de partage par défaut (réseaux sociaux) — photo réelle déjà utilisée sur la page Contact, jamais une image inventée pour l'occasion. */
const IMAGE_PARTAGE_DEFAUT = "/images/contact/showroom.png";

/**
 * BUG CORRIGÉ ("Nom du magasin jamais utilisé sur le site") : `metadata`
 * était un export STATIQUE (calculé une seule fois à la compilation),
 * donc ne pouvait structurellement jamais refléter le nom configuré dans
 * l'écran Paramètres de l'application. Converti en `generateMetadata()`
 * (API Next.js dédiée), qui s'exécute à la requête et peut donc appeler
 * `getEffectiveContactInfo()` — même source que Footer/Header ci-dessous,
 * jamais une seconde logique de repli réinventée ici.
 */
export async function generateMetadata(): Promise<Metadata> {
  const contact = await getEffectiveContactInfo();
  const titreParDefaut = `${contact.nom} — Le carrelage qui donne le ton`;
  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: titreParDefaut,
      template: `%s — ${contact.nom}`,
    },
    description: siteConfig.description,
    openGraph: {
      title: titreParDefaut,
      description: siteConfig.description,
      url: siteConfig.url,
      siteName: contact.nom,
      locale: "fr_FR",
      type: "website",
      images: [{ url: IMAGE_PARTAGE_DEFAUT }],
    },
    twitter: {
      card: "summary_large_image",
      title: titreParDefaut,
      description: siteConfig.description,
      images: [IMAGE_PARTAGE_DEFAUT],
    },
  };
}

/**
 * Données structurées JSON-LD — LocalBusiness (Phase SEO). Rendues sur
 * TOUTES les pages via le layout racine (pratique standard, Google
 * dédoublonne automatiquement par page). Uniquement des informations déjà
 * validées dans `siteConfig` (cahier des charges, en-tête/facture
 * officiels) — jamais d'horaires, d'avis, de note ou de stock inventés
 * (aucune donnée de ce type n'est disponible ici de façon fiable).
 */
function jsonLdOrganisation(nom: string) {
  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: nom,
    legalName: siteConfig.legalName,
    description: siteConfig.description,
    url: siteConfig.url,
    telephone: siteConfig.contact.phoneDisplay,
    email: siteConfig.contact.email,
    image: `${siteConfig.url}${IMAGE_PARTAGE_DEFAUT}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Libreville",
      addressCountry: "GA",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const contact = await getEffectiveContactInfo();
  return (
    <html lang="fr">
      <body className="bg-bg font-body text-ink antialiased">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganisation(contact.nom)) }}
        />
        <CartProvider>
          <a
            href="#contenu-principal"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-forest focus:px-4 focus:py-2 focus:text-bg"
          >
            Aller au contenu principal
          </a>
          <Header nom={contact.nom} />
          <main id="contenu-principal">{children}</main>
          <Footer />
          <WhatsAppFloatingButton />
        </CartProvider>
      </body>
    </html>
  );
}
