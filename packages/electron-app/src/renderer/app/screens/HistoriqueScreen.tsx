import { useEffect, useMemo, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import type { Mouvement } from "@maxi-equip/shared-types";

type Periode = "jour" | "semaine" | "mois" | "personnalise" | "tout";

const MOUVEMENT_LABELS: Record<string, string> = { entree: "Entrée", sortie: "Sortie", transfert: "Transfert" };
const MOUVEMENT_COLORS: Record<string, string> = {
  entree: defaultTokens.colors.success,
  sortie: defaultTokens.colors.danger,
  transfert: defaultTokens.colors.info,
};

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
 * personnalisée" prévu par le cahier des charges et présent dans la
 * maquette originale (PeriodFilter, App.jsx ligne 475) — absent des
 * versions précédentes de cet écran, corrigé ici. Filtrage toujours
 * appliqué côté client (volume raisonnable en Phase 2), structure
 * compatible avec un filtrage IPC ultérieur sans réécriture.
 */
export function HistoriqueScreen() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [periode, setPeriode] = useState<Periode>("tout");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

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
                {["Type", "Quantité", "Date"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtres.map((m) => (
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
