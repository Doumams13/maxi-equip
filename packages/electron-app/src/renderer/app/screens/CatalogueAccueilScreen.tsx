import { useEffect, useMemo, useState } from "react";
import { defaultTokens, useToast } from "@maxi-equip/design-system";
import { Search, ArrowRight, Package, Grid3x3, List } from "lucide-react";

import accessoiresPose from "../assets/categories/accessoires_pose.png";
import boisMenuiserie from "../assets/categories/bois_menuiserie.png";
import carrelageRevetements from "../assets/categories/carrelage_revetements.png";
import chimieBatiment from "../assets/categories/chimie_batiment.png";
import climatisationVentilation from "../assets/categories/climatisation_ventilation.png";
import couvertureToiture from "../assets/categories/couverture_toiture.png";
import divers from "../assets/categories/divers.png";
import eclairage from "../assets/categories/eclairage.png";
import electricite from "../assets/categories/electricite.png";
import equipementsProtection from "../assets/categories/equipements_protection.png";
import etancheiteIsolation from "../assets/categories/etancheite_isolation.png";
import jardinageExterieur from "../assets/categories/jardinage_exterieur.png";
import materiauxConstruction from "../assets/categories/materiaux_construction.png";
import outillageElectrique from "../assets/categories/outillage_electrique.png";
import outillageManuel from "../assets/categories/outillage_manuel.png";
import peintureDecoration from "../assets/categories/peinture_decoration.png";
import plomberieEvacuation from "../assets/categories/plomberie_evacuation.png";
import portesFenetres from "../assets/categories/portes_fenetres.png";
import sanitairesToilettes from "../assets/categories/sanitaires_toilettes.png";
import visserieFixation from "../assets/categories/visserie_fixation.png";

/**
 * Accueil du Catalogue — demande du 2026-11-14 : reprendre l'apparence de
 * la page d'accueil catégories de la version test (CatalogueAccueil.tsx,
 * D:\Devellopement\Test\maxi-equip), avec UNE seule carte réellement
 * branchée ("Carrelage et revêtements" → l'écran Carreaux existant,
 * inchangé, voir CatalogueScreen.tsx). Les 19 autres cartes n'ont encore
 * aucun écran réel derrière (voir le rapport de faisabilité du
 * 2026-10-21) — décision explicite : jamais de faux nombre de produits
 * pour ne pas laisser croire à du vrai stock, et un message "Bientôt
 * disponible" plutôt qu'une navigation ou un silence qui ressemblerait à
 * un bug. La barre de recherche est volontairement décorative pour
 * l'instant (pas de backend de recherche catégories/produits ici).
 */
const NOM_CARRELAGE = "Carrelage et revêtements";

const CATEGORIES: { nom: string; image: string }[] = [
  { nom: NOM_CARRELAGE, image: carrelageRevetements },
  { nom: "Matériaux de construction", image: materiauxConstruction },
  { nom: "Sanitaires et toilettes", image: sanitairesToilettes },
  { nom: "Plomberie et évacuation", image: plomberieEvacuation },
  { nom: "Électricité", image: electricite },
  { nom: "Éclairage", image: eclairage },
  { nom: "Peinture et décoration", image: peintureDecoration },
  { nom: "Bois et menuiserie", image: boisMenuiserie },
  { nom: "Couverture et toiture", image: couvertureToiture },
  { nom: "Visserie et fixation", image: visserieFixation },
  { nom: "Outillage manuel", image: outillageManuel },
  { nom: "Outillage électrique", image: outillageElectrique },
  { nom: "Accessoires de pose", image: accessoiresPose },
  { nom: "Étanchéité et isolation", image: etancheiteIsolation },
  { nom: "Équipements de protection", image: equipementsProtection },
  { nom: "Jardinage et espaces extérieurs", image: jardinageExterieur },
  { nom: "Portes et fenêtres", image: portesFenetres },
  { nom: "Chimie du bâtiment", image: chimieBatiment },
  { nom: "Climatisation et ventilation", image: climatisationVentilation },
  { nom: "Divers", image: divers },
];

/** Palette cyclique — même principe que la version test : une rotation déterministe par position, jamais une couleur figée par nom de catégorie. */
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

export interface CatalogueAccueilScreenProps {
  onOuvrirCarrelage: () => void;
}

export function CatalogueAccueilScreen({ onOuvrirCarrelage }: CatalogueAccueilScreenProps) {
  const { showInfo } = useToast();
  const [vue, setVue] = useState<"grille" | "liste">("grille");
  const [nombreCarreaux, setNombreCarreaux] = useState<number | null>(null);

  useEffect(() => {
    let annule = false;
    void window.maxiEquip.listModelesProduits().then((modeles) => {
      if (annule) return;
      const total = modeles.reduce((somme, m) => somme + m.variantes.length, 0);
      setNombreCarreaux(total);
    });
    return () => {
      annule = true;
    };
  }, []);

  const categories = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        nombreProduits: c.nom === NOM_CARRELAGE ? nombreCarreaux : null,
        implementee: c.nom === NOM_CARRELAGE,
      })),
    [nombreCarreaux]
  );

  function handleOuvrirCategorie(categorie: (typeof categories)[number]) {
    if (categorie.implementee) {
      onOuvrirCarrelage();
    } else {
      showInfo("Bientôt disponible", `"${categorie.nom}" n'est pas encore activé dans le catalogue.`);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 24, color: defaultTokens.colors.text, margin: 0 }}>Catalogue des produits</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>Recherchez une catégorie ou un produit pour commencer</p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 40px",
              borderRadius: defaultTokens.radius.sm,
              border: `1px solid ${defaultTokens.colors.border}`,
              fontFamily: defaultTokens.typography.body,
              fontSize: 14,
            }}
            placeholder="Rechercher une catégorie, un produit... (ex : Tuyau, Ciment, Peinture, Vis, ...)"
            disabled
            title="Recherche à venir"
          />
        </div>
        <div style={{ display: "flex", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.border}`, overflow: "hidden" }}>
          <button
            onClick={() => setVue("grille")}
            style={{ padding: "0 12px", border: "none", cursor: "pointer", background: vue === "grille" ? defaultTokens.colors.accent : defaultTokens.colors.surface, color: vue === "grille" ? "#fff" : defaultTokens.colors.textSoft }}
            aria-label="Vue grille"
          >
            <Grid3x3 size={16} />
          </button>
          <button
            onClick={() => setVue("liste")}
            style={{ padding: "0 12px", border: "none", cursor: "pointer", background: vue === "liste" ? defaultTokens.colors.accent : defaultTokens.colors.surface, color: vue === "liste" ? "#fff" : defaultTokens.colors.textSoft }}
            aria-label="Vue liste"
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {vue === "grille" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {categories.map((c, i) => {
            const couleur = PALETTE[i % PALETTE.length]!;
            return (
              <div
                key={c.nom}
                onClick={() => handleOuvrirCategorie(c)}
                style={{ position: "relative", borderRadius: defaultTokens.radius.md, background: couleur.bg, padding: 18, minHeight: 170, cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontFamily: defaultTokens.typography.display, fontSize: 16, fontWeight: 700, color: couleur.fg, lineHeight: 1.25 }}>{c.nom}</div>
                  {c.nombreProduits !== null && (
                    <div style={{ fontSize: 12.5, color: couleur.fg, opacity: 0.75, marginTop: 4 }}>
                      {c.nombreProduits} produit{c.nombreProduits !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, margin: "10px 0" }}>
                  <img src={c.image} alt={c.nom} style={{ maxHeight: 76, maxWidth: "100%", objectFit: "contain" }} />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleOuvrirCategorie(c); }}
                  style={{
                    position: "absolute", right: 14, bottom: 14, width: 32, height: 32, borderRadius: "50%", border: "none",
                    background: defaultTokens.colors.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                  }}
                  aria-label={`Ouvrir ${c.nom}`}
                >
                  <ArrowRight size={14} color={couleur.fg} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categories.map((c, i) => {
            const couleur = PALETTE[i % PALETTE.length]!;
            return (
              <div
                key={c.nom}
                onClick={() => handleOuvrirCategorie(c)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.borderSoft}`, cursor: "pointer" }}
              >
                <div style={{ width: 44, height: 44, borderRadius: defaultTokens.radius.sm, background: couleur.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <img src={c.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: defaultTokens.radius.sm }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nom}</div>
                  {c.nombreProduits !== null && (
                    <div style={{ fontSize: 12, color: defaultTokens.colors.textFaint }}>
                      {c.nombreProduits} produit{c.nombreProduits !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <Package size={16} color={defaultTokens.colors.textFaint} />
                <ArrowRight size={16} color={defaultTokens.colors.textFaint} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
