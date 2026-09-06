import { useEffect, useMemo, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { ArrowUp, ArrowDown, ChevronsUpDown, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Search } from "lucide-react";
import { MOUVEMENT_LABELS as TYPE_LABELS, MOUVEMENT_COLORS as TYPE_COLORS } from "../mouvementLabels.js";

interface MouvementEnrichi {
  id: string;
  type: string;
  date: string;
  quantite: number;
  produitId: string;
  produitMotif: string;
  produitReference: string;
  produitTaille: string;
  emplacementNom: string | null;
  emplacementSourceNom: string | null;
  emplacementDestinationNom: string | null;
  factureId: string | null;
  factureNumero: string | null;
  clientNom: string | null;
}

type Periode = "jour" | "semaine" | "mois" | "personnalise" | "tout";
type ColonneTriable = "date" | "type" | "emplacement" | "produit" | "quantite" | "facture";
type Direction = "asc" | "desc";

const TYPE_ICONS: Record<string, typeof ArrowDownToLine> = { entree: ArrowDownToLine, sortie: ArrowUpFromLine, transfert: ArrowLeftRight };

function debutPeriode(periode: Periode): Date | null {
  const now = new Date();
  if (periode === "jour") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (periode === "semaine") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (periode === "mois") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function nomEmplacement(m: MouvementEnrichi): string {
  if (m.type === "transfert") return `${m.emplacementSourceNom ?? "?"} → ${m.emplacementDestinationNom ?? "?"}`;
  return m.emplacementNom ?? "—";
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 12.5,
};

function EnteteTriable({ label, colonne, align = "left", tri, onTrier }: { label: string; colonne: ColonneTriable; align?: "left" | "right"; tri: { colonne: ColonneTriable | null; direction: Direction }; onTrier: (c: ColonneTriable) => void }) {
  const actif = tri.colonne === colonne;
  const Icone = actif ? (tri.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => onTrier(colonne)}
      style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: align === "right" ? "flex-end" : "flex-start", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 700, color: actif ? defaultTokens.colors.accent : defaultTokens.colors.textFaint, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.03em" }}
    >
      {label}
      <Icone size={11} />
    </button>
  );
}

function KpiMini({ icon: Icon, value, label, tone }: { icon: typeof ArrowDownToLine; value: number; label: string; tone: "success" | "danger" | "info" }) {
  const map = { success: [defaultTokens.colors.success, defaultTokens.colors.successSoft], danger: [defaultTokens.colors.danger, defaultTokens.colors.dangerSoft], info: [defaultTokens.colors.info, defaultTokens.colors.infoSoft] } as const;
  const [color, bg] = map[tone];
  return (
    <Card style={{ flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={18} color={color} />
        </div>
        <div>
          <div style={{ fontFamily: defaultTokens.typography.mono, fontSize: 22, fontWeight: 700, color: defaultTokens.colors.text }}>{value.toLocaleString("fr-FR")}</div>
          <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Historique — reconstruit selon la maquette originale (HistoriquePage,
 * App.jsx ligne 3015), adapté à la décision "SHOP n'a pas de stock" (le
 * SHOP n'apparaît jamais dans les données puisqu'aucun mouvement ne le
 * référence). "Sortie" est affiché "Vente" (§4), la recherche est
 * réellement globale (référence, motif, taille, n° facture, client —
 * §16/§17), et les colonnes pertinentes sont triables (§18-§21).
 */
export function HistoriqueScreen() {
  const [mouvements, setMouvements] = useState<MouvementEnrichi[]>([]);
  const [recherche, setRecherche] = useState("");
  const [typeFiltre, setTypeFiltre] = useState<string>("tous");
  const [emplacementFiltre, setEmplacementFiltre] = useState<string>("tous");
  const [periode, setPeriode] = useState<Periode>("tout");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: "date", direction: "desc" });

  useEffect(() => {
    void window.maxiEquip.listHistoriqueEnrichi().then(setMouvements);
  }, []);

  const emplacementsDisponibles = useMemo(() => {
    const noms = new Set<string>();
    mouvements.forEach((m) => {
      if (m.emplacementNom) noms.add(m.emplacementNom);
      if (m.emplacementSourceNom) noms.add(m.emplacementSourceNom);
      if (m.emplacementDestinationNom) noms.add(m.emplacementDestinationNom);
    });
    return Array.from(noms).sort();
  }, [mouvements]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return mouvements.filter((m) => {
      const matchRecherche =
        !q ||
        m.produitReference.toLowerCase().includes(q) ||
        m.produitMotif.toLowerCase().includes(q) ||
        m.produitTaille.toLowerCase().includes(q) ||
        (m.factureNumero ?? "").toLowerCase().includes(q) ||
        (m.clientNom ?? "").toLowerCase().includes(q);
      const matchType = typeFiltre === "tous" || m.type === typeFiltre;
      const matchEmplacement =
        emplacementFiltre === "tous" ||
        m.emplacementNom === emplacementFiltre ||
        m.emplacementSourceNom === emplacementFiltre ||
        m.emplacementDestinationNom === emplacementFiltre;

      let matchPeriode = true;
      if (periode === "personnalise") {
        const d = new Date(m.date);
        if (dateDebut && d < new Date(dateDebut)) matchPeriode = false;
        if (dateFin && d > new Date(new Date(dateFin).setHours(23, 59, 59, 999))) matchPeriode = false;
      } else {
        const debut = debutPeriode(periode);
        if (debut && new Date(m.date) < debut) matchPeriode = false;
      }

      return matchRecherche && matchType && matchEmplacement && matchPeriode;
    });
  }, [mouvements, recherche, typeFiltre, emplacementFiltre, periode, dateDebut, dateFin]);

  const tries = useMemo(() => {
    if (!tri.colonne) return filtres;
    const sens = tri.direction === "asc" ? 1 : -1;
    const copie = [...filtres];
    copie.sort((a, b) => {
      switch (tri.colonne) {
        case "date":
          return sens * (new Date(a.date).getTime() - new Date(b.date).getTime());
        case "type":
          return sens * a.type.localeCompare(b.type, "fr");
        case "emplacement":
          return sens * nomEmplacement(a).localeCompare(nomEmplacement(b), "fr");
        case "produit":
          return sens * `${a.produitMotif} ${a.produitTaille}`.localeCompare(`${b.produitMotif} ${b.produitTaille}`, "fr");
        case "quantite":
          return sens * (a.quantite - b.quantite);
        case "facture":
          return sens * (a.factureNumero ?? "").localeCompare(b.factureNumero ?? "", "fr");
        default:
          return 0;
      }
    });
    return copie;
  }, [filtres, tri]);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" };
    });
  }

  const totalEntrees = filtres.filter((m) => m.type === "entree").reduce((s, m) => s + m.quantite, 0);
  const totalSorties = filtres.filter((m) => m.type === "sortie").reduce((s, m) => s + m.quantite, 0);
  const totalTransferts = filtres.filter((m) => m.type === "transfert").reduce((s, m) => s + m.quantite, 0);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0, marginBottom: 2 }}>Historique des mouvements</h1>
      <p style={{ marginTop: 0, marginBottom: 18, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>{mouvements.length} mouvement(s) enregistré(s)</p>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <KpiMini icon={ArrowDownToLine} value={totalEntrees} label="Total des entrées (cartons)" tone="success" />
        <KpiMini icon={ArrowUpFromLine} value={totalSorties} label="Total des ventes (cartons)" tone="danger" />
        <KpiMini icon={ArrowLeftRight} value={totalTransferts} label="Total des transferts (cartons)" tone="info" />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 34 }}
              placeholder="Référence, motif, taille, n° facture, client…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <select style={inputStyle} value={emplacementFiltre} onChange={(e) => setEmplacementFiltre(e.target.value)}>
            <option value="tous">Tous les emplacements</option>
            {emplacementsDisponibles.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select style={inputStyle} value={typeFiltre} onChange={(e) => setTypeFiltre(e.target.value)}>
            <option value="tous">Tous les types</option>
            <option value="entree">Entrée</option>
            <option value="sortie">Vente</option>
            <option value="transfert">Transfert</option>
          </select>
          {([
            ["jour", "Aujourd'hui"],
            ["semaine", "7 derniers jours"],
            ["mois", "Ce mois"],
            ["personnalise", "Période personnalisée"],
            ["tout", "Tout"],
          ] as [Periode, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setPeriode(value)}
              style={{
                padding: "7px 12px",
                borderRadius: defaultTokens.radius.pill,
                border: `1px solid ${periode === value ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
                background: periode === value ? defaultTokens.colors.accentSoft : "#fff",
                color: periode === value ? defaultTokens.colors.accent : defaultTokens.colors.text,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
          {periode === "personnalise" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" style={inputStyle} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
              <span style={{ color: defaultTokens.colors.textFaint, fontSize: 12 }}>à</span>
              <input type="date" style={inputStyle} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
            </div>
          )}
        </div>
      </Card>

      <Card padding={0}>
        {tries.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun mouvement ne correspond à vos filtres.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Date" colonne="date" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Type" colonne="type" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Emplacement" colonne="emplacement" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Carreau" colonne="produit" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px", textAlign: "right" }}>
                  <EnteteTriable label="Quantité" colonne="quantite" align="right" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Facture" colonne="facture" tri={tri} onTrier={handleTrier} />
                </th>
              </tr>
            </thead>
            <tbody>
              {tries.map((m) => {
                const Icone = TYPE_ICONS[m.type] ?? ArrowDownToLine;
                return (
                  <tr key={m.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                    <td style={{ padding: "10px 16px", color: defaultTokens.colors.textSoft, whiteSpace: "nowrap" }}>{new Date(m.date).toLocaleString("fr-FR")}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: TYPE_COLORS[m.type], fontWeight: 700 }}>
                        <Icone size={13} />
                        {TYPE_LABELS[m.type] ?? m.type}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: defaultTokens.colors.textSoft, whiteSpace: "nowrap" }}>{nomEmplacement(m)}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{m.produitMotif}</div>
                      <div style={{ fontSize: 11.5, color: defaultTokens.colors.textSoft }}>
                        {m.produitTaille} · {m.produitReference}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: defaultTokens.typography.mono, fontWeight: 700, color: TYPE_COLORS[m.type] }}>
                      {m.type === "entree" ? "+" : m.type === "transfert" ? "" : "-"}
                      {m.quantite}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {m.factureNumero ? (
                        <span style={{ fontFamily: defaultTokens.typography.mono, fontSize: 12, color: defaultTokens.colors.accent, fontWeight: 600 }}>{m.factureNumero}</span>
                      ) : (
                        <span style={{ color: defaultTokens.colors.textFaint }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
