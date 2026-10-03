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
  User,
  ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MOUVEMENT_LABELS } from "../mouvementLabels.js";
import type { EvenementHistorique } from "../../../preload/index.js";
import type { CibleOperation } from "../AppRoot.js";

interface Summary {
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
  activiteRecente: EvenementHistorique[];
  stockDepots: number;
  stockParEmplacementPourGerant: { emplacementId: string; nom: string; cartons: number; referencesEnRupture: number }[];
  mesVentesAujourdhui: number;
  monChiffreAffaires: number;
  mesFacturesAujourdhuiCount: number;
  mesEntrees: number;
  mesSorties: number;
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

function StockParEmplacement({ lignes }: { lignes: Summary["stockParEmplacement"] }) {
  return (
    <Card padding={0} style={{ flex: 1 }}>
      <div style={{ padding: "18px 20px 4px" }}>
        <TitreBloc>Stock par emplacement</TitreBloc>
      </div>
      <p style={{ padding: "0 20px 14px", margin: 0, fontSize: 12, color: defaultTokens.colors.textSoft }}>
        SHOP est le seul point de vente ; Akébé et Akanda sont les dépôts de stockage.
      </p>
      <div style={{ overflowX: "auto" }}>
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
      </div>
    </Card>
  );
}

/** Libellé lisible pour un type d'événement consolidé — "vente"/"annulation" n'ont pas d'équivalent direct dans MOUVEMENT_LABELS (qui décrit des mouvements techniques, pas des événements métier). */
const TYPE_LABELS_EVENEMENT: Record<EvenementHistorique["type"], string> = {
  vente: "Vente effectuée",
  annulation: "Facture annulée",
  entree: MOUVEMENT_LABELS.entree ?? "Entrée",
  sortie: "Sortie",
  transfert: MOUVEMENT_LABELS.transfert ?? "Transfert",
};

/**
 * Ligne d'activité cliquable (Consolidation §17/§18, correction "1 vente
 * = 1 événement" §1/§16) — un clic redirige vers Factures (vente ou
 * annulation) ou vers l'Historique (entrée/transfert manuel), avec
 * l'identifiant réel de l'opération. L'auteur n'est affiché que si le
 * serveur l'a transmis — anonymisation déjà décidée côté Main.
 */
function LigneActivite({ m, userId, onNaviguer }: { m: EvenementHistorique; userId: string; onNaviguer: (c: CibleOperation) => void }) {
  // Toutes les opérations sont désormais cliquables (correction "Entrée
  // de stock / Transferts" §12-§17) : entrée → Entrée de stock, transfert
  // → Transferts, vente/annulation → Factures.
  const cible: CibleOperation | null =
    m.factureId !== null ? { type: "facture", id: m.factureId } : m.type === "entree" || m.type === "transfert" ? { type: m.type, id: m.id } : null;
  const estVenteOuAnnulation = m.type === "vente" || m.type === "annulation";
  return (
    <button
      onClick={() => cible && onNaviguer(cible)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        fontSize: 13,
        padding: "9px 10px",
        borderRadius: defaultTokens.radius.sm,
        background: defaultTokens.colors.surfaceAlt,
        border: "none",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <div>
        <span style={{ fontWeight: 700, color: defaultTokens.colors.text }}>{TYPE_LABELS_EVENEMENT[m.type]}</span>
        {estVenteOuAnnulation ? (
          <span style={{ color: defaultTokens.colors.textSoft }}>
            {" "}
            — {m.factureNumero} · {m.clientNom}
          </span>
        ) : (
          <span style={{ color: defaultTokens.colors.textSoft }}>
            {" "}
            — {m.produitMotif} ({m.produitTaille})
          </span>
        )}
        {(m.utilisateurId || m.utilisateurNom) && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
            <User size={11} />
            <span>{m.utilisateurId === userId ? "Vous" : m.utilisateurNom ? `${m.utilisateurNom} (${m.utilisateurRole})` : "Auteur non enregistré"}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
        <span style={{ color: defaultTokens.colors.textSoft, fontSize: 12, whiteSpace: "nowrap" }}>{new Date(m.date).toLocaleString("fr-FR")}</span>
        <ChevronRight size={14} color={defaultTokens.colors.textFaint} />
      </div>
    </button>
  );
}

function DashboardAdmin({
  summary,
  userId,
  onNaviguer,
  nomMagasin,
}: {
  summary: Summary;
  userId: string;
  onNaviguer: (c: CibleOperation) => void;
  nomMagasin: string;
}) {
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0, marginBottom: 2 }}>
        Tableau de bord — Administration
      </h1>
      <p style={{ marginTop: 0, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Vue globale de l'entreprise {nomMagasin}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
        <KpiCard icon={Boxes} label="Stock total (Akébé + Akanda)" value={summary.stockTousDepots.toLocaleString("fr-FR")} tone="accent" />
        <KpiCard icon={DollarSign} label="Chiffre d'affaires total" value={`${summary.caTotal.toLocaleString("fr-FR")} FCFA`} tone="success" />
        <KpiCard icon={AlertTriangle} label="Alertes de stock (global)" value={summary.produitsSousSeuilGlobal} tone="warning" />
        <KpiCard icon={Receipt} label="Factures émises" value={summary.totalFactures} tone="info" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
        <KpiCard icon={ArrowDownToLine} label="Total entrées (toutes périodes, tous utilisateurs)" value={summary.totalEntrees.toLocaleString("fr-FR")} tone="success" />
        <KpiCard icon={ArrowUpFromLine} label="Total sorties (toutes périodes, tous utilisateurs)" value={summary.totalSorties.toLocaleString("fr-FR")} tone="danger" />
        <KpiCard icon={Percent} label="Promotions actives" value={summary.promotionsActives} tone="externe" />
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "stretch", flexWrap: "wrap" }}>
        <Card style={{ flex: 1.3, minWidth: 340 }}>
          <TitreBloc>Entrées / Sorties — 7 derniers jours (global)</TitreBloc>
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

      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
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

      <Card>
        <TitreBloc>Activité récente de l'entreprise</TitreBloc>
        {summary.activiteRecente.length === 0 ? (
          <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Aucune opération enregistrée pour l'instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summary.activiteRecente.map((m) => (
              <LigneActivite key={m.id} m={m} userId={userId} onNaviguer={onNaviguer} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DashboardVendeur({
  nom,
  summary,
  userId,
  onNaviguer,
  nomMagasin,
}: {
  nom: string;
  summary: Summary;
  userId: string;
  onNaviguer: (c: CibleOperation) => void;
  nomMagasin: string;
}) {
  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Tableau de bord</h1>
      <p style={{ marginTop: -8, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Bienvenue {nom}</p>

      <TitreBloc>Stock global {nomMagasin}</TitreBloc>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        {summary.stockParEmplacementPourGerant.map((d) => (
          <KpiCard key={d.emplacementId} icon={Building2} label={`Stock ${d.nom}`} value={`${d.cartons.toLocaleString("fr-FR")} ct.`} tone="accent" />
        ))}
        <KpiCard icon={Boxes} label="Total (Akébé + Akanda)" value={`${summary.stockDepots.toLocaleString("fr-FR")} ct.`} tone="info" />
      </div>

      <TitreBloc>Mon activité personnelle</TitreBloc>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard icon={DollarSign} label="Mes ventes aujourd'hui" value={`${summary.mesVentesAujourdhui.toLocaleString("fr-FR")} FCFA`} tone="success" />
        <KpiCard icon={Receipt} label="Mon chiffre d'affaires (total)" value={`${summary.monChiffreAffaires.toLocaleString("fr-FR")} FCFA`} tone="info" />
        <KpiCard icon={ArrowDownToLine} label="Mes entrées enregistrées" value={summary.mesEntrees.toLocaleString("fr-FR")} tone="accent" />
        <KpiCard icon={ArrowUpFromLine} label="Mes sorties enregistrées" value={summary.mesSorties.toLocaleString("fr-FR")} tone="warning" />
      </div>

      <TitreBloc>Activité récente de l'entreprise</TitreBloc>
      <Card>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: defaultTokens.colors.textFaint }}>
          Vous voyez toutes les opérations ; l'identité des autres utilisateurs reste masquée (vos propres opérations affichent « Vous »).
        </p>
        {summary.activiteRecente.length === 0 ? (
          <p style={{ color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Aucune opération enregistrée pour l'instant.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summary.activiteRecente.map((m) => (
              <LigneActivite key={m.id} m={m} userId={userId} onNaviguer={onNaviguer} />
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: defaultTokens.colors.textFaint }}>
          Les demandes du site apparaîtront ici lorsque cette fonctionnalité sera développée (phase suivante).
        </p>
      </Card>
    </div>
  );
}

export interface DashboardScreenProps {
  session: { userId: string; nom: string; role: string };
  onNaviguerVersOperation: (cible: CibleOperation) => void;
}

export function DashboardScreen({ session, onNaviguerVersOperation }: DashboardScreenProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Correction "Finaliser Paramètres" §3/§4 : plus de "MAXI EQUIP" codé
  // en dur ici — vient de la configuration centralisée, comme sur les
  // factures et documents internes.
  const [nomMagasin, setNomMagasin] = useState("MAXI-EQUIP");

  useEffect(() => {
    void (async () => {
      try {
        const [result, nom] = await Promise.all([window.maxiEquip.getDashboardSummary(), window.maxiEquip.getNomMagasin()]);
        if (!result) throw new Error("Session expirée.");
        setSummary(result);
        setNomMagasin(nom);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

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

  return session.role === "administrateur" ? (
    <DashboardAdmin summary={summary} userId={session.userId} onNaviguer={onNaviguerVersOperation} nomMagasin={nomMagasin} />
  ) : (
    <DashboardVendeur nom={session.nom} summary={summary} userId={session.userId} onNaviguer={onNaviguerVersOperation} nomMagasin={nomMagasin} />
  );
}
