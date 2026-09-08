import { useEffect, useState } from "react";
import { Card, Button, ConfirmDialog, useToast, defaultTokens } from "@maxi-equip/design-system";
import { ArrowLeftRight, RotateCcw } from "lucide-react";
import type { Produit, Emplacement } from "@maxi-equip/shared-types";
import { ProduitSelector } from "../components/ProduitSelector.js";
import { HistoriqueOperationsTable } from "../components/HistoriqueOperationsTable.js";
import type { EvenementHistorique } from "../../../preload/index.js";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13.5,
};

/**
 * Écran Transferts — Phase 2, corrigé pour la décision métier "SHOP n'a
 * pas de stock" (§3/§5) : les seuls emplacements de transfert possibles
 * sont Akébé et Akanda, jamais SHOP. Réutilise exclusivement
 * StockService.enregistrerTransfert() — aucune règle métier ajoutée ici,
 * seul le domaine décide (§19).
 *
 * Corrections supplémentaires : sélecteur de produit avec recherche
 * (composant commun ProduitSelector), quantité strictement positive,
 * double validation avant exécution réelle, et historique COMPLET des
 * transferts déjà enregistrés (correction "Entrée de stock / Transferts"
 * §7/§8 — recherche, tri, pagination à 10 par page, navigation cliquable
 * depuis l'Historique général).
 */
export function TransfertsScreen({
  session,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
}: {
  session: { userId: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}) {
  const { showSuccess, showWarning, showError } = useToast();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [produitId, setProduitId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [transfertsComplets, setTransfertsComplets] = useState<EvenementHistorique[]>([]);

  const depots = emplacements.filter((e) => !e.estPointDeVente);

  async function refreshHistorique() {
    setTransfertsComplets(await window.maxiEquip.listTransfertsComplets());
  }

  useEffect(() => {
    void (async () => {
      const [prods, emps] = await Promise.all([window.maxiEquip.listProduits(), window.maxiEquip.listEmplacements()]);
      setProduits(prods);
      setEmplacements(emps);
    })();
    void refreshHistorique();
  }, []);

  function handleOuvrirConfirmation(e: React.FormEvent) {
    e.preventDefault();
    if (!produitId || !sourceId || !destinationId) {
      showWarning("Champs requis", "Sélectionnez un produit, un dépôt source et un dépôt destination.");
      return;
    }
    if (sourceId === destinationId) {
      showWarning("Emplacements identiques", "La source et la destination doivent être différentes.");
      return;
    }
    const q = Number(quantite);
    if (!q || q <= 0) {
      showWarning("Quantité requise", "Saisissez une quantité strictement positive.");
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirmerTransfert() {
    const q = Number(quantite);
    setSaving(true);
    try {
      const result = await window.maxiEquip.enregistrerTransfert(produitId, sourceId, destinationId, q);
      if (result.success) {
        showSuccess("Transfert enregistré", "Le stock a été mis à jour sur les deux emplacements.");
        setProduitId("");
        setQuantite("");
        setShowConfirm(false);
        await refreshHistorique();
      } else {
        showError("Opération impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[transferts] enregistrement impossible :", err);
      showError("Opération impossible", "Une erreur inattendue s'est produite.");
    } finally {
      setSaving(false);
    }
  }

  const produitSelectionne = produits.find((p) => p.id === produitId) ?? null;
  const source = depots.find((d) => d.id === sourceId) ?? null;
  const destination = depots.find((d) => d.id === destinationId) ?? null;

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Transferts</h1>

      <Card style={{ maxWidth: 560 }}>
        <form onSubmit={handleOuvrirConfirmation} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Produit</label>
            <ProduitSelector produits={produits} value={produitId} onChange={setProduitId} />
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Depuis</label>
              <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {depots.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
            <ArrowLeftRight size={18} color={defaultTokens.colors.textFaint} style={{ marginBottom: 10, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Vers</label>
              <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {depots.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantité</label>
            <input
              style={{ ...inputStyle, width: 140 }}
              type="number"
              min={1}
              value={quantite}
              onChange={(e) => {
                const brut = e.target.value;
                setQuantite(brut === "" ? "" : String(Math.max(1, Math.trunc(Number(brut)))));
              }}
            />
          </div>
          <Button type="submit">Effectuer le transfert</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setProduitId("");
              setSourceId("");
              setDestinationId("");
              setQuantite("");
            }}
          >
            <RotateCcw size={14} />
            Réinitialiser
          </Button>
        </form>
      </Card>

      <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.text, marginBottom: 14, marginTop: 24 }}>Historique des transferts</h2>
      <HistoriqueOperationsTable
        type="transfert"
        evenements={transfertsComplets}
        session={session}
        depotsDisponibles={depots.map((d) => d.nom)}
        cibleSurbrillance={cibleSurbrillance}
        onSurbrillanceAppliquee={onSurbrillanceAppliquee}
      />

      {showConfirm && produitSelectionne && (
        <ConfirmDialog
          title="Confirmer le transfert ?"
          resume={[
            { label: "Produit", value: `${produitSelectionne.motif} — ${produitSelectionne.taille}` },
            { label: "Référence", value: produitSelectionne.reference },
            { label: "De", value: source?.nom ?? "—" },
            { label: "Vers", value: destination?.nom ?? "—" },
            { label: "Quantité", value: `${quantite} cartons` },
          ]}
          onAnnuler={() => setShowConfirm(false)}
          onConfirmer={() => void handleConfirmerTransfert()}
          confirming={saving}
        />
      )}
    </div>
  );
}
