import { useEffect, useState } from "react";
import { defaultTokens } from "@maxi-equip/design-system";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";
import type { SousCategorie } from "../../../preload/index.js";
import { illustrationSousCategorie } from "./sousCategorieImages.js";

/**
 * Liste des sous-catégories d'une catégorie choisie — fondations
 * quincaillerie (Phase 2). Deuxième niveau de la navigation
 * "catégories → sous-catégories → produits" demandée. Même identité
 * visuelle que CatalogueAccueilScreen (cartes, palette cyclique).
 */
const PALETTE = [
  { bg: "#E8F5E9", fg: "#2E7D32" },
  { bg: "#FDECE3", fg: "#C0652E" },
  { bg: "#E3F2FD", fg: "#1565C0" },
  { bg: "#ECEFF1", fg: "#455A64" },
  { bg: "#FFF8E1", fg: "#B8860B" },
  { bg: "#F3E5F5", fg: "#7B1FA2" },
  { bg: "#FFF3E0", fg: "#D84315" },
  { bg: "#EFEBE9", fg: "#5D4037" },
  { bg: "#FBE9E7", fg: "#BF360C" },
  { bg: "#E0F2F1", fg: "#00695C" },
];

export interface SousCategoriesScreenProps {
  categorieId: string;
  categorieNom: string;
  onRetour: () => void;
  onOuvrirSousCategorie: (sousCategorieId: string, sousCategorieNom: string) => void;
}

export function SousCategoriesScreen({ categorieId, categorieNom, onRetour, onOuvrirSousCategorie }: SousCategoriesScreenProps) {
  const [sousCategories, setSousCategories] = useState<SousCategorie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sousCategorieSurvolee, setSousCategorieSurvolee] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setLoading(true);
    void window.maxiEquip.listerSousCategories(categorieId).then((liste) => {
      if (annule) return;
      setSousCategories([...liste].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom)));
      setLoading(false);
    });
    return () => {
      annule = true;
    };
  }, [categorieId]);

  return (
    <div style={{ padding: 28 }}>
      <button
        onClick={onRetour}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: 600, color: defaultTokens.colors.textSoft, padding: 0, marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} />
        Catalogue
      </button>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: "0 0 18px" }}>{categorieNom}</h1>

      {loading ? (
        <p style={{ fontSize: 13.5, color: defaultTokens.colors.textFaint }}>Chargement…</p>
      ) : sousCategories.length === 0 ? (
        <p style={{ fontSize: 13.5, color: defaultTokens.colors.textFaint }}>
          Aucune sous-catégorie dans "{categorieNom}" — utilise "Gérer les catégories" depuis l'accueil du catalogue pour en créer une.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {sousCategories.map((sc, i) => {
            const couleur = PALETTE[i % PALETTE.length]!;
            const illustration = illustrationSousCategorie(categorieNom, sc.nom);
            return (
              <div
                key={sc.id}
                onClick={() => onOuvrirSousCategorie(sc.id, sc.nom)}
                onMouseEnter={() => setSousCategorieSurvolee(sc.id)}
                onMouseLeave={() => setSousCategorieSurvolee(null)}
                style={{ position: "relative", borderRadius: defaultTokens.radius.md, background: couleur.bg, padding: 14, minHeight: 150, cursor: "pointer", display: "flex", flexDirection: "column" }}
              >
                <div style={{ fontFamily: defaultTokens.typography.display, fontSize: 14, fontWeight: 700, color: couleur.fg, lineHeight: 1.25 }}>{sc.nom}</div>
                <div style={{ fontSize: 12.5, color: couleur.fg, opacity: 0.75, marginTop: 2 }}>{sc.nombreProduits} produit{sc.nombreProduits !== 1 ? "s" : ""}</div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, margin: "6px 0", height: 96, overflow: "hidden", borderRadius: defaultTokens.radius.sm }}>
                  {illustration ? (
                    <img
                      src={illustration}
                      alt={sc.nom}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: sousCategorieSurvolee === sc.id ? "scale(1.12)" : "scale(1)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  ) : (
                    <Package size={32} color={couleur.fg} opacity={0.3} />
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onOuvrirSousCategorie(sc.id, sc.nom); }}
                  style={{
                    position: "absolute", right: 14, bottom: 14, width: 30, height: 30, borderRadius: "50%", border: "none",
                    background: defaultTokens.colors.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                  }}
                  aria-label={`Ouvrir ${sc.nom}`}
                >
                  <ArrowRight size={13} color={couleur.fg} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
