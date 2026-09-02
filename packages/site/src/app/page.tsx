import { Card, Logo, defaultTokens } from "@maxi-equip/design-system";

/**
 * Page d'accueil provisoire — socle uniquement (Phase 0). Le catalogue, le
 * panier, le formulaire de demande et le bouton WhatsApp seront développés
 * en Phase 5, conformément à la Synthèse §4/§9.
 */
export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: defaultTokens.typography.body,
        background: defaultTokens.colors.bg,
        minHeight: "100vh",
        padding: 32,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Logo />
        <h1
          style={{
            fontFamily: defaultTokens.typography.display,
            fontSize: 20,
            color: defaultTokens.colors.text,
          }}
        >
          MAXI EQUIP — Socle du site vitrine (Phase 0)
        </h1>
      </div>
      <Card>
        <p style={{ color: defaultTokens.colors.textSoft }}>
          Cette page confirme que le site consomme correctement le design system partagé. Le catalogue public,
          le panier et le formulaire de demande seront développés en Phase 5.
        </p>
      </Card>
    </main>
  );
}
