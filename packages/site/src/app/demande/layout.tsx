import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Demande de commande",
  robots: { index: false, follow: true },
};

export default function DemandeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
