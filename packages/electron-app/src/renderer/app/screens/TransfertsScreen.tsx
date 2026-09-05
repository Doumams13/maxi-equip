import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { ArrowLeftRight } from "lucide-react";
import type { Produit, Emplacement } from "@maxi-equip/shared-types";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13.5,
};

/**
 * Écran Transferts — entrée de navigation distincte, conforme à la
 * structure de la première maquette validée (baseNavItems). Réutilise
 * exclusivement StockService.enregistrerTransfert(), déjà implémenté
 * depuis le début de la Phase 2 mais jamais câblé à une interface —
 * aucune règle métier n'est ajoutée ici, seul le domaine décide (§19).
 */
export function TransfertsScreen() {
  const { showSuccess, showWarning, showError } = useToast();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [produitId, setProduitId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [quantite, setQuantite] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const [prods, emps] = await Promise.all([window.maxiEquip.listProduits(), window.maxiEquip.listEmplacements()]);
      setProduits(prods);
      setEmplacements(emps);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
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
    setSaving(true);
    try {
      const result = await window.maxiEquip.enregistrerTransfert(produitId, sourceId, destinationId, q);
      if (result.success) {
        showSuccess("Transfert enregistré", "Le stock a été mis à jour sur les deux emplacements.");
        setProduitId("");
        setQuantite("");
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

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>
        Transferts
      </h1>

      <Card style={{ maxWidth: 560 }}>
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Produit</label>
            <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={produitId} onChange={(e) => setProduitId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.reference} — {p.taille}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Depuis</label>
              <select style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">Sélectionner…</option>
                {emplacements.map((e) => (
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
                {emplacements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantité</label>
            <input style={{ ...inputStyle, width: 140 }} type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
          </div>
          <Button type="submit" loading={saving}>
            Enregistrer le transfert
          </Button>
        </form>
      </Card>
    </div>
  );
}
