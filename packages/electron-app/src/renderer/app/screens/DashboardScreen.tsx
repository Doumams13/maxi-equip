import { useEffect, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { Package, AlertTriangle, Receipt, Activity } from "lucide-react";
import type { Mouvement } from "@maxi-equip/shared-types";

interface Summary {
  totalProduits: number;
  produitsSousSeuil: number;
  totalFactures: number;
  mouvementsRecents: Mouvement[];
}

const MOUVEMENT_LABELS: Record<string, string> = { entree: "Entrée", sortie: "Sortie", transfert: "Transfert" };

function KpiCard({ icon: Icon, label, value, tone }: { icon: typeof Package; label: string; value: number; tone: "accent" | "warning" | "info" }) {
  const color = tone === "warning" ? defaultTokens.colors.warning : tone === "info" ? defaultTokens.colors.info : defaultTokens.colors.accent;
  const bg = tone === "warning" ? defaultTokens.colors.warningSoft : tone === "info" ? defaultTokens.colors.infoSoft : defaultTokens.colors.accentSoft;
  return (
    <Card style={{ flex: 1, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: defaultTokens.radius.md, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: defaultTokens.colors.text, fontFamily: defaultTokens.typography.display }}>{value}</div>
        <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>{label}</div>
      </div>
    </Card>
  );
}

/**
 * Tableau de bord — Phase 2 §8. N'affiche que des données réellement
 * disponibles (produits, factures, mouvements). Aucune donnée fictive :
 * les indicateurs qui dépendent de fonctionnalités non développées
 * (demandes du site, synchronisation) sont volontairement absents plutôt
 * que simulés (§28 : "pas de faux fonctionnel").
 */
export function DashboardScreen() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSummary(await window.maxiEquip.getDashboardSummary());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>
        Tableau de bord
      </h1>

      {error && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ color: defaultTokens.colors.danger, margin: 0 }}>Impossible de charger le tableau de bord.</p>
        </Card>
      )}

      {summary && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <KpiCard icon={Package} label="Produits au catalogue" value={summary.totalProduits} tone="accent" />
            <KpiCard icon={AlertTriangle} label="Produits sous le seuil d'alerte" value={summary.produitsSousSeuil} tone="warning" />
            <KpiCard icon={Receipt} label="Factures émises" value={summary.totalFactures} tone="info" />
          </div>

          <Card>
            <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Activity size={16} color={defaultTokens.colors.accent} />
              Activité récente
            </h2>
            {summary.mouvementsRecents.length === 0 ? (
              <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Aucun mouvement de stock enregistré pour l'instant.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {summary.mouvementsRecents.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      padding: "8px 10px",
                      borderRadius: defaultTokens.radius.sm,
                      background: defaultTokens.colors.surfaceAlt,
                    }}
                  >
                    <span>{MOUVEMENT_LABELS[m.type] ?? m.type}</span>
                    <span style={{ color: defaultTokens.colors.textSoft }}>{new Date(m.date).toLocaleString("fr-FR")}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card style={{ marginTop: 16 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: defaultTokens.colors.textFaint }}>
              Les demandes du site et les indicateurs de synchronisation apparaîtront ici lorsque ces fonctionnalités seront développées (phases suivantes).
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
