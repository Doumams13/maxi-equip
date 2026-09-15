import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart/CartContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppFloatingButton } from "@/components/layout/WhatsAppFloatingButton";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.maxi-equip.example"),
  title: {
    default: `${siteConfig.companyName} — Vente de carreaux à Libreville`,
    template: `%s — ${siteConfig.companyName}`,
  },
  description: siteConfig.description,
  openGraph: {
    title: `${siteConfig.companyName} — Vente de carreaux à Libreville`,
    description: siteConfig.description,
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col bg-stone-50 font-body text-stone-900 antialiased">
        <CartProvider>
          <a
            href="#contenu-principal"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-pine-700 focus:px-4 focus:py-2 focus:text-stone-50"
          >
            Aller au contenu principal
          </a>
          <Header />
          <main id="contenu-principal" className="flex-1">
            {children}
          </main>
          <Footer />
          <WhatsAppFloatingButton />
        </CartProvider>
      </body>
    </html>
  );
}
