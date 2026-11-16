import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { defaultTokens } from "@maxi-equip/design-system";
import { CatalogueAccueilScreen } from "./CatalogueAccueilScreen.js";
import { SousCategoriesScreen } from "./SousCategoriesScreen.js";
import { ProduitsScreen } from "./ProduitsScreen.js";

/**
 * Écran "Catalogue" — orchestre les 3 niveaux de navigation (fondations
 * quincaillerie, Phase 2) : accueil par catégories → sous-catégories →
 * produits (ProduitsScreen, filtré par sous-catégorie). Si on arrive ici
 * avec une cible de surbrillance (ex. depuis "Produits en stock faible"
 * sur le Tableau de bord, ou un résultat de recherche globale), on
 * saute directement sur l'écran produits SANS filtre de sous-catégorie
 * — sinon le produit visé pourrait ne jamais être atteignable derrière
 * l'accueil catégories (on ne connaît pas forcément sa sous-catégorie
 * sans un aller-retour supplémentaire, jamais fait pour ne pas retarder
 * l'ouverture).
 */
export interface CatalogueScreenProps {
  session: { userId: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}

type Vue =
  | { niveau: "accueil" }
  | { niveau: "sousCategories"; categorieId: string; categorieNom: string }
  | { niveau: "produits"; sousCategorieId: string | null; sousCategorieNom: string | null };

export function CatalogueScreen({ session, cibleSurbrillance, onSurbrillanceAppliquee }: CatalogueScreenProps) {
  const [vue, setVue] = useState<Vue>(
    cibleSurbrillance ? { niveau: "produits", sousCategorieId: null, sousCategorieNom: null } : { niveau: "accueil" }
  );
  // Cible issue d'un résultat de recherche globale (interne à cet écran,
  // indépendante de `cibleSurbrillance` qui vient du Dashboard) — même
  // mécanisme de surbrillance/défilement que ProduitsScreen connaît déjà.
  const [cibleRecherche, setCibleRecherche] = useState<string | null>(null);

  useEffect(() => {
    if (cibleSurbrillance) setVue({ niveau: "produits", sousCategorieId: null, sousCategorieNom: null });
  }, [cibleSurbrillance]);

  if (vue.niveau === "accueil") {
    return (
      <CatalogueAccueilScreen
        onOuvrirCategorie={(categorieId, categorieNom) => setVue({ niveau: "sousCategories", categorieId, categorieNom })}
        onOuvrirProduit={(_produitId, modeleId) => {
          setCibleRecherche(modeleId);
          setVue({ niveau: "produits", sousCategorieId: null, sousCategorieNom: null });
        }}
      />
    );
  }

  if (vue.niveau === "sousCategories") {
    return (
      <SousCategoriesScreen
        categorieId={vue.categorieId}
        categorieNom={vue.categorieNom}
        onRetour={() => setVue({ niveau: "accueil" })}
        onOuvrirSousCategorie={(sousCategorieId, sousCategorieNom) => setVue({ niveau: "produits", sousCategorieId, sousCategorieNom })}
      />
    );
  }

  return (
    <div>
      <div style={{ padding: "16px 28px 0" }}>
        <button
          onClick={() => setVue({ niveau: "accueil" })}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, color: defaultTokens.colors.textSoft, padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Catalogue
        </button>
      </div>
      <ProduitsScreen
        session={session}
        cibleSurbrillance={cibleSurbrillance ?? cibleRecherche}
        onSurbrillanceAppliquee={() => {
          setCibleRecherche(null);
          onSurbrillanceAppliquee();
        }}
        sousCategorieId={vue.sousCategorieId}
        sousCategorieNom={vue.sousCategorieNom}
      />
    </div>
  );
}
