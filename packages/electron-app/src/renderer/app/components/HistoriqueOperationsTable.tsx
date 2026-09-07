import { useEffect, useMemo, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { ArrowUp, ArrowDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight, User } from "lucide-react";
import type { EvenementHistorique } from "../../../preload/index.js";
import { useSurbrillanceOperation } from "../highlight.js";

const TAILLE_PAGE = 10;

type ColonneTriable = "date" | "produit" | "taille" | "depot" | "quantite" | "auteur";
type Direction = "asc" | "desc";

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

/**
 * Historique complet des entrées de stock OU des transferts — composant
 * commun (correction "Entrée de stock / Transferts" §2/§7 : mêmes
 * besoins pour les deux écrans, jamais dupliqués). Recherche, filtre par
 * dépôt, tri par colonne, pagination à exactement 10 par page (§6/§11),
 * et prise en charge de la navigation cliquable depuis l'Historique
 * général avec calcul automatique de la bonne page (§15/§16 : "si
 * l'entrée recherchée se trouve à la page 7, aller automatiquement à la
 * page 7").
 */
export function HistoriqueOperationsTable({
  type,
  evenements,
  session,
  depotsDisponibles,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
}: {
  type: "entree" | "transfert";
  evenements: EvenementHistorique[];
  session: { userId: string };
  depotsDisponibles: string[];
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [depotFiltre, setDepotFiltre] = useState("tous");
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: "date", direction: "desc" });
  const [page, setPage] = useState(1);

  // Une navigation cliquable doit retrouver la ligne même si un filtre
  // était actif (même principe que l'Historique général) — réinitialisés
  // dès qu'une cible de surbrillance arrive.
  useEffect(() => {
    if (!cibleSurbrillance) return;
    setRecherche("");
    setDepotFiltre("tous");
  }, [cibleSurbrillance]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return evenements.filter((e) => {
      const matchRecherche =
        !q ||
        (e.produitMotif ?? "").toLowerCase().includes(q) ||
        (e.produitReference ?? "").toLowerCase().includes(q) ||
        (e.produitTaille ?? "").toLowerCase().includes(q) ||
        (e.emplacementNom ?? "").toLowerCase().includes(q) ||
        (e.emplacementSourceNom ?? "").toLowerCase().includes(q) ||
        (e.emplacementDestinationNom ?? "").toLowerCase().includes(q);
      const matchDepot =
        depotFiltre === "tous" ||
        e.emplacementNom === depotFiltre ||
        e.emplacementSourceNom === depotFiltre ||
        e.emplacementDestinationNom === depotFiltre;
      return matchRecherche && matchDepot;
    });
  }, [evenements, recherche, depotFiltre]);

  const triees = useMemo(() => {
    if (!tri.colonne) return filtres;
    const sens = tri.direction === "asc" ? 1 : -1;
    const copie = [...filtres];
    copie.sort((a, b) => {
      switch (tri.colonne) {
        case "date":
          return sens * (new Date(a.date).getTime() - new Date(b.date).getTime());
        case "produit":
          return sens * (a.produitMotif ?? "").localeCompare(b.produitMotif ?? "", "fr");
        case "taille":
          return sens * (a.produitTaille ?? "").localeCompare(b.produitTaille ?? "", "fr");
        case "depot":
          return sens * (a.emplacementNom ?? a.emplacementSourceNom ?? "").localeCompare(b.emplacementNom ?? b.emplacementSourceNom ?? "", "fr");
        case "quantite":
          return sens * ((a.quantite ?? 0) - (b.quantite ?? 0));
        case "auteur":
          return sens * (a.utilisateurNom ?? "").localeCompare(b.utilisateurNom ?? "", "fr");
        default:
          return 0;
      }
    });
    return copie;
  }, [filtres, tri]);

  const totalPages = Math.max(1, Math.ceil(triees.length / TAILLE_PAGE));

  // Calcule automatiquement la bonne page pour une navigation cliquable
  // (§15/§16 de la correction) — dépend de la liste triée/filtrée
  // complète, jamais de la page actuellement affichée.
  useEffect(() => {
    if (!cibleSurbrillance) return;
    const index = triees.findIndex((e) => e.id === cibleSurbrillance);
    if (index === -1) return;
    setPage(Math.floor(index / TAILLE_PAGE) + 1);
  }, [cibleSurbrillance, triees]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageActuelle = triees.slice((page - 1) * TAILLE_PAGE, page * TAILLE_PAGE);

  // La cible n'est transmise au hook de surbrillance QUE si elle est
  // réellement présente sur la page actuellement affichée — garantit que
  // l'élément DOM existe déjà quand le défilement/surbrillance s'applique
  // (sinon la page pourrait ne pas encore avoir été mise à jour).
  const cibleActive = cibleSurbrillance && pageActuelle.some((e) => e.id === cibleSurbrillance) ? cibleSurbrillance : null;
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(cibleActive, onSurbrillanceAppliquee);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" };
    });
    setPage(1);
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px" }}>
            <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 34 }}
              placeholder="Produit, référence, taille, dépôt…"
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            style={inputStyle}
            value={depotFiltre}
            onChange={(e) => {
              setDepotFiltre(e.target.value);
              setPage(1);
            }}
          >
            <option value="tous">Tous les dépôts</option>
            {depotsDisponibles.map((d) => (
              <option key={d} value={d}>
                {type === "transfert" ? `Depuis/vers ${d}` : d}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card padding={0}>
        {triees.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>
            {evenements.length === 0 ? "Aucune opération enregistrée pour l'instant." : "Aucune opération ne correspond à vos filtres."}
          </p>
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
                      <EnteteTriable label="Produit" colonne="produit" tri={tri} onTrier={handleTrier} />
                    </th>
                    <th style={{ padding: "10px 16px" }}>
                      <EnteteTriable label="Taille" colonne="taille" tri={tri} onTrier={handleTrier} />
                    </th>
                    {type === "entree" ? (
                      <th style={{ padding: "10px 16px" }}>
                        <EnteteTriable label="Dépôt" colonne="depot" tri={tri} onTrier={handleTrier} />
                      </th>
                    ) : (
                      <>
                        <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textFaint, fontSize: 11, textTransform: "uppercase" }}>Depuis</th>
                        <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textFaint, fontSize: 11, textTransform: "uppercase" }}>Vers</th>
                      </>
                    )}
                    <th style={{ padding: "10px 16px", textAlign: "right" }}>
                      <EnteteTriable label="Quantité" colonne="quantite" align="right" tri={tri} onTrier={handleTrier} />
                    </th>
                    <th style={{ padding: "10px 16px" }}>
                      <EnteteTriable label="Auteur" colonne="auteur" tri={tri} onTrier={handleTrier} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageActuelle.map((e) => (
                    <tr key={e.id} data-operation-id={e.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, ...styleSurbrillance(e.id) }}>
                      <td style={{ padding: "10px 16px", color: defaultTokens.colors.textSoft, whiteSpace: "nowrap" }}>{new Date(e.date).toLocaleString("fr-FR")}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{e.produitMotif}</td>
                      <td style={{ padding: "10px 16px" }}>{e.produitTaille}</td>
                      {type === "entree" ? (
                        <td style={{ padding: "10px 16px" }}>{e.emplacementNom}</td>
                      ) : (
                        <>
                          <td style={{ padding: "10px 16px" }}>{e.emplacementSourceNom}</td>
                          <td style={{ padding: "10px 16px" }}>{e.emplacementDestinationNom}</td>
                        </>
                      )}
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, color: defaultTokens.colors.success }}>
                        {type === "entree" ? "+" : ""}
                        {e.quantite}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        {e.utilisateurId || e.utilisateurNom ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: defaultTokens.colors.textSoft, fontSize: 12.5 }}>
                            <User size={11} />
                            {e.utilisateurId === session.userId ? "Vous" : e.utilisateurNom ?? "Auteur non enregistré"}
                          </span>
                        ) : (
                          <span style={{ color: defaultTokens.colors.textFaint }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, padding: "14px 16px", borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${defaultTokens.colors.border}`, borderRadius: defaultTokens.radius.sm, padding: "6px 12px", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1, fontSize: 12.5 }}
              >
                <ChevronLeft size={14} />
                Précédent
              </button>
              <span style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
                Page {page} sur {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${defaultTokens.colors.border}`, borderRadius: defaultTokens.radius.sm, padding: "6px 12px", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1, fontSize: 12.5 }}
              >
                Suivant
                <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
