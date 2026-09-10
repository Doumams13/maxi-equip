import { useEffect, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { ArrowUp, ArrowDown, ChevronsUpDown, ArrowDownToLine, ArrowLeftRight, ShoppingCart, Ban, Search, X } from "lucide-react";
import type { EvenementHistorique } from "../../../preload/index.js";
import type { CibleOperation } from "../AppRoot.js";
import { useSurbrillanceOperation } from "../highlight.js";
import { PaginationIntelligente } from "../components/PaginationIntelligente.js";

type Periode = "jour" | "semaine" | "mois" | "personnalise" | "tout";
type ColonneTriable = "date" | "type" | "montant";
type Direction = "asc" | "desc";

const TAILLE_PAGE = 10;

const TYPE_LABELS: Record<EvenementHistorique["type"], string> = {
  vente: "Vente effectuée",
  annulation: "Facture annulée",
  entree: "Entrée",
  transfert: "Transfert",
};
const TYPE_COLORS: Record<EvenementHistorique["type"], string> = {
  vente: defaultTokens.colors.success,
  annulation: defaultTokens.colors.danger,
  entree: defaultTokens.colors.success,
  transfert: defaultTokens.colors.info,
};
const TYPE_ICONS: Record<EvenementHistorique["type"], typeof ArrowDownToLine> = {
  vente: ShoppingCart,
  annulation: Ban,
  entree: ArrowDownToLine,
  transfert: ArrowLeftRight,
};

function nomEmplacement(e: EvenementHistorique): string {
  if (e.type === "transfert") return `${e.emplacementSourceNom ?? "?"} → ${e.emplacementDestinationNom ?? "?"}`;
  if (e.type === "entree") return e.emplacementNom ?? "—";
  return "—";
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 12.5,
};

function EnteteTriable({
  label,
  colonne,
  align = "left",
  tri,
  onTrier,
}: {
  label: string;
  colonne: ColonneTriable;
  align?: "left" | "right";
  tri: { colonne: ColonneTriable | null; direction: Direction };
  onTrier: (c: ColonneTriable) => void;
}) {
  const actif = tri.colonne === colonne;
  const Icone = actif ? (tri.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => onTrier(colonne)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        width: "100%",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        font: "inherit",
        fontWeight: 700,
        color: actif ? defaultTokens.colors.accent : defaultTokens.colors.textFaint,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {label}
      <Icone size={11} />
    </button>
  );
}

function KpiMini({ icon: Icon, value, label, tone }: { icon: typeof ArrowDownToLine; value: number; label: string; tone: "success" | "danger" | "info" }) {
  const map = {
    success: [defaultTokens.colors.success, defaultTokens.colors.successSoft],
    danger: [defaultTokens.colors.danger, defaultTokens.colors.dangerSoft],
    info: [defaultTokens.colors.info, defaultTokens.colors.infoSoft],
  } as const;
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
 * Historique — reconstruit pour respecter "1 vente = 1 événement dans
 * l'historique" (correction §1/§2/§16) : les mouvements techniques
 * (répartition par dépôt, complément externe, restauration lors d'une
 * annulation) ne sont plus affichés comme des opérations indépendantes.
 *
 * Correction "Audit Phase 2 — pagination Historique" : plus de plafond
 * de 300 événements chargés en une fois, et vraie pagination à 10/page
 * (elle n'existait pas du tout auparavant — tout s'affichait dans un
 * seul tableau sans fin). Recherche, filtre de type, période et tri sont
 * envoyés au Main, qui interroge la base de données directement
 * (LIMIT/OFFSET) — seules les 10 lignes de la page demandée transitent
 * par IPC, quel que soit le nombre total d'événements enregistrés.
 */
export function HistoriqueScreen({
  session,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
  onNaviguerVersOperation,
}: {
  session: { userId: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
  onNaviguerVersOperation: (cible: CibleOperation) => void;
}) {
  const [evenements, setEvenements] = useState<EvenementHistorique[]>([]);
  const [totalResultats, setTotalResultats] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [compteurs, setCompteurs] = useState<Record<string, number>>({});
  const [chargementListe, setChargementListe] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [rechercheDebattue, setRechercheDebattue] = useState("");
  const [typeFiltre, setTypeFiltre] = useState<"tous" | "vente" | "annulation" | "entree" | "transfert">("tous");
  const [periode, setPeriode] = useState<Periode>("tout");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: "date", direction: "desc" });
  const [page, setPage] = useState(1);
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(
    cibleSurbrillance && evenements.some((e) => e.id === cibleSurbrillance) ? cibleSurbrillance : null,
    onSurbrillanceAppliquee
  );

  async function chargerPage() {
    setChargementListe(true);
    try {
      const result = await window.maxiEquip.listHistoriqueEnrichiPagine({
        recherche: rechercheDebattue,
        typeFiltre,
        periode,
        dateDebut,
        dateFin,
        colonneTri: tri.colonne,
        direction: tri.direction,
        page,
        tailleParPage: TAILLE_PAGE,
      });
      setEvenements(result.resultats);
      setTotalResultats(result.totalResultats);
      setTotalPages(result.totalPages);
      setCompteurs(result.compteurs);
    } finally {
      setChargementListe(false);
    }
  }

  useEffect(() => {
    void chargerPage();
  }, [rechercheDebattue, typeFiltre, periode, dateDebut, dateFin, tri, page]);

  // Anti-rebond léger sur la recherche (§ Performance de la correction)
  // — évite une requête base de données à chaque frappe. Même correctif
  // que FacturesScreen.tsx (bug réel signalé là-bas) appliqué ici par
  // cohérence/prévention : ne réinitialiser la page que si la recherche
  // a réellement changé depuis la dernière valeur déjà appliquée —
  // jamais lors d'une réinitialisation programmatique des filtres.
  useEffect(() => {
    const timer = setTimeout(() => {
      setRechercheDebattue((precedente) => {
        if (precedente !== recherche) setPage(1);
        return recherche;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [recherche]);

  useEffect(() => {
    if (!cibleSurbrillance) return;
    setRecherche("");
    setRechercheDebattue("");
    setTypeFiltre("tous");
    setPeriode("tout");
    setDateDebut("");
    setDateFin("");
    setTri({ colonne: "date", direction: "desc" });
    setPage(1);
  }, [cibleSurbrillance]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" };
    });
    setPage(1);
  }

  const totalVentes = compteurs.vente ?? 0;
  const totalAnnulations = compteurs.annulation ?? 0;
  const totalMouvementsManuels = (compteurs.entree ?? 0) + (compteurs.transfert ?? 0);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0, marginBottom: 2 }}>Historique</h1>
      <p style={{ marginTop: 0, marginBottom: 18, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>{totalResultats} événement(s) enregistré(s)</p>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <KpiMini icon={ShoppingCart} value={totalVentes} label="Ventes effectuées" tone="success" />
        <KpiMini icon={Ban} value={totalAnnulations} label="Factures annulées" tone="danger" />
        <KpiMini icon={ArrowLeftRight} value={totalMouvementsManuels} label="Entrées / transferts manuels" tone="info" />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 34 }}
              placeholder="N° facture, client, produit…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <select
            style={inputStyle}
            value={typeFiltre}
            onChange={(e) => {
              setTypeFiltre(e.target.value as "tous" | "vente" | "annulation" | "entree" | "transfert");
              setPage(1);
            }}
          >
            <option value="tous">Tous les types</option>
            <option value="vente">Ventes</option>
            <option value="annulation">Annulations</option>
            <option value="entree">Entrées</option>
            <option value="transfert">Transferts</option>
          </select>
          {(
            [
              ["jour", "Aujourd'hui"],
              ["semaine", "7 derniers jours"],
              ["mois", "Ce mois"],
              ["personnalise", "Période personnalisée"],
              ["tout", "Tout"],
            ] as [Periode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setPeriode(value);
                setPage(1);
              }}
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
              <input
                type="date"
                style={inputStyle}
                value={dateDebut}
                onChange={(e) => {
                  setDateDebut(e.target.value);
                  setPage(1);
                }}
              />
              <span style={{ color: defaultTokens.colors.textFaint, fontSize: 12 }}>à</span>
              <input
                type="date"
                style={inputStyle}
                value={dateFin}
                onChange={(e) => {
                  setDateFin(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          )}
          {(recherche || typeFiltre !== "tous" || periode !== "tout" || dateDebut || dateFin) && (
            <button
              onClick={() => {
                setRecherche("");
                setRechercheDebattue("");
                setTypeFiltre("tous");
                setPeriode("tout");
                setDateDebut("");
                setDateFin("");
                setPage(1);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 12px",
                borderRadius: defaultTokens.radius.pill,
                border: "none",
                background: "none",
                color: defaultTokens.colors.textSoft,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <X size={13} />
              Effacer les filtres
            </button>
          )}
        </div>
      </Card>

      <Card padding={0}>
        {chargementListe ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Chargement…</p>
        ) : evenements.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun événement ne correspond à vos filtres.</p>
        ) : (
          <>
            <div ref={conteneurRef} style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                    <th style={{ padding: "10px 16px" }}>
                      <EnteteTriable label="Date" colonne="date" tri={tri} onTrier={handleTrier} />
                    </th>
                    <th style={{ padding: "10px 16px" }}>
                      <EnteteTriable label="Type" colonne="type" tri={tri} onTrier={handleTrier} />
                    </th>
                    <th style={{ padding: "10px 16px" }}>Détails</th>
                    <th style={{ padding: "10px 16px", textAlign: "right" }}>
                      <EnteteTriable label="Montant" colonne="montant" align="right" tri={tri} onTrier={handleTrier} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evenements.map((e) => {
                    const Icone = TYPE_ICONS[e.type];
                    const cible: CibleOperation | null =
                      e.factureId !== null
                        ? { type: "facture", id: e.factureId }
                        : e.type === "entree" || e.type === "transfert"
                          ? { type: e.type, id: e.id }
                          : null;
                    return (
                      <tr
                        key={e.id}
                        data-operation-id={e.id}
                        onClick={() => cible && onNaviguerVersOperation(cible)}
                        style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, cursor: cible ? "pointer" : "default", ...styleSurbrillance(e.id) }}
                      >
                        <td style={{ padding: "10px 16px", color: defaultTokens.colors.textSoft, whiteSpace: "nowrap" }}>{new Date(e.date).toLocaleString("fr-FR")}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: TYPE_COLORS[e.type], fontWeight: 700 }}>
                            <Icone size={13} />
                            {TYPE_LABELS[e.type]}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {e.type === "vente" || e.type === "annulation" ? (
                            <div>
                              <span style={{ fontFamily: defaultTokens.typography.mono, fontWeight: 700, color: defaultTokens.colors.accent }}>{e.factureNumero}</span>
                              <span style={{ color: defaultTokens.colors.textSoft }}> — {e.clientNom}</span>
                              {e.type === "annulation" && e.motifAnnulation && (
                                <div style={{ fontSize: 11.5, color: defaultTokens.colors.textFaint, marginTop: 2 }}>Motif : {e.motifAnnulation}</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span style={{ fontWeight: 600 }}>{e.produitMotif}</span>
                              <span style={{ color: defaultTokens.colors.textSoft }}>
                                {" "}
                                ({e.produitTaille}) · {nomEmplacement(e)} · {e.quantite} ct.
                              </span>
                            </div>
                          )}
                          {(e.utilisateurId || e.utilisateurNom) && (
                            <div style={{ fontSize: 11, color: defaultTokens.colors.textFaint, marginTop: 2 }}>
                              {e.utilisateurId === session.userId ? "Vous" : e.utilisateurNom ? `${e.utilisateurNom} (${e.utilisateurRole})` : "Auteur non enregistré"}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>{e.montant !== null ? `${e.montant.toLocaleString("fr-FR")} FCFA` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
              <PaginationIntelligente page={page} totalPages={totalPages} totalResultats={totalResultats} libelleUnite="événement(s)" onChangerPage={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

