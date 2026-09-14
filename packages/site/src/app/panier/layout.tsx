import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panier",
  robots: { index: false, follow: true },
};

export default function PanierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
