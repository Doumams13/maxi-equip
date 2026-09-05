import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import type { Produit, Emplacement } from "@maxi-equip/shared-types";

/**
 * Écran stock — Phase 2 §10. Aucune règle métier ici : la vérification de
 * disponibilité et le calcul du delta viennent de packages/domain, via le
 * canal IPC stock:entree (§19 — le domaine reste la seule source de vérité).
 */
export function StockScreen() {
  const { showSuccess, showWarning, showError } = useToast();
  const [emplacements, setEmplacements] = useState<Emplacement[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [emplacementId, setEmplacementId] = useState<string>("");
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [entreeProduitId, setEntreeProduitId] = useState("");
  const [entreeQuantite, setEntreeQuantite] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh(currentEmplacementId: string) {
    const stock = await window.maxiEquip.getStockByEmplacement(currentEmplacementId);
    setQuantites(Object.fromEntries(stock.map((s) => [s.produitId, s.quantite])));
  }

  useEffect(() => {
    void (async () => {
      const [emps, prods] = await Promise.all([window.maxiEquip.listEmplacements(), window.maxiEquip.listProduits()]);
      setEmplacements(emps);
      setProduits(prods);
      const first = emps[0];
      if (first) {
        setEmplacementId(first.id);
        await refresh(first.id);
      }
    })();
  }, []);

  useEffect(() => {
    if (emplacementId) void refresh(emplacementId);
  }, [emplacementId]);

  async function handleEntree(e: React.FormEvent) {
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
    setSaving(true);
    try {
      const result = await window.maxiEquip.enregistrerEntree(entreeProduitId, emplacementId, quantite);
      if (result.success) {
        showSuccess("Entrée enregistrée", "Le stock a été mis à jour avec succès.");
        setEntreeProduitId("");
        setEntreeQuantite("");
        await refresh(emplacementId);
      } else {
        showError("Opération impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[stock] entrée impossible :", err);
      showError("Opération impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: defaultTokens.radius.sm,
    border: `1px solid ${defaultTokens.colors.border}`,
    fontFamily: defaultTokens.typography.body,
    fontSize: 13.5,
  };

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Entrée de stock</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {emplacements.map((e) => (
          <button
            key={e.id}
            onClick={() => setEmplacementId(e.id)}
            style={{
              padding: "8px 16px",
              borderRadius: defaultTokens.radius.pill,
              border: `1px solid ${e.id === emplacementId ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
              background: e.id === emplacementId ? defaultTokens.colors.accentSoft : "#fff",
              color: e.id === emplacementId ? defaultTokens.colors.accent : defaultTokens.colors.text,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {e.nom} {e.estPointDeVente ? "(point de vente)" : "(dépôt)"}
          </button>
        ))}
      </div>

      <Card style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Enregistrer une entrée</h2>
        <form onSubmit={(e) => void handleEntree(e)} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Produit</label>
            <select style={{ ...inputStyle, minWidth: 240 }} value={entreeProduitId} onChange={(e) => setEntreeProduitId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.motif} — {p.taille}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quantité</label>
            <input style={{ ...inputStyle, width: 100 }} type="number" value={entreeQuantite} onChange={(e) => setEntreeQuantite(e.target.value)} />
          </div>
          <Button type="submit" loading={saving}>
            Enregistrer
          </Button>
        </form>
      </Card>

      <Card padding={0}>
        {produits.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun produit au catalogue.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                {["Produit", "Taille", "Quantité", "Seuil d'alerte"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produits.map((p) => {
                const quantite = quantites[p.id] ?? 0;
                const sousSeuil = p.seuilAlerte > 0 && quantite <= p.seuilAlerte;
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                    <td style={{ padding: "10px 16px" }}>{p.motif}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 700 }}>{p.taille}</td>
                    <td style={{ padding: "10px 16px", color: sousSeuil ? defaultTokens.colors.danger : defaultTokens.colors.text, fontWeight: sousSeuil ? 700 : 400 }}>
                      {quantite}
                    </td>
                    <td style={{ padding: "10px 16px", color: defaultTokens.colors.textFaint }}>{p.seuilAlerte}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
