import { useEffect, useMemo, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import type { Mouvement } from "@maxi-equip/shared-types";

type Periode = "jour" | "semaine" | "mois" | "personnalise" | "tout";
type ColonneTriable = "type" | "quantite" | "date";
type Direction = "asc" | "desc";

const MOUVEMENT_LABELS: Record<string, string> = { entree: "Entrée", sortie: "Sortie", transfert: "Transfert" };
const MOUVEMENT_COLORS: Record<string, string> = {
  entree: defaultTokens.colors.success,
  sortie: defaultTokens.colors.danger,
  transfert: defaultTokens.colors.info,
};

/** En-tête de colonne cliquable — tri réellement appliqué aux données, pas seulement visuel (§14 de la correction). */
function EnteteTriable({
  label,
  colonne,
  tri,
  onTrier,
}: {
  label: string;
  colonne: ColonneTriable;
  tri: { colonne: ColonneTriable | null; direction: Direction };
  onTrier: (colonne: ColonneTriable) => void;
}) {
  const actif = tri.colonne === colonne;
  const Icone = actif ? (tri.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => onTrier(colonne)}
      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontWeight: 700, color: actif ? defaultTokens.colors.accent : defaultTokens.colors.textSoft, fontSize: 12 }}
    >
      {label}
      <Icone size={12} />
    </button>
  );
}

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

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 12.5,
};

/**
 * Historique — Phase 2 §13, complété pour inclure le filtre "période
 * personnalisée" et le tri réel par clic sur les colonnes (§14 de la
 * correction). Filtrage/tri toujours appliqués côté client (volume
 * raisonnable en Phase 2), structure compatible avec un filtrage IPC
 * ultérieur sans réécriture.
 */
export function HistoriqueScreen() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: "date", direction: "desc" });

  useEffect(() => {
    void window.maxiEquip.listHistorique().then(setMouvements);
  }, []);

  const filtres = useMemo(() => {
    if (periode === "personnalise") {
      return mouvements.filter((m) => {
        const d = new Date(m.date);
        if (dateDebut && d < new Date(dateDebut)) return false;
        if (dateFin && d > new Date(new Date(dateFin).setHours(23, 59, 59, 999))) return false;
        return true;
      });
    }
    const debut = debutPeriode(periode);
    if (!debut) return mouvements;
    return mouvements.filter((m) => new Date(m.date) >= debut);
  }, [mouvements, periode, dateDebut, dateFin]);

  const tries = useMemo(() => {
    if (!tri.colonne) return filtres;
    const sens = tri.direction === "asc" ? 1 : -1;
    const copie = [...filtres];
    copie.sort((a, b) => {
      switch (tri.colonne) {
        case "type":
          return sens * a.type.localeCompare(b.type, "fr");
        case "quantite":
          return sens * (a.quantite - b.quantite);
        case "date":
          return sens * (new Date(a.date).getTime() - new Date(b.date).getTime());
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

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Historique</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
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
              padding: "7px 14px",
              borderRadius: defaultTokens.radius.pill,
              border: `1px solid ${periode === value ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
              background: periode === value ? defaultTokens.colors.accentSoft : "#fff",
              color: periode === value ? defaultTokens.colors.accent : defaultTokens.colors.text,
              fontSize: 12.5,
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

      <Card padding={0}>
        {filtres.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun mouvement pour cette période.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Type" colonne="type" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Quantité" colonne="quantite" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Date" colonne="date" tri={tri} onTrier={handleTrier} />
                </th>
              </tr>
            </thead>
            <tbody>
              {tries.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                  <td style={{ padding: "9px 16px", color: MOUVEMENT_COLORS[m.type], fontWeight: 700 }}>{MOUVEMENT_LABELS[m.type] ?? m.type}</td>
                  <td style={{ padding: "9px 16px" }}>{m.quantite}</td>
                  <td style={{ padding: "9px 16px", color: defaultTokens.colors.textSoft }}>{new Date(m.date).toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
