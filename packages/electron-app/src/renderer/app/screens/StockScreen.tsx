import { useEffect, useState } from "react";
import { Card, Button, ConfirmDialog, useToast, defaultTokens } from "@maxi-equip/design-system";
import { RotateCcw } from "lucide-react";
import type { Produit, Emplacement } from "@maxi-equip/shared-types";
import { ProduitSelector } from "../components/ProduitSelector.js";
import { HistoriqueOperationsTable } from "../components/HistoriqueOperationsTable.js";
import { PaginationIntelligente } from "../components/PaginationIntelligente.js";
import type { EvenementHistorique } from "../../../preload/index.js";

const inputStyleModal: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13.5,
};

/**
 * Sélecteur de dépôt par onglets — DOIT rester une fonction top-level
 * (jamais imbriquée dans StockScreen) : un composant défini à l'intérieur
 * d'un autre composant est recréé (nouvelle identité de fonction) à
 * chaque rendu du parent, forçant React à démonter/remonter ces boutons
 * à chaque frappe dans les champs voisins (quantité, motif...) — même
 * classe de bug que celle corrigée dans ProduitsScreen.tsx/VarianteFormRow
 * et ParametresScreen.tsx/LignePointDeVente (2026-10-09).
 */
function DepotTabs({ depots, value, onChange }: { depots: Emplacement[]; value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {depots.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onChange(d.id)}
          style={{
            padding: "7px 14px",
            borderRadius: defaultTokens.radius.pill,
            border: `1px solid ${d.id === value ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
            background: d.id === value ? defaultTokens.colors.accentSoft : "#fff",
            color: d.id === value ? defaultTokens.colors.accent : defaultTokens.colors.text,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {d.nom}
        </button>
      ))}
    </div>
  );
}

/**
 * Correction "corriger une erreur de saisie de stock sans fausser le
 * tableau de bord" — même principe que AnnulerFactureModal
 * (FacturesScreen.tsx) : motif obligatoire, jamais un simple
 * ConfirmDialog qui ne permettrait pas la saisie libre.
 */
function AnnulerMouvementModal({
  evenement,
  onAnnuler,
  onConfirmer,
  confirming,
}: {
  evenement: EvenementHistorique;
  onAnnuler: () => void;
  onConfirmer: (motif: string) => void;
  confirming: boolean;
}) {
  const [motif, setMotif] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <Card elevated style={{ width: "min(460px, 92vw)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 4px", fontFamily: defaultTokens.typography.display, fontSize: 16.5, color: defaultTokens.colors.danger }}>
          Annuler ce mouvement ?
        </h2>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
          {evenement.produitMotif} — {evenement.produitTaille} · {evenement.quantite} carton(s) · {evenement.emplacementNom}
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: defaultTokens.colors.textFaint }}>
          Le stock sera remis exactement comme avant ce mouvement. Il restera consultable dans l'historique avec le statut ANNULÉ.
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Motif de l'annulation (obligatoire)</label>
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={3}
          style={{ ...inputStyleModal, width: "100%", boxSizing: "border-box", resize: "none", marginBottom: 16, fontFamily: defaultTokens.typography.body }}
          placeholder="Ex. Erreur de saisie sur la quantité"
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onAnnuler} disabled={confirming} style={{ flex: 1 }}>
            Retour
          </Button>
          <Button variant="danger" onClick={() => onConfirmer(motif)} loading={confirming} disabled={motif.trim().length === 0} style={{ flex: 1 }}>
            Confirmer l'annulation
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function StockScreen({
  session,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
}: {
  session: { userId: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}) {
  const { showSuccess, showWarning, showError } = useToast();
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  // stockParDepot[depotId][produitId] = quantite
  const [stockParDepot, setStockParDepot] = useState<Record<string, Record<string, number>>>({});

  const [entreeDepotId, setEntreeDepotId] = useState("");
  const [entreeProduitId, setEntreeProduitId] = useState("");
  const [entreeQuantite, setEntreeQuantite] = useState("");
  const [showConfirmEntree, setShowConfirmEntree] = useState(false);
  const [savingEntree, setSavingEntree] = useState(false);

  const [sortieDepotId, setSortieDepotId] = useState("");
  const [sortieProduitId, setSortieProduitId] = useState("");
  const [sortieQuantite, setSortieQuantite] = useState("");
  const [showConfirmSortie, setShowConfirmSortie] = useState(false);
  const [savingSortie, setSavingSortie] = useState(false);

  const [entreesCompletes, setEntreesCompletes] = useState<EvenementHistorique[]>([]);
  const [sortiesCompletes, setSortiesCompletes] = useState<EvenementHistorique[]>([]);
  const [transfertsComplets, setTransfertsComplets] = useState<EvenementHistorique[]>([]);
  const [ongletHistorique, setOngletHistorique] = useState<"entree" | "sortie" | "transfert">("entree");

  const [evenementAAnnuler, setEvenementAAnnuler] = useState<EvenementHistorique | null>(null);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);

  // Pagination du tableau multi-dépôts — correction "formulaires de
  // saisie restent visibles sans scroll, tableau paginé" (2026-10-10) :
  // la liste complète des produits est déjà chargée en mémoire (voir
  // listProduits ci-dessous), donc le découpage se fait ici côté client,
  // jamais un rechargement serveur par page (inutile, tout est déjà là).
  const PRODUITS_PAR_PAGE = 10;
  const [pageStock, setPageStock] = useState(1);

  const depots = emplacements.filter((e) => !e.estPointDeVente && e.actif);

  async function refreshStock(depotsActifs: Emplacement[]) {
    if (depotsActifs.length === 0) return;
    const results = await Promise.all(depotsActifs.map((d) => window.maxiEquip.getStockByEmplacement(d.id)));
    const map: Record<string, Record<string, number>> = {};
    depotsActifs.forEach((d, i) => {
      map[d.id] = Object.fromEntries((results[i] ?? []).map((s) => [s.produitId, s.quantite]));
    });
    setStockParDepot(map);
  }

  async function refreshHistorique() {
    const [entrees, sorties, transferts] = await Promise.all([
      window.maxiEquip.listEntreesCompletes(),
      window.maxiEquip.listSortiesCompletes(),
      window.maxiEquip.listTransfertsComplets(),
    ]);
    setEntreesCompletes(entrees);
    setSortiesCompletes(sorties);
    setTransfertsComplets(transferts);
  }

  useEffect(() => {
    void (async () => {
      const [emps, prods] = await Promise.all([window.maxiEquip.listEmplacements(), window.maxiEquip.listProduits()]);
      setEmplacements(emps);
      setProduits(prods);
      const depotsActifs = emps.filter((e) => !e.estPointDeVente && e.actif);
      if (depotsActifs.length > 0) {
        setEntreeDepotId(depotsActifs[0]!.id);
        setSortieDepotId(depotsActifs[0]!.id);
      }
      await refreshStock(depotsActifs);
    })();
    void refreshHistorique();
  }, []);

  function handleOuvrirConfirmEntree(e: React.FormEvent) {
    e.preventDefault();
    if (!entreeProduitId) {
      showWarning("Produit requis", "Sélectionnez un produit avant d'enregistrer une entrée.");
      return;
    }
    const quantite = Number(entreeQuantite);
    if (!quantite || quantite <= 0) {
      showWarning("Quantité requise", "Saisissez une quantité strictement positive.");
      return;
    }
    setShowConfirmEntree(true);
  }

  async function handleConfirmerEntree() {
    const quantite = Number(entreeQuantite);
    setSavingEntree(true);
    try {
      const result = await window.maxiEquip.enregistrerEntree(entreeProduitId, entreeDepotId, quantite);
      if (result.success) {
        showSuccess("Entrée enregistrée", "Le stock a été mis à jour avec succès.");
        setEntreeProduitId("");
        setEntreeQuantite("");
        setShowConfirmEntree(false);
        await refreshStock(depots);
        await refreshHistorique();
      } else {
        showError("Opération impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[stock] entrée impossible :", err);
      showError("Opération impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setSavingEntree(false);
    }
  }

  function handleOuvrirConfirmSortie(e: React.FormEvent) {
    e.preventDefault();
    if (!sortieProduitId) {
      showWarning("Produit requis", "Sélectionnez un produit avant d'enregistrer une sortie.");
      return;
    }
    const quantite = Number(sortieQuantite);
    if (!quantite || quantite <= 0) {
      showWarning("Quantité requise", "Saisissez une quantité strictement positive.");
      return;
    }
    const disponible = stockParDepot[sortieDepotId]?.[sortieProduitId] ?? 0;
    if (quantite > disponible) {
      showWarning(
        "Stock insuffisant",
        `Stock disponible dans ce dépôt : ${disponible} carton(s). Vous demandez ${quantite}.`
      );
      return;
    }
    setShowConfirmSortie(true);
  }

  async function handleConfirmerSortie() {
    const quantite = Number(sortieQuantite);
    setSavingSortie(true);
    try {
      const result = await window.maxiEquip.enregistrerSortie(sortieProduitId, sortieDepotId, quantite);
      if (result.success) {
        showSuccess("Sortie enregistrée", "Le stock a été mis à jour avec succès.");
        setSortieProduitId("");
        setSortieQuantite("");
        setShowConfirmSortie(false);
        await refreshStock(depots);
      } else {
        showError("Opération impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[stock] sortie impossible :", err);
      showError("Opération impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setSavingSortie(false);
    }
  }

  async function handleConfirmerAnnulationMouvement(motif: string) {
    if (!evenementAAnnuler) return;
    setAnnulationEnCours(true);
    try {
      const result = await window.maxiEquip.annulerMouvementStock(evenementAAnnuler.id, motif);
      if (result.success) {
        showSuccess("Mouvement annulé", "Le stock a été restauré à son état précédent.");
        setEvenementAAnnuler(null);
        await refreshStock(depots);
        await refreshHistorique();
      } else {
        showError("Annulation impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[stock] annulation de mouvement impossible :", err);
      showError("Annulation impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setAnnulationEnCours(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: defaultTokens.radius.sm,
    border: `1px solid ${defaultTokens.colors.border}`,
    fontFamily: defaultTokens.typography.body,
    fontSize: 13.5,
  };

  const entreeProduit = produits.find((p) => p.id === entreeProduitId) ?? null;
  const entreeDepot = depots.find((d) => d.id === entreeDepotId) ?? null;
  const sortieProduit = produits.find((p) => p.id === sortieProduitId) ?? null;
  const sortieDepot = depots.find((d) => d.id === sortieDepotId) ?? null;

  const totalPagesStock = Math.max(1, Math.ceil(produits.length / PRODUITS_PAR_PAGE));
  const pageStockActuelle = Math.min(pageStock, totalPagesStock);
  const produitsPage = produits.slice((pageStockActuelle - 1) * PRODUITS_PAR_PAGE, pageStockActuelle * PRODUITS_PAR_PAGE);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>
        Stock & Mouvements
      </h1>

      {/* ── Formulaire entrée ── */}
      <Card style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, marginBottom: 14 }}>
          Enregistrer une entrée
        </h2>
        <form onSubmit={handleOuvrirConfirmEntree}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Dépôt</label>
            <DepotTabs depots={depots} value={entreeDepotId} onChange={setEntreeDepotId} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ minWidth: 280 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Produit</label>
              <ProduitSelector produits={produits} value={entreeProduitId} onChange={setEntreeProduitId} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantité</label>
              <input
                style={{ ...inputStyle, width: 100 }}
                type="number"
                min={1}
                value={entreeQuantite}
                onChange={(e) => {
                  const brut = e.target.value;
                  setEntreeQuantite(brut === "" ? "" : String(Math.max(1, Math.trunc(Number(brut)))));
                }}
              />
            </div>
            <Button type="submit" loading={savingEntree}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEntreeProduitId("");
                setEntreeQuantite("");
              }}
            >
              <RotateCcw size={14} />
              Réinitialiser
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Formulaire sortie ── */}
      <Card style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, marginBottom: 14 }}>
          Enregistrer une sortie
        </h2>
        <form onSubmit={handleOuvrirConfirmSortie}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Dépôt</label>
            <DepotTabs depots={depots} value={sortieDepotId} onChange={setSortieDepotId} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ minWidth: 280 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Produit</label>
              <ProduitSelector produits={produits} value={sortieProduitId} onChange={setSortieProduitId} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantité</label>
              <input
                style={{ ...inputStyle, width: 100 }}
                type="number"
                min={1}
                value={sortieQuantite}
                onChange={(e) => {
                  const brut = e.target.value;
                  setSortieQuantite(brut === "" ? "" : String(Math.max(1, Math.trunc(Number(brut)))));
                }}
              />
            </div>
            {sortieProduitId && sortieDepotId && (
              <span style={{ fontSize: 12, color: defaultTokens.colors.textSoft, alignSelf: "center" }}>
                Disponible : {stockParDepot[sortieDepotId]?.[sortieProduitId] ?? 0} carton(s)
              </span>
            )}
            <Button type="submit" variant="secondary" loading={savingSortie}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSortieProduitId("");
                setSortieQuantite("");
              }}
            >
              <RotateCcw size={14} />
              Réinitialiser
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Table multi-dépôts — descendue sous les formulaires de saisie
          (2026-10-10) pour que ceux-ci restent accessibles sans scroll
          même avec une centaine de produits, et paginée à 10 lignes/page
          pour éviter un scroll infini. ── */}
      <Card padding={0} style={{ marginBottom: 24 }}>
        {produits.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun produit au catalogue.</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                    {["Motif", "Taille", "Référence", ...depots.map((d) => d.nom), "Total", "Seuil"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {produitsPage.map((p) => {
                    const qParDepot = depots.map((d) => stockParDepot[d.id]?.[p.id] ?? 0);
                    const total = qParDepot.reduce((s, q) => s + q, 0);
                    const sousSeuil = p.seuilAlerte > 0 && total <= p.seuilAlerte;
                    return (
                      <tr key={p.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                        <td style={{ padding: "10px 16px" }}>{p.motif}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 700 }}>{p.taille}</td>
                        <td style={{ padding: "10px 16px", color: defaultTokens.colors.textFaint }}>{p.reference}</td>
                        {qParDepot.map((q, i) => (
                          <td key={depots[i]!.id} style={{ padding: "10px 16px", textAlign: "center" }}>
                            {q}
                          </td>
                        ))}
                        <td
                          style={{
                            padding: "10px 16px",
                            textAlign: "center",
                            fontWeight: 700,
                            color: sousSeuil ? defaultTokens.colors.danger : defaultTokens.colors.text,
                          }}
                        >
                          {total}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center", color: defaultTokens.colors.textFaint }}>
                          {p.seuilAlerte}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPagesStock > 1 && (
              <PaginationIntelligente
                page={pageStockActuelle}
                totalPages={totalPagesStock}
                totalResultats={produits.length}
                libelleUnite="produits"
                onChangerPage={setPageStock}
              />
            )}
          </>
        )}
      </Card>

      {/* ── Historique des mouvements (Entrées / Sorties / Transferts) ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `2px solid ${defaultTokens.colors.borderSoft}` }}>
        {(["entree", "sortie", "transfert"] as const).map((onglet) => {
          const labels = { entree: "Entrées", sortie: "Sorties", transfert: "Transferts" };
          const actif = onglet === ongletHistorique;
          return (
            <button
              key={onglet}
              onClick={() => setOngletHistorique(onglet)}
              style={{
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom: actif ? `2px solid ${defaultTokens.colors.accent}` : "2px solid transparent",
                marginBottom: -2,
                color: actif ? defaultTokens.colors.accent : defaultTokens.colors.textSoft,
                fontWeight: actif ? 700 : 400,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: defaultTokens.typography.body,
              }}
            >
              {labels[onglet]}
            </button>
          );
        })}
      </div>

      {ongletHistorique === "entree" && (
        <HistoriqueOperationsTable
          type="entree"
          evenements={entreesCompletes}
          session={session}
          depotsDisponibles={depots.map((d) => d.nom)}
          cibleSurbrillance={cibleSurbrillance}
          onSurbrillanceAppliquee={onSurbrillanceAppliquee}
          onDemanderAnnulation={setEvenementAAnnuler}
          chargementAnnulationId={annulationEnCours ? (evenementAAnnuler?.id ?? null) : null}
        />
      )}
      {ongletHistorique === "sortie" && (
        <HistoriqueOperationsTable
          type="sortie"
          evenements={sortiesCompletes}
          session={session}
          depotsDisponibles={depots.map((d) => d.nom)}
          cibleSurbrillance={null}
          onSurbrillanceAppliquee={onSurbrillanceAppliquee}
          onDemanderAnnulation={setEvenementAAnnuler}
          chargementAnnulationId={annulationEnCours ? (evenementAAnnuler?.id ?? null) : null}
        />
      )}
      {ongletHistorique === "transfert" && (
        <HistoriqueOperationsTable
          type="transfert"
          evenements={transfertsComplets}
          session={session}
          depotsDisponibles={depots.map((d) => d.nom)}
          cibleSurbrillance={null}
          onSurbrillanceAppliquee={onSurbrillanceAppliquee}
        />
      )}

      {/* ── Confirm dialogs ── */}
      {showConfirmEntree && entreeProduit && (
        <ConfirmDialog
          title="Confirmer l'entrée de stock ?"
          resume={[
            { label: "Produit", value: `${entreeProduit.motif} — ${entreeProduit.taille}` },
            { label: "Référence", value: entreeProduit.reference },
            { label: "Dépôt", value: entreeDepot?.nom ?? "—" },
            { label: "Quantité", value: `${entreeQuantite} carton(s)` },
          ]}
          onAnnuler={() => setShowConfirmEntree(false)}
          onConfirmer={() => void handleConfirmerEntree()}
          confirming={savingEntree}
        />
      )}

      {showConfirmSortie && sortieProduit && (
        <ConfirmDialog
          title="Confirmer la sortie de stock ?"
          resume={[
            { label: "Produit", value: `${sortieProduit.motif} — ${sortieProduit.taille}` },
            { label: "Référence", value: sortieProduit.reference },
            { label: "Dépôt", value: sortieDepot?.nom ?? "—" },
            { label: "Quantité sortante", value: `${sortieQuantite} carton(s)` },
          ]}
          onAnnuler={() => setShowConfirmSortie(false)}
          onConfirmer={() => void handleConfirmerSortie()}
          confirming={savingSortie}
        />
      )}

      {evenementAAnnuler && (
        <AnnulerMouvementModal
          evenement={evenementAAnnuler}
          onAnnuler={() => setEvenementAAnnuler(null)}
          onConfirmer={(motif) => void handleConfirmerAnnulationMouvement(motif)}
          confirming={annulationEnCours}
        />
      )}
    </div>
  );
}
