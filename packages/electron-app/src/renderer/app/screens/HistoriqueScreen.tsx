import { useEffect, useMemo, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import type { Mouvement } from "@maxi-equip/shared-types";

type Periode = "jour" | "semaine" | "mois" | "tout";

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

/**
 * Historique — Phase 2 §13. Filtre de période appliqué côté client pour
 * l'instant (le volume de données reste faible en Phase 2) — la structure
 * (type Periode, calcul de la borne de date) est directement compatible
 * avec un filtrage côté serveur/IPC lorsque le volume le justifiera,
 * sans réécriture. Filtre "personnalisé" volontairement absent : pas
 * encore supporté par le domaine/la base à ce stade (§13 : "ne développe
 * pas de logique qui n'est pas encore supportée").
 */
export function HistoriqueScreen() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [periode, setPeriode] = useState<Periode>("tout");

  useEffect(() => {
    void window.maxiEquip.listHistorique().then(setMouvements);
  }, []);

  const filtres = useMemo(() => {
    const debut = debutPeriode(periode);
    if (!debut) return mouvements;
    return mouvements.filter((m) => new Date(m.date) >= debut);
  }, [mouvements, periode]);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Historique</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([
          ["jour", "Aujourd'hui"],
          ["semaine", "7 derniers jours"],
          ["mois", "Ce mois"],
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
