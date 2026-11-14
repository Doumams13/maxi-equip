import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { defaultTokens } from "@maxi-equip/design-system";
import { CatalogueAccueilScreen } from "./CatalogueAccueilScreen.js";
import { ProduitsScreen } from "./ProduitsScreen.js";

/**
 * Écran "Catalogue" — bascule entre l'accueil par catégories (visuel,
 * demande du 2026-11-14) et l'écran Carreaux existant, strictement
 * inchangé (voir ProduitsScreen.tsx). Si on arrive ici avec une cible de
 * surbrillance (ex. depuis "Produits en stock faible" sur le Tableau de
 * bord), on saute directement sur l'écran Carreaux — sinon le produit
 * visé ne serait jamais atteignable derrière l'accueil catégories.
 */
export interface CatalogueScreenProps {
  session: { userId: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}

export function CatalogueScreen({ session, cibleSurbrillance, onSurbrillanceAppliquee }: CatalogueScreenProps) {
  const [vue, setVue] = useState<"accueil" | "carreaux">(cibleSurbrillance ? "carreaux" : "accueil");

  useEffect(() => {
    if (cibleSurbrillance) setVue("carreaux");
  }, [cibleSurbrillance]);

  if (vue === "accueil") {
    return <CatalogueAccueilScreen onOuvrirCarrelage={() => setVue("carreaux")} />;
  }

  return (
    <div>
      <div style={{ padding: "16px 28px 0" }}>
        <button
          onClick={() => setVue("accueil")}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, color: defaultTokens.colors.textSoft, padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Catalogue
        </button>
      </div>
      <ProduitsScreen session={session} cibleSurbrillance={cibleSurbrillance} onSurbrillanceAppliquee={onSurbrillanceAppliquee} />
    </div>
  );
}
