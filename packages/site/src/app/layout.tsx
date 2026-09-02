import type { ReactNode } from "react";

export const metadata = {
  title: "MAXI EQUIP — Carrelages à Libreville",
  description: "Catalogue de carrelages MAXI EQUIP — Libreville, Gabon.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
