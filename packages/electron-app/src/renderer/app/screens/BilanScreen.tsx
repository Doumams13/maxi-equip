import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { FileDown, Calendar } from "lucide-react";
import { PdfPreviewModal } from "../components/PdfPreviewModal.js";
import { formaterVentilationUnites, LIBELLE_UNITE_VENTE, type UniteVente } from "@maxi-equip/shared-types";
import type { Categorie, SousCategorie } from "../../../preload/index.js";

type Preset = "jour" | "semaine" | "mois" | "personnalise";

interface VentilationUnite {
  unite: UniteVente;
  quantite: number;
}

interface BilanDetailProduit {
  produitId: string;
  taille: string;
  reference: string;
  designation: string;
  categorieNom: string;
  sousCategorieNom: string;
  estCarreau: boolean;
  uniteVente: UniteVente;
  carreauxParCarton: number | null;
  stockParEmplacement: { emplacementId: string; cartons: number }[];
  vendu: number;
  sortie: number;
}

interface BilanDonnees {
  /** Libellé du filtre actif, `null` = toutes catégories. */
  filtre: string | null;
  /** `remiseTotale` à `null` sous filtre : une remise porte sur la facture entière, jamais attribuable à une catégorie. */
  ventes: { caTotal: number; nombreFactures: number; remiseTotale: number | null };
  ventesParCategorie: { categorieId: string | null; categorieNom: string; chiffreAffaires: number; quantites: VentilationUnite[]; part: number }[];
  topProduits: { label: string; quantite: number }[];
  /** Fondations quincaillerie (Phase 4) — ventilé par unité, jamais un total unique mélangeant des unités différentes. */
  mouvements: { entrees: VentilationUnite[]; sorties: VentilationUnite[] };
  stockParEmplacement: { emplacementId: string; nom: string; parUnite: VentilationUnite[] }[];
  produitsSousSeuilCount: number;
  promotionsActivesPendantPeriode: number;
  depots: { id: string; nom: string }[];
  detailProduits: BilanDetailProduit[];
}

function formaterDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateLocaleVersISO(dateYMD: string, finDeJournee: boolean): string {
  return new Date(`${dateYMD}T${finDeJournee ? "23:59:59.999" : "00:00:00.000"}`).toISOString();
}

function auJourdhuiYMD(): string {
  return new Date().toLocaleDateString("sv-SE"); // format YYYY-MM-DD stable, indépendant de la locale d'affichage
}

/**
 * Bornes [début, fin] (en yyyy-mm-dd, jours locaux inclusifs) pour un
 * préréglage de période — "Cette semaine" commence le lundi, "Ce mois-ci"
 * le 1er du mois en cours, tous deux jusqu'à aujourd'hui inclus.
 */
function bornesPreset(preset: Exclude<Preset, "personnalise">): { debut: string; fin: string } {
  const aujourdhui = new Date();
  const fin = auJourdhuiYMD();
  if (preset === "jour") return { debut: fin, fin };
  if (preset === "semaine") {
    const jourSemaine = aujourdhui.getDay(); // 0 = dimanche
    const decalageLundi = jourSemaine === 0 ? 6 : jourSemaine - 1;
    const lundi = new Date(aujourdhui);
    lundi.setDate(aujourdhui.getDate() - decalageLundi);
    return { debut: lundi.toLocaleDateString("sv-SE"), fin };
  }
  // "mois"
  const premierDuMois = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1);
  return { debut: premierDuMois.toLocaleDateString("sv-SE"), fin };
}

/** "Conditionnement" : pièces par carton pour un carreau, sinon l'unité de vente (même règle que le PDF). */
function libelleConditionnement(p: BilanDetailProduit): string {
  if (p.estCarreau && p.uniteVente === "carton") return p.carreauxParCarton != null ? `${p.carreauxParCarton} pcs/ctn` : "Carton";
  const l = LIBELLE_UNITE_VENTE[p.uniteVente].singulier;
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function ventiler(lignes: BilanDetailProduit[], champ: "vendu" | "sortie"): string {
  const parUnite = new Map<UniteVente, number>();
  for (const l of lignes) if (l[champ]) parUnite.set(l.uniteVente, (parUnite.get(l.uniteVente) ?? 0) + l[champ]);
  return formaterVentilationUnites([...parUnite.entries()].map(([unite, quantite]) => ({ unite, quantite }))) ?? "0";
}

function KpiBloc({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: defaultTokens.colors.text, fontFamily: defaultTokens.typography.display }}>{value}</div>
      <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>{label}</div>
    </div>
  );
}

/**
 * Bilan d'activité (2026-10-21) — réservé à l'Administrateur (voir
 * AppRoot.tsx/Shell.tsx pour la condition d'affichage, et checkAdminGuard
 * côté Main pour la garantie réelle, jamais uniquement un masquage ici).
 */
export function BilanScreen() {
  const { showError } = useToast();
  const [preset, setPreset] = useState<Preset>("mois");
  const [dateDebutPersonnalisee, setDateDebutPersonnalisee] = useState(auJourdhuiYMD());
  const [dateFinPersonnalisee, setDateFinPersonnalisee] = useState(auJourdhuiYMD());
  const [donnees, setDonnees] = useState<BilanDonnees | null>(null);
  const [chargement, setChargement] = useState(false);
  const [generationPdf, setGenerationPdf] = useState(false);
  const [apercu, setApercu] = useState<{ chemin: string; nomSuggere: string } | null>(null);
  // Bilan par catégorie (2026-11-24) — filtre optionnel, "" = toutes.
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [sousCategories, setSousCategories] = useState<SousCategorie[]>([]);
  const [filtreCategorieId, setFiltreCategorieId] = useState("");
  const [filtreSousCategorieId, setFiltreSousCategorieId] = useState("");

  useEffect(() => {
    void window.maxiEquip.listerCategories().then(setCategories);
    void window.maxiEquip.listerSousCategories().then(setSousCategories);
  }, []);

  const groupesDetail = useMemo(() => {
    const groupes: { cle: string; categorieNom: string; sousCategorieNom: string; lignes: BilanDetailProduit[] }[] = [];
    for (const p of donnees?.detailProduits ?? []) {
      const cle = `${p.categorieNom}|${p.sousCategorieNom}`;
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.cle === cle) dernier.lignes.push(p);
      else groupes.push({ cle, categorieNom: p.categorieNom, sousCategorieNom: p.sousCategorieNom, lignes: [p] });
    }
    return groupes;
  }, [donnees]);

  const bornesYMD = preset === "personnalise" ? { debut: dateDebutPersonnalisee, fin: dateFinPersonnalisee } : bornesPreset(preset);
  const debutISO = dateLocaleVersISO(bornesYMD.debut, false);
  const finISO = dateLocaleVersISO(bornesYMD.fin, true);
  const periodeLibelle = `du ${formaterDateFr(debutISO)} au ${formaterDateFr(finISO)}`;

  async function chargerBilan() {
    setChargement(true);
    try {
      const resultat = await window.maxiEquip.genererBilan(debutISO, finISO, {
        categorieId: filtreCategorieId || null,
        sousCategorieId: filtreSousCategorieId || null,
      });
      if (!resultat.success) {
        showError("Bilan impossible", resultat.message);
        setDonnees(null);
        return;
      }
      setDonnees(resultat);
    } finally {
      setChargement(false);
    }
  }

  async function genererPdf() {
    if (!donnees) return;
    setGenerationPdf(true);
    try {
      // CORRECTION (2026-10-28, "le bilan dans l'appli ne correspond pas
      // au bilan sur le PDF") : on exporte EXACTEMENT ce qui est déjà
      // affiché à l'écran (`donnees`), jamais une nouvelle requête — voir
      // le commentaire de bilan:genererPdf côté Main pour la raison.
      const resultat = await window.maxiEquip.genererBilanPdf(debutISO, finISO, periodeLibelle, donnees);
      if (!resultat.success || !resultat.chemin) {
        showError("Génération impossible", resultat.message ?? "Une erreur inattendue s'est produite.");
        return;
      }
      setApercu({ chemin: resultat.chemin, nomSuggere: resultat.nomSuggere ?? "bilan.pdf" });
    } finally {
      setGenerationPdf(false);
    }
  }

  const presets: { id: Exclude<Preset, "personnalise">; label: string }[] = [
    { id: "jour", label: "Aujourd'hui" },
    { id: "semaine", label: "Cette semaine" },
    { id: "mois", label: "Ce mois-ci" },
  ];

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0, marginBottom: 2 }}>Bilan d'activité</h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>
        Vue consolidée ventes, stock et promotions sur une période choisie.
      </p>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {presets.map((p) => (
              <Button key={p.id} variant={preset === p.id ? "primary" : "secondary"} onClick={() => setPreset(p.id)}>
                {p.label}
              </Button>
            ))}
            <Button variant={preset === "personnalise" ? "primary" : "secondary"} onClick={() => setPreset("personnalise")}>
              <Calendar size={14} />
              Période personnalisée
            </Button>
          </div>
          {preset === "personnalise" && (
            <>
              <div>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Du</label>
                <input
                  type="date"
                  value={dateDebutPersonnalisee}
                  max={dateFinPersonnalisee}
                  onChange={(e) => setDateDebutPersonnalisee(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.border}`, fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Au</label>
                <input
                  type="date"
                  value={dateFinPersonnalisee}
                  min={dateDebutPersonnalisee}
                  max={auJourdhuiYMD()}
                  onChange={(e) => setDateFinPersonnalisee(e.target.value)}
                  style={{ padding: "8px 10px", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.border}`, fontSize: 13 }}
                />
              </div>
            </>
          )}
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Catégorie</label>
            <select
              value={filtreCategorieId}
              onChange={(e) => {
                setFiltreCategorieId(e.target.value);
                setFiltreSousCategorieId("");
              }}
              style={{ padding: "8px 10px", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.border}`, fontSize: 13, minWidth: 200 }}
            >
              <option value="">Toutes les catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Sous-catégorie</label>
            <select
              value={filtreSousCategorieId}
              disabled={!filtreCategorieId}
              onChange={(e) => setFiltreSousCategorieId(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.border}`, fontSize: 13, minWidth: 180, opacity: filtreCategorieId ? 1 : 0.6 }}
            >
              <option value="">Toutes</option>
              {sousCategories
                .filter((sc) => sc.categorieId === filtreCategorieId)
                .map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.nom}</option>
                ))}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <Button loading={chargement} onClick={() => void chargerBilan()}>
            Générer le bilan
          </Button>
          {donnees && (
            <Button variant="secondary" loading={generationPdf} onClick={() => void genererPdf()}>
              <FileDown size={14} />
              Exporter en PDF
            </Button>
          )}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: defaultTokens.colors.textFaint }}>
          Période sélectionnée : {periodeLibelle}
          {donnees && ` — bilan affiché : ${donnees.filtre ?? "toutes catégories"}`}
        </p>
      </Card>

      {donnees && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Ventes</h2>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <KpiBloc label={donnees.filtre ? "Chiffre d'affaires facturé (articles de cette catégorie)" : "Chiffre d'affaires facturé"} value={`${donnees.ventes.caTotal.toLocaleString("fr-FR")} FCFA`} />
              <KpiBloc label={donnees.filtre ? "Factures contenant cette catégorie" : "Nombre de factures"} value={donnees.ventes.nombreFactures} />
              <KpiBloc
                label="Remises accordées"
                value={donnees.ventes.remiseTotale === null ? "Non ventilées par catégorie" : `${donnees.ventes.remiseTotale.toLocaleString("fr-FR")} FCFA`}
              />
            </div>
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 4px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Ventes par catégorie</h2>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: defaultTokens.colors.textFaint }}>Montants des articles vendus, avant la remise de chaque facture.</p>
            {donnees.ventesParCategorie.length === 0 ? (
              <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5, margin: 0 }}>Aucune vente enregistrée sur cette période.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: defaultTokens.colors.textSoft, fontSize: 12 }}>
                    <th style={{ padding: "6px 8px" }}>Catégorie</th>
                    <th style={{ padding: "6px 8px" }}>Quantités vendues</th>
                    <th style={{ padding: "6px 8px", textAlign: "right" }}>Chiffre d'affaires</th>
                    <th style={{ padding: "6px 8px", width: "30%" }}>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.ventesParCategorie.map((c) => (
                    <tr key={c.categorieId ?? "non-classe"} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                      <td style={{ padding: "8px", fontWeight: 700 }}>{c.categorieNom}</td>
                      <td style={{ padding: "8px" }}>{formaterVentilationUnites(c.quantites) ?? "—"}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{c.chiffreAffaires.toLocaleString("fr-FR")} FCFA</td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 8, borderRadius: 4, background: defaultTokens.colors.surfaceAlt }}>
                            <div style={{ width: `${Math.round(c.part * 100)}%`, height: 8, borderRadius: 4, background: defaultTokens.colors.accent }} />
                          </div>
                          <span style={{ fontSize: 12, minWidth: 44, textAlign: "right" }}>{(c.part * 100).toFixed(1).replace(".", ",")} %</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Produits les plus vendus</h2>
            {donnees.topProduits.length === 0 ? (
              <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5, margin: 0 }}>Aucune vente enregistrée sur cette période.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {donnees.topProduits.map((p) => (
                  <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, padding: "6px 0", borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                    <span style={{ fontFamily: defaultTokens.typography.mono }}>{p.label}</span>
                    <span style={{ fontWeight: 700 }}>{p.quantite}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <Card style={{ flex: 1, minWidth: 300 }}>
              <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Mouvements de stock</h2>
              <div style={{ display: "flex", gap: 20 }}>
                <KpiBloc label="Total entrées" value={formaterVentilationUnites(donnees.mouvements.entrees) ?? "Aucune entrée"} />
                <KpiBloc label="Total sorties" value={formaterVentilationUnites(donnees.mouvements.sorties) ?? "Aucune sortie"} />
              </div>
            </Card>

            <Card style={{ flex: 1, minWidth: 300 }}>
              <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>
                Stock actuel <span style={{ fontSize: 11, fontWeight: 400, color: defaultTokens.colors.textFaint }}>(instantané)</span>
              </h2>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {donnees.stockParEmplacement.map((d) => (
                  <KpiBloc key={d.emplacementId} label={`Stock ${d.nom}`} value={formaterVentilationUnites(d.parUnite) ?? "Aucun stock"} />
                ))}
                <KpiBloc label="Produits en alerte" value={donnees.produitsSousSeuilCount} />
              </div>
            </Card>
          </div>

          <Card style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Promotions</h2>
            <KpiBloc label="Promotions actives pendant la période" value={donnees.promotionsActivesPendantPeriode} />
          </Card>

          <Card padding={0}>
            <div style={{ padding: "16px 20px 0" }}>
              <h2 style={{ margin: "0 0 2px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Détail par produit</h2>
              <p style={{ margin: "0 0 14px", fontSize: 12, color: defaultTokens.colors.textFaint }}>
                "Vendu" et "Sortie" portent sur la période sélectionnée — "Stock" est un instantané au moment du bilan, comme la section ci-dessus.
              </p>
            </div>
            {donnees.detailProduits.length === 0 ? (
              <p style={{ padding: "0 20px 20px", color: defaultTokens.colors.textSoft, fontSize: 13.5, margin: 0 }}>Aucun produit {donnees.filtre ? "dans cette catégorie" : "au catalogue"}.</p>
            ) : (
              // Défilement interne, jamais de pagination (décision utilisateur) :
              // la plage de dates permet déjà de limiter le volume pertinent,
              // et l'export PDF reste la vue "imprimable" complète.
              <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left", position: "sticky", top: 0 }}>
                      {["Désignation / Référence", "Taille", "Conditionnement", ...donnees.depots.map((d) => `Stock ${d.nom}`), "Vendu", "Sortie"].map((h) => (
                        <th
                          key={h}
                          style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12, whiteSpace: "nowrap", background: defaultTokens.colors.surfaceAlt }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupesDetail.map((g) => (
                      <Fragment key={g.cle}>
                        <tr style={{ background: defaultTokens.colors.accentSoft }}>
                          <td colSpan={5 + donnees.depots.length} style={{ padding: "8px 16px", fontWeight: 800, fontSize: 12.5, color: defaultTokens.colors.accent }}>
                            {g.categorieNom} › {g.sousCategorieNom}
                          </td>
                        </tr>
                        {g.lignes.map((p) => (
                          <tr key={p.produitId} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                            <td style={{ padding: "10px 16px", fontWeight: 700 }}>{p.designation}</td>
                            <td style={{ padding: "10px 16px" }}>{p.taille}</td>
                            <td style={{ padding: "10px 16px", textAlign: "center", color: defaultTokens.colors.textSoft }}>{libelleConditionnement(p)}</td>
                            {donnees.depots.map((d) => (
                              <td key={d.id} style={{ padding: "10px 16px", textAlign: "center" }}>
                                {p.stockParEmplacement.find((s) => s.emplacementId === d.id)?.cartons ?? 0}
                              </td>
                            ))}
                            <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700 }}>{p.vendu}</td>
                            <td style={{ padding: "10px 16px", textAlign: "center" }}>{p.sortie}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                          <td colSpan={5 + donnees.depots.length} style={{ padding: "6px 16px", textAlign: "right", fontSize: 12, color: defaultTokens.colors.textSoft, fontWeight: 600 }}>
                            Sous-total {g.sousCategorieNom} — vendu : {ventiler(g.lignes, "vendu")} · sorties : {ventiler(g.lignes, "sortie")}
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {apercu && <PdfPreviewModal chemin={apercu.chemin} nomSuggere={apercu.nomSuggere} titre="Bilan d'activité" onFermer={() => setApercu(null)} />}
    </div>
  );
}
