import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart/CartContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.maxi-equip.example"),
  title: {
    default: `${siteConfig.companyName} — Le carrelage qui donne le ton`,
    template: `%s — ${siteConfig.companyName}`,
  },
  description: siteConfig.description,
  openGraph: {
    title: `${siteConfig.companyName} — Le carrelage qui donne le ton`,
    description: siteConfig.description,
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-bg font-body text-ink antialiased">
        <CartProvider>
          <a
            href="#contenu-principal"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-forest focus:px-4 focus:py-2 focus:text-bg"
          >
            Aller au contenu principal
          </a>
          <Header />
          <main id="contenu-principal">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
