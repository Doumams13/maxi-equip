import { useEffect, useState } from "react";
import { Card, Button, Combobox, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, ImageOff, Images } from "lucide-react";
import type { ProduitAvecMiniature } from "../../../preload/index.js";
import { ImagesModal } from "./ImagesModal.js";

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13.5,
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 4 };

function Miniature({ dataUrl, motif }: { dataUrl: string | null; motif: string }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: defaultTokens.radius.sm,
        overflow: "hidden",
        background: defaultTokens.colors.surfaceAlt,
        border: `1px solid ${defaultTokens.colors.borderSoft}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt={`Carreau ${motif}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ImageOff size={16} color={defaultTokens.colors.textFaint} />
      )}
    </div>
  );
}

/**
 * Écran produits — Phase 2 §9, corrigé pour la représentation visuelle du
 * motif (§1-§5 de la correction) et le comportement combobox de "Type" et
 * "Taille" (§8bis) : composant Combobox du Design System, suggestions
 * réelles + saisie libre, jamais une liste fermée (cahier des charges §4).
 */
export function ProduitsScreen() {
  const { showSuccess, showError } = useToast();
  const [produits, setProduits] = useState<ProduitAvecMiniature[]>([]);
  const [suggestions, setSuggestions] = useState<{ types: string[]; tailles: string[] }>({ types: [], tailles: [] });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ motif: "", type: "", taille: "", reference: "", prix: "", seuilAlerte: "10" });
  const [imagesModalProduit, setImagesModalProduit] = useState<ProduitAvecMiniature | null>(null);

  async function refresh() {
    const [list, sugg] = await Promise.all([window.maxiEquip.listProduits(), window.maxiEquip.getCatalogueSuggestions()]);
    setProduits(list);
    setSuggestions(sugg);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.motif.trim() || !form.type.trim() || !form.taille.trim() || !form.reference.trim() || !form.prix) {
      showError("Champs requis", "Merci de renseigner tous les champs obligatoires du produit.");
      return;
    }
    setSaving(true);
    try {
      await window.maxiEquip.createProduit({
        motif: form.motif.trim(),
        type: form.type.trim(),
        taille: form.taille.trim(),
        reference: form.reference.trim(),
        prix: Number(form.prix),
        seuilAlerte: Number(form.seuilAlerte) || 0,
      });
      showSuccess("Produit ajouté", `"${form.motif}" a été ajouté au catalogue.`);
      setForm({ motif: "", type: "", taille: "", reference: "", prix: "", seuilAlerte: "10" });
      setShowForm(false);
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] création impossible :", err);
      showError("Ajout impossible", "Une erreur inattendue s'est produite. Vérifiez que la référence n'est pas déjà utilisée.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: 0 }}>Produits</h1>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} />
          Nouveau produit
        </Button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 20 }}>
          <form onSubmit={(e) => void handleCreate(e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Motif</label>
              <input style={inputStyle} value={form.motif} onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))} placeholder="Ex. Marbre Blanc" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <Combobox
                value={form.type}
                onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                suggestions={suggestions.types}
                placeholder="Ex. Grès cérame"
              />
            </div>
            <div>
              <label style={labelStyle}>Taille</label>
              <Combobox
                value={form.taille}
                onChange={(v) => setForm((f) => ({ ...f, taille: v }))}
                suggestions={suggestions.tailles}
                placeholder="Ex. 60x60 cm"
              />
            </div>
            <div>
              <label style={labelStyle}>Référence</label>
              <input style={inputStyle} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Ex. MB-6060" />
            </div>
            <div>
              <label style={labelStyle}>Prix (FCFA)</label>
              <input style={inputStyle} type="number" value={form.prix} onChange={(e) => setForm((f) => ({ ...f, prix: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Seuil d'alerte (cartons)</label>
              <input style={inputStyle} type="number" value={form.seuilAlerte} onChange={(e) => setForm((f) => ({ ...f, seuilAlerte: e.target.value }))} />
            </div>
            <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
              Les images du produit pourront être ajoutées après sa création, via le bouton dédié dans le tableau ci-dessous.
            </p>
            <div style={{ gridColumn: "1 / -1" }}>
              <Button type="submit" loading={saving}>
                Enregistrer le produit
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding={0}>
        {produits.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun produit au catalogue pour l'instant.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                {["Motif", "Type", "Taille", "Référence", "Prix", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produits.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                  <td style={{ padding: "8px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Miniature dataUrl={p.imagePrincipaleDataUrl} motif={p.motif} />
                      <span>{p.motif}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 16px" }}>{p.type}</td>
                  <td style={{ padding: "8px 16px", fontWeight: 700 }}>{p.taille}</td>
                  <td style={{ padding: "8px 16px", color: defaultTokens.colors.textSoft }}>{p.reference}</td>
                  <td style={{ padding: "8px 16px" }}>{p.prix.toLocaleString("fr-FR")} FCFA</td>
                  <td style={{ padding: "8px 16px", textAlign: "right" }}>
                    <Button variant="ghost" onClick={() => setImagesModalProduit(p)}>
                      <Images size={15} />
                      Images
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {imagesModalProduit && (
        <ImagesModal
          produitId={imagesModalProduit.id}
          produitMotif={imagesModalProduit.motif}
          onClose={() => setImagesModalProduit(null)}
          onImagesChanged={() => void refresh()}
        />
      )}
    </div>
  );
}
