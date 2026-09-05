import { useEffect, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { Boxes, DollarSign, Receipt, AlertTriangle, Activity } from "lucide-react";
import type { Mouvement } from "@maxi-equip/shared-types";

interface Summary {
  mouvementsRecents: Mouvement[];
  stockTousDepots: number;
  caTotal: number;
  produitsSousSeuilGlobal: number;
  totalFactures: number;
  totalProduits: number;
  stockDepots: number;
  ventesAujourdhui: number;
  mesVentesAujourdhui: number;
  mesFacturesAujourdhuiCount: number;
}

const MOUVEMENT_LABELS: Record<string, string> = { entree: "Entrée", sortie: "Sortie", transfert: "Transfert" };

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: string | number;
  tone: "accent" | "warning" | "info" | "success" | "danger";
}) {
  const map = {
    accent: [defaultTokens.colors.accent, defaultTokens.colors.accentSoft],
    warning: [defaultTokens.colors.warning, defaultTokens.colors.warningSoft],
    info: [defaultTokens.colors.info, defaultTokens.colors.infoSoft],
    success: [defaultTokens.colors.success, defaultTokens.colors.successSoft],
    danger: [defaultTokens.colors.danger, defaultTokens.colors.dangerSoft],
  } as const;
  const [color, bg] = map[tone];
  return (
    <Card style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, minWidth: 200 }}>
      <div style={{ width: 42, height: 42, borderRadius: defaultTokens.radius.md, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: defaultTokens.colors.text, fontFamily: defaultTokens.typography.display }}>{value}</div>
        <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>{label}</div>
      </div>
    </Card>
  );
}

function ActiviteRecente({ mouvements }: { mouvements: Mouvement[] }) {
  return (
    <Card>
      <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Activity size={16} color={defaultTokens.colors.accent} />
        Activité récente
      </h2>
      {mouvements.length === 0 ? (
        <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Aucun mouvement de stock enregistré pour l'instant.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mouvements.map((m) => (
            <div
              key={m.id}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 10px", borderRadius: defaultTokens.radius.sm, background: defaultTokens.colors.surfaceAlt }}
            >
              <span>{MOUVEMENT_LABELS[m.type] ?? m.type}</span>
              <span style={{ color: defaultTokens.colors.textSoft }}>{new Date(m.date).toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const NOTE_PHASES_SUIVANTES = (
  <Card style={{ marginTop: 16 }}>
    <p style={{ margin: 0, fontSize: 12.5, color: defaultTokens.colors.textFaint }}>
      Les demandes du site et les indicateurs de synchronisation apparaîtront ici lorsque ces fonctionnalités seront développées (phases suivantes).
    </p>
  </Card>
);

/**
 * Tableau de bord Administrateur — vue globale de l'entreprise, distincte
 * du tableau de bord Gérant. Reproduit DashboardAdmin de la maquette
 * originale (App.jsx ligne 1264) : stock tous dépôts confondus, chiffre
 * d'affaires total, alertes de stock globales — jamais les mêmes
 * indicateurs qu'un Gérant, qui ne voit que l'activité opérationnelle
 * (dépôts Akébé/Akanda — SHOP n'a pas de stock, correction Phase 2 §3).
 */
function DashboardAdmin({ summary }: { summary: Summary }) {
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>
        Tableau de bord — Administration
      </h1>
      <p style={{ marginTop: -8, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Vue globale de l'entreprise MAXI EQUIP</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard icon={Boxes} label="Stock total (Akébé + Akanda)" value={summary.stockTousDepots.toLocaleString("fr-FR")} tone="accent" />
        <KpiCard icon={DollarSign} label="Chiffre d'affaires total" value={`${summary.caTotal.toLocaleString("fr-FR")} FCFA`} tone="success" />
        <KpiCard icon={AlertTriangle} label="Alertes de stock (global)" value={summary.produitsSousSeuilGlobal} tone="warning" />
        <KpiCard icon={Receipt} label="Factures émises" value={summary.totalFactures} tone="info" />
      </div>

      <ActiviteRecente mouvements={summary.mouvementsRecents} />
      {NOTE_PHASES_SUIVANTES}
    </div>
  );
}

/**
 * Tableau de bord Gérant — activité opérationnelle (dépôts, ventes),
 * avec ses propres
 * ventes du jour mises en avant. Reproduit DashboardVendeur de la
 * maquette originale (App.jsx ligne 1188).
 */
function DashboardVendeur({ nom, summary }: { nom: string; summary: Summary }) {
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Tableau de bord</h1>
      <p style={{ marginTop: -8, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Bienvenue {nom} — activité MAXI EQUIP</p>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiCard icon={Boxes} label="Cartons en stock (Akébé + Akanda)" value={summary.stockDepots.toLocaleString("fr-FR")} tone="accent" />
        <KpiCard icon={DollarSign} label="Ventes du jour" value={`${summary.ventesAujourdhui.toLocaleString("fr-FR")} FCFA`} tone="success" />
        <KpiCard icon={Receipt} label="Mes ventes aujourd'hui" value={`${summary.mesVentesAujourdhui.toLocaleString("fr-FR")} FCFA`} tone="info" />
      </div>

      <ActiviteRecente mouvements={summary.mouvementsRecents} />
      {NOTE_PHASES_SUIVANTES}
    </div>
  );
}

export interface DashboardScreenProps {
  session: { userId: string; nom: string; role: string };
}

export function DashboardScreen({ session }: DashboardScreenProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSummary(await window.maxiEquip.getDashboardSummary(session.userId));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [session.userId]);

  if (error) {
    return (
      <div style={{ padding: 28 }}>
        <Card>
          <p style={{ color: defaultTokens.colors.danger, margin: 0 }}>Impossible de charger le tableau de bord.</p>
        </Card>
      </div>
    );
  }

  if (!summary) return null;

  return session.role === "administrateur" ? <DashboardAdmin summary={summary} /> : <DashboardVendeur nom={session.nom} summary={summary} />;
}
