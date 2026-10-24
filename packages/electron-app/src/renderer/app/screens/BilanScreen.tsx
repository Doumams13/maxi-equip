import { useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { FileDown, Calendar } from "lucide-react";
import { PdfPreviewModal } from "../components/PdfPreviewModal.js";

type Preset = "jour" | "semaine" | "mois" | "personnalise";

interface BilanDetailProduit {
  produitId: string;
  motif: string;
  taille: string;
  reference: string;
  stockParEmplacement: { emplacementId: string; cartons: number }[];
  vendu: number;
  sortie: number;
}

interface BilanDonnees {
  ventes: { caTotal: number; nombreFactures: number; remiseTotale: number };
  topProduits: { label: string; quantite: number }[];
  mouvements: { totalEntrees: number; totalSorties: number };
  stockParEmplacement: { emplacementId: string; nom: string; cartons: number }[];
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

  const bornesYMD = preset === "personnalise" ? { debut: dateDebutPersonnalisee, fin: dateFinPersonnalisee } : bornesPreset(preset);
  const debutISO = dateLocaleVersISO(bornesYMD.debut, false);
  const finISO = dateLocaleVersISO(bornesYMD.fin, true);
  const periodeLibelle = `du ${formaterDateFr(debutISO)} au ${formaterDateFr(finISO)}`;

  async function chargerBilan() {
    setChargement(true);
    try {
      const resultat = await window.maxiEquip.genererBilan(debutISO, finISO);
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
    setGenerationPdf(true);
    try {
      const resultat = await window.maxiEquip.genererBilanPdf(debutISO, finISO, periodeLibelle);
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
        <p style={{ margin: "10px 0 0", fontSize: 12, color: defaultTokens.colors.textFaint }}>Période sélectionnée : {periodeLibelle}</p>
      </Card>

      {donnees && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>Ventes</h2>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <KpiBloc label="Chiffre d'affaires facturé" value={`${donnees.ventes.caTotal.toLocaleString("fr-FR")} FCFA`} />
              <KpiBloc label="Nombre de factures" value={donnees.ventes.nombreFactures} />
              <KpiBloc label="Remises accordées" value={`${donnees.ventes.remiseTotale.toLocaleString("fr-FR")} FCFA`} />
            </div>
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
                <KpiBloc label="Total entrées" value={donnees.mouvements.totalEntrees} />
                <KpiBloc label="Total sorties" value={donnees.mouvements.totalSorties} />
              </div>
            </Card>

            <Card style={{ flex: 1, minWidth: 300 }}>
              <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 15 }}>
                Stock actuel <span style={{ fontSize: 11, fontWeight: 400, color: defaultTokens.colors.textFaint }}>(instantané)</span>
              </h2>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                {donnees.stockParEmplacement.map((d) => (
                  <KpiBloc key={d.emplacementId} label={`Stock ${d.nom}`} value={`${d.cartons} ct.`} />
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
              <p style={{ padding: "0 20px 20px", color: defaultTokens.colors.textSoft, fontSize: 13.5, margin: 0 }}>Aucun produit au catalogue.</p>
            ) : (
              // Défilement interne, jamais de pagination (décision utilisateur) :
              // la plage de dates permet déjà de limiter le volume pertinent,
              // et l'export PDF reste la vue "imprimable" complète.
              <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left", position: "sticky", top: 0 }}>
                      {["Motif", "Taille", "Référence", ...donnees.depots.map((d) => `Stock ${d.nom}`), "Vendu", "Sortie"].map((h) => (
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
                    {donnees.detailProduits.map((p) => (
                      <tr key={p.produitId} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                        <td style={{ padding: "10px 16px" }}>{p.motif}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 700 }}>{p.taille}</td>
                        <td style={{ padding: "10px 16px", color: defaultTokens.colors.textFaint }}>{p.reference}</td>
                        {donnees.depots.map((d) => (
                          <td key={d.id} style={{ padding: "10px 16px", textAlign: "center" }}>
                            {p.stockParEmplacement.find((s) => s.emplacementId === d.id)?.cartons ?? 0}
                          </td>
                        ))}
                        <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700 }}>{p.vendu}</td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>{p.sortie}</td>
                      </tr>
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
