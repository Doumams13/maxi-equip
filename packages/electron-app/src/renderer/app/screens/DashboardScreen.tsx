import { useEffect, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import {
  Boxes,
  DollarSign,
  Receipt,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Percent,
  Building2,
  CheckCircle2,
  ImageOff,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { Mouvement } from "@maxi-equip/shared-types";
import { MOUVEMENT_LABELS } from "../mouvementLabels.js";

interface Summary {
  mouvementsRecents: Mouvement[];
  stockTousDepots: number;
  caTotal: number;
  produitsSousSeuilGlobal: number;
  totalFactures: number;
  totalProduits: number;
  totalEntrees: number;
  totalSorties: number;
  promotionsActives: number;
  serieEntreesSorties: { jour: string; entrees: number; sorties: number }[];
  stockParEmplacement: { emplacementId: string; nom: string; cartons: number; referencesEnRupture: number }[];
  topProduitsVendus: { label: string; quantite: number }[];
  produitsSousSeuilListe: { id: string; motif: string; type: string; taille: string; stock: number; seuilAlerte: number }[];
  stockDepots: number;
  ventesAujourdhui: number;
  mesVentesAujourdhui: number;
  mesFacturesAujourdhuiCount: number;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Boxes;
  label: string;
  value: string | number;
  tone: "accent" | "warning" | "info" | "success" | "danger" | "externe";
}) {
  const map = {
    accent: [defaultTokens.colors.accent, defaultTokens.colors.accentSoft],
    warning: [defaultTokens.colors.warning, defaultTokens.colors.warningSoft],
    info: [defaultTokens.colors.info, defaultTokens.colors.infoSoft],
    success: [defaultTokens.colors.success, defaultTokens.colors.successSoft],
    danger: [defaultTokens.colors.danger, defaultTokens.colors.dangerSoft],
    externe: [defaultTokens.colors.externe, defaultTokens.colors.externeSoft],
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

function TitreBloc({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: defaultTokens.typography.display, fontWeight: 700, fontSize: 14.5, color: defaultTokens.colors.text, marginBottom: 14 }}>{children}</div>;
}

/**
 * Tableau "Stock par emplacement" — reproduit DepotStockTable de la
 * maquette, à une différence VOLONTAIRE près : la maquette y liste aussi
 * SHOP, mais la décision métier de cette correction (§6/§9 : "SHOP n'a
 * pas de stock") prime explicitement sur le code de la maquette pour ce
 * point précis — seuls Akébé et Akanda apparaissent ici.
 */
function StockParEmplacement({ lignes }: { lignes: Summary["stockParEmplacement"] }) {
  return (
    <Card padding={0} style={{ flex: 1 }}>
      <div style={{ padding: "18px 20px 4px" }}>
        <TitreBloc>Stock par emplacement</TitreBloc>
      </div>
      <p style={{ padding: "0 20px 14px", margin: 0, fontSize: 12, color: defaultTokens.colors.textSoft }}>
        SHOP est le seul point de vente ; Akébé et Akanda sont les dépôts de stockage.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Emplacement", "Cartons en stock", "Références en rupture"].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? "left" : "right",
                  padding: "8px 20px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: defaultTokens.colors.textFaint,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  borderBottom: `1px solid ${defaultTokens.colors.borderSoft}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.emplacementId} style={{ borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
              <td style={{ padding: "12px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Building2 size={14} color={defaultTokens.colors.textSoft} />
                  <span style={{ fontWeight: 700, fontSize: 13.3 }}>{l.nom}</span>
                </div>
              </td>
              <td style={{ padding: "12px 20px", textAlign: "right", fontFamily: defaultTokens.typography.mono, fontWeight: 600 }}>{l.cartons} ct.</td>
              <td
                style={{
                  padding: "12px 20px",
                  textAlign: "right",
                  fontFamily: defaultTokens.typography.mono,
                  color: l.referencesEnRupture > 0 ? defaultTokens.colors.danger : defaultTokens.colors.textSoft,
                }}
              >
                {l.referencesEnRupture}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/**
 * Tableau de bord Administrateur — reproduit fidèlement la structure de
 * DashboardAdmin de la maquette (App.jsx ligne 1264) : 2 lignes
 * d'indicateurs, graphique Entrées/Sorties 7 jours + stock par
 * emplacement, produits les plus vendus + stock faible. Chaque donnée est
 * réelle (calculée depuis mouvements/factures/stocks), sauf
 * "Promotions actives", volontairement à 0 — fonctionnalité non
 * développée avant la Phase 4, jamais une valeur inventée pour remplir
 * la case (§4/§24 de la correction).
 */
function DashboardAdmin({ summary }: { summary: Summary }) {
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0, marginBottom: 2 }}>
        Tableau de bord — Administration
      </h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Vue globale de l'entreprise MAXI EQUIP</p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <KpiCard icon={Boxes} label="Stock total (Akébé + Akanda)" value={summary.stockTousDepots.toLocaleString("fr-FR")} tone="accent" />
        <KpiCard icon={DollarSign} label="Chiffre d'affaires total" value={`${summary.caTotal.toLocaleString("fr-FR")} FCFA`} tone="success" />
        <KpiCard icon={AlertTriangle} label="Alertes de stock (global)" value={summary.produitsSousSeuilGlobal} tone="warning" />
        <KpiCard icon={Receipt} label="Factures émises" value={summary.totalFactures} tone="info" />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <KpiCard icon={ArrowDownToLine} label="Total entrées (toutes périodes)" value={summary.totalEntrees.toLocaleString("fr-FR")} tone="success" />
        <KpiCard icon={ArrowUpFromLine} label="Total sorties (toutes périodes)" value={summary.totalSorties.toLocaleString("fr-FR")} tone="danger" />
        <KpiCard icon={Percent} label="Promotions actives" value={summary.promotionsActives} tone="externe" />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "stretch", flexWrap: "wrap" }}>
        <Card style={{ flex: 1.3, minWidth: 340 }}>
          <TitreBloc>Entrées / Sorties — 7 derniers jours</TitreBloc>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={summary.serieEntreesSorties} barGap={4}>
              <CartesianGrid vertical={false} stroke={defaultTokens.colors.borderSoft} />
              <XAxis
                dataKey="jour"
                tickFormatter={(v: string) => new Date(v).toLocaleDateString("fr-FR", { weekday: "short" })}
                tick={{ fontSize: 12, fill: defaultTokens.colors.textSoft }}
                axisLine={{ stroke: defaultTokens.colors.borderSoft }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 12, fill: defaultTokens.colors.textSoft }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip
                labelFormatter={(v: string) => new Date(v).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "short" })}
                contentStyle={{ fontSize: 12.5, borderRadius: 8, border: `1px solid ${defaultTokens.colors.border}` }}
              />
              <Legend wrapperStyle={{ fontSize: 12.5 }} />
              <Bar dataKey="entrees" name="Entrées" fill={defaultTokens.colors.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="sorties" name="Sorties" fill={defaultTokens.colors.danger} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <StockParEmplacement lignes={summary.stockParEmplacement} />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: 340 }}>
          <TitreBloc>Produits les plus vendus (global)</TitreBloc>
          {summary.topProduitsVendus.length === 0 ? (
            <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Aucune vente enregistrée pour l'instant.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={summary.topProduitsVendus} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid horizontal={false} stroke={defaultTokens.colors.borderSoft} />
                <XAxis type="number" tick={{ fontSize: 11.5, fill: defaultTokens.colors.textSoft }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11, fill: defaultTokens.colors.textSoft }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => `${v} cartons`} contentStyle={{ fontSize: 12.5, borderRadius: 8, border: `1px solid ${defaultTokens.colors.border}` }} />
                <Bar dataKey="quantite" fill={defaultTokens.colors.accent} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card style={{ flex: 1, minWidth: 340 }}>
          <TitreBloc>Produits en stock faible (global)</TitreBloc>
          {summary.produitsSousSeuilListe.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "20px 0", color: defaultTokens.colors.success }}>
              <CheckCircle2 size={22} />
              <span style={{ fontSize: 13 }}>Tout est en ordre</span>
            </div>
          ) : (
            summary.produitsSousSeuilListe.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: defaultTokens.colors.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ImageOff size={13} color={defaultTokens.colors.textFaint} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: defaultTokens.colors.text }}>
                    {p.motif} — {p.taille}
                  </div>
                  <div style={{ fontSize: 11.5, color: defaultTokens.colors.textSoft }}>{p.type}</div>
                </div>
                <div style={{ fontFamily: defaultTokens.typography.mono, fontSize: 13, fontWeight: 600, color: p.stock <= 0 ? defaultTokens.colors.danger : defaultTokens.colors.warning }}>
                  {p.stock} ct.
                </div>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Tableau de bord Gérant — activité opérationnelle (dépôts, ventes du
 * jour). Reproduit DashboardVendeur de la maquette originale, adapté à la
 * même décision métier "SHOP n'a pas de stock".
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

      <Card>
        <TitreBloc>Activité récente</TitreBloc>
        {summary.mouvementsRecents.length === 0 ? (
          <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Aucun mouvement de stock enregistré pour l'instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summary.mouvementsRecents.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 10px", borderRadius: defaultTokens.radius.sm, background: defaultTokens.colors.surfaceAlt }}>
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
