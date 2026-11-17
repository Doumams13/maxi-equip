import { useEffect, useMemo, useState } from "react";
import { Button, defaultTokens, useToast } from "@maxi-equip/design-system";
import { Search, X, ArrowRight, Package, Grid3x3, List } from "lucide-react";
import type { Categorie, RechercheGlobaleResultat } from "../../../preload/index.js";
import { CategoriesModal } from "./CategoriesModal.js";
import { CATEGORIES_INITIALES, illustrationCategorie, normaliserNomCategorie } from "./catalogueImages.js";

/**
 * Accueil du Catalogue — fondations quincaillerie (Phase 2). Remplace la
 * façade visuelle du 2026-11-14 (20 catégories codées en dur, une seule
 * carte branchée, recherche décorative) par le véritable système :
 * catégories chargées depuis SQLite (CategorieRepository), compteurs de
 * produits réels, recherche globale fonctionnelle, gestion des
 * catégories/sous-catégories (CategoriesModal.tsx).
 *
 * Correction "retrouver les 20 catégories visuelles de la 0.11.1"
 * (2026-11-15) : les 20 catégories de cette version (voir
 * CATEGORIES_INITIALES) sont TOUJOURS affichées, fusionnées par nom avec
 * les catégories réellement présentes en base — jamais créées en base
 * pour autant (voir `cartes` ci-dessous). Une catégorie réelle dont le
 * nom ne correspond à aucune des 20 (ex. "Divers", ou toute catégorie
 * ajoutée librement par l'utilisateur) reste affichée et fonctionnelle,
 * ajoutée après les 20 initiales.
 */

/**
 * Une carte de l'accueil Catalogue : soit une catégorie réelle
 * (fonctionnelle, cliquable, compteur réel), soit une des 20 catégories
 * initiales qui n'a pas encore de catégorie correspondante en base
 * (illustration affichée, mais "à configurer" — jamais de compteur
 * fictif, jamais de navigation vers des produits qui n'existent pas).
 */
type CarteCatalogue =
  | { statut: "reelle"; id: string; nom: string; nombreProduits: number; illustration: string | null }
  | { statut: "aConfigurer"; nom: string; illustration: string };

/** Palette cyclique — jamais une couleur figée par nom de catégorie (une catégorie créée par l'utilisateur n'a pas de couleur "connue" à l'avance), simplement une rotation déterministe par position. */
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
  onOuvrirCategorie: (categorieId: string, categorieNom: string) => void;
  onOuvrirProduit: (produitId: string, modeleId: string | null) => void;
}

export function CatalogueAccueilScreen({ onOuvrirCategorie, onOuvrirProduit }: CatalogueAccueilScreenProps) {
  const { showInfo } = useToast();
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [loading, setLoading] = useState(true);
  const [vue, setVue] = useState<"grille" | "liste">("grille");
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<RechercheGlobaleResultat | null>(null);
  const [recherchant, setRecherchant] = useState(false);
  const [categorieSurvolee, setCategorieSurvolee] = useState<string | null>(null);

  async function recharger() {
    const cats = await window.maxiEquip.listerCategories();
    setCategories(cats);
    setLoading(false);
  }

  useEffect(() => {
    void recharger();
  }, []);

  /**
   * Fusionne les 20 catégories initiales (toujours affichées) avec les
   * catégories réelles de la base (par nom, insensible à la casse) —
   * jamais l'inverse : on ne crée jamais ici de catégorie en base, on
   * fusionne seulement l'affichage. Une catégorie réelle consommée par
   * une correspondance initiale n'apparaît pas une seconde fois dans les
   * "supplémentaires".
   *
   * CORRECTION (incident réel, 2026-11-17) : deux postes démarrant la
   * 0.12.0 à quelques minutes d'intervalle ont chacun créé localement
   * leur propre jeu des 20 catégories prédéfinies (UUID différent par
   * poste, jamais réconcilié par la synchronisation qui travaille par
   * identifiant, jamais par nom) — la base contenait alors DEUX
   * catégories réelles nommées "Carrelage et revêtements", chacune avec
   * son propre "Carreaux". L'ancienne implémentation indexait les
   * catégories réelles par nom dans une simple `Map` : la seconde
   * catégorie du même nom écrasait silencieusement la première dans
   * cette `Map`, qui disparaissait alors totalement de l'affichage —
   * sans erreur, sans compteur à zéro, juste absente — alors que ses
   * produits restaient parfaitement intacts en base (toujours vendables,
   * invisibles seulement ici). Une catégorie réelle ne doit donc plus
   * jamais être perdue en cas de doublon de nom : toutes les catégories
   * partageant un même nom sont désormais regroupées, celle avec le plus
   * de produits occupe la case "initiale" correspondante, et toute
   * catégorie supplémentaire du même nom (doublon vide ou non) reste
   * affichée parmi les "supplémentaires", jamais silencieusement perdue.
   */
  const cartes = useMemo<CarteCatalogue[]>(() => {
    const parNom = new Map<string, Categorie[]>();
    for (const c of categories) {
      const cle = normaliserNomCategorie(c.nom);
      const groupe = parNom.get(cle);
      if (groupe) groupe.push(c);
      else parNom.set(cle, [c]);
    }

    const initiales: CarteCatalogue[] = CATEGORIES_INITIALES.map((init) => {
      const cle = normaliserNomCategorie(init.nom);
      const groupe = parNom.get(cle);
      if (groupe && groupe.length > 0) {
        groupe.sort((a, b) => b.nombreProduits - a.nombreProduits);
        const reelle = groupe.shift()!;
        if (groupe.length === 0) parNom.delete(cle);
        return { statut: "reelle", id: reelle.id, nom: reelle.nom, nombreProduits: reelle.nombreProduits, illustration: illustrationCategorie(reelle) };
      }
      return { statut: "aConfigurer", nom: init.nom, illustration: init.image };
    });
    const supplementaires: CarteCatalogue[] = [...parNom.values()]
      .flat()
      .sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom))
      .map((c) => ({ statut: "reelle", id: c.id, nom: c.nom, nombreProduits: c.nombreProduits, illustration: illustrationCategorie(c) }));
    return [...initiales, ...supplementaires];
  }, [categories]);

  function handleOuvrirCarte(carte: CarteCatalogue) {
    if (carte.statut === "reelle") {
      onOuvrirCategorie(carte.id, carte.nom);
    } else {
      showInfo("Bientôt disponible", `"${carte.nom}" n'est pas encore configurée — crée-la depuis "Gérer les catégories" pour l'activer.`);
    }
  }

  async function lancerRecherche(terme: string) {
    setRecherche(terme);
    const t = terme.trim();
    if (!t) {
      setResultats(null);
      return;
    }
    setRecherchant(true);
    try {
      const r = await window.maxiEquip.rechercherGlobalCatalogue(t);
      setResultats(r);
    } finally {
      setRecherchant(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 24, color: defaultTokens.colors.text, margin: 0 }}>Catalogue des produits</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>Recherchez une catégorie ou un produit pour commencer</p>
        </div>
        <Button variant="secondary" onClick={() => setShowCategoriesModal(true)}>
          Gérer les catégories
        </Button>
      </div>

      <div style={{ position: "relative", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input
              style={{
                width: "100%", boxSizing: "border-box", padding: "12px 40px", borderRadius: defaultTokens.radius.sm,
                border: `1px solid ${defaultTokens.colors.border}`, fontFamily: defaultTokens.typography.body, fontSize: 14,
              }}
              value={recherche}
              onChange={(e) => void lancerRecherche(e.target.value)}
              placeholder="Rechercher une catégorie, un produit... (ex : Tuyau, Ciment, Peinture, Vis, ...)"
            />
            {recherche && (
              <button
                onClick={() => void lancerRecherche("")}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}
                aria-label="Effacer"
              >
                <X size={15} color={defaultTokens.colors.textFaint} />
              </button>
            )}
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

        {recherche.trim() && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20,
              background: defaultTokens.colors.surface, border: `1px solid ${defaultTokens.colors.border}`, borderRadius: defaultTokens.radius.md,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 14, maxHeight: 360, overflowY: "auto",
            }}
          >
            {recherchant ? (
              <p style={{ fontSize: 13, color: defaultTokens.colors.textSoft, margin: 0 }}>Recherche…</p>
            ) : !resultats || (resultats.categories.length === 0 && resultats.produits.length === 0) ? (
              <p style={{ fontSize: 13, color: defaultTokens.colors.textFaint, margin: 0 }}>Aucun résultat pour "{recherche}".</p>
            ) : (
              <>
                {resultats.categories.length > 0 && (
                  <div style={{ marginBottom: resultats.produits.length > 0 ? 12 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
                      Catégories ({resultats.categories.length})
                    </div>
                    {resultats.categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setRecherche(""); setResultats(null); onOuvrirCategorie(c.id, c.nom); }}
                        style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 8, padding: "8px 6px", border: "none", background: "none", cursor: "pointer", borderRadius: defaultTokens.radius.sm }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.nom}</span>
                        <ArrowRight size={13} color={defaultTokens.colors.textFaint} style={{ marginLeft: "auto" }} />
                      </button>
                    ))}
                  </div>
                )}
                {resultats.produits.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
                      Produits ({resultats.produits.length})
                    </div>
                    {resultats.produits.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setRecherche(""); setResultats(null); onOuvrirProduit(p.id, p.modeleId); }}
                        style={{ display: "flex", width: "100%", textAlign: "left", alignItems: "center", gap: 8, padding: "8px 6px", border: "none", background: "none", cursor: "pointer", borderRadius: defaultTokens.radius.sm }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.motif}</span>
                        <span style={{ fontSize: 12, color: defaultTokens.colors.textFaint }}>{p.reference} · {p.taille}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 13.5, color: defaultTokens.colors.textFaint }}>Chargement…</p>
      ) : vue === "grille" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {cartes.map((c, i) => {
            const couleur = PALETTE[i % PALETTE.length]!;
            const aConfigurer = c.statut === "aConfigurer";
            const cleCarte = aConfigurer ? `init:${c.nom}` : c.id;
            return (
              <div
                key={cleCarte}
                onClick={() => handleOuvrirCarte(c)}
                onMouseEnter={() => setCategorieSurvolee(cleCarte)}
                onMouseLeave={() => setCategorieSurvolee(null)}
                style={{
                  position: "relative", borderRadius: defaultTokens.radius.md, background: couleur.bg, padding: 18, minHeight: 170,
                  cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: aConfigurer ? 0.6 : 1,
                }}
              >
                <div>
                  <div style={{ fontFamily: defaultTokens.typography.display, fontSize: 16, fontWeight: 700, color: couleur.fg, lineHeight: 1.25 }}>{c.nom}</div>
                  <div style={{ fontSize: 12.5, color: couleur.fg, opacity: 0.75, marginTop: 4 }}>
                    {aConfigurer ? "À configurer" : `${c.nombreProduits} produit${c.nombreProduits !== 1 ? "s" : ""}`}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, margin: "10px 0", overflow: "hidden", borderRadius: defaultTokens.radius.sm }}>
                  {c.illustration ? (
                    <img
                      src={c.illustration}
                      alt={c.nom}
                      style={{
                        maxHeight: 76,
                        maxWidth: "100%",
                        objectFit: "contain",
                        transform: categorieSurvolee === cleCarte ? "scale(1.12)" : "scale(1)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  ) : (
                    <Package size={40} color={couleur.fg} opacity={0.35} />
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleOuvrirCarte(c); }}
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
          {cartes.map((c, i) => {
            const couleur = PALETTE[i % PALETTE.length]!;
            const aConfigurer = c.statut === "aConfigurer";
            const cleCarte = aConfigurer ? `init:${c.nom}` : c.id;
            return (
              <div
                key={cleCarte}
                onClick={() => handleOuvrirCarte(c)}
                onMouseEnter={() => setCategorieSurvolee(cleCarte)}
                onMouseLeave={() => setCategorieSurvolee(null)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.borderSoft}`, cursor: "pointer", opacity: aConfigurer ? 0.6 : 1 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: defaultTokens.radius.sm, background: couleur.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                  {c.illustration ? (
                    <img
                      src={c.illustration}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: categorieSurvolee === cleCarte ? "scale(1.12)" : "scale(1)",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  ) : (
                    <Package size={20} color={couleur.fg} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.nom}</div>
                  <div style={{ fontSize: 12, color: defaultTokens.colors.textFaint }}>
                    {aConfigurer ? "À configurer" : `${c.nombreProduits} produit${c.nombreProduits !== 1 ? "s" : ""}`}
                  </div>
                </div>
                <ArrowRight size={16} color={defaultTokens.colors.textFaint} />
              </div>
            );
          })}
        </div>
      )}

      {showCategoriesModal && (
        <CategoriesModal
          onClose={() => setShowCategoriesModal(false)}
          onSaved={() => void recharger()}
        />
      )}
    </div>
  );
}
