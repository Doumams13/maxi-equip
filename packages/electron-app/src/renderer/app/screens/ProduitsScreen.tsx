import { useMemo, useState, useEffect } from "react";
import { Card, Button, Combobox, ConfirmDialog, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, ImageOff, Images, Search, Star, X, ImagePlus, Pencil, Trash2, Circle, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import type { ProduitAvecMiniature, StagedImage } from "../../../preload/index.js";
import { ImagesModal } from "./ImagesModal.js";

type ColonneTriable = "type" | "taille" | "reference" | "prix" | "stockTotal";
type Direction = "asc" | "desc";

/** En-tête de colonne cliquable pour trier — §8/§9 de la correction. */
function EnteteTriable({
  label,
  colonne,
  tri,
  onTrier,
}: {
  label: string;
  colonne: ColonneTriable;
  tri: { colonne: ColonneTriable | null; direction: Direction };
  onTrier: (colonne: ColonneTriable) => void;
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
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        font: "inherit",
        fontWeight: 700,
        color: actif ? defaultTokens.colors.accent : defaultTokens.colors.textSoft,
        fontSize: 12,
      }}
    >
      {label}
      <Icone size={12} />
    </button>
  );
}

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

function Miniature({ dataUrl }: { dataUrl: string | null }) {
  return (
    <div
      style={{
        width: 52,
        height: 52,
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
        <img src={dataUrl} alt="Aperçu du carreau" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ImageOff size={18} color={defaultTokens.colors.textFaint} />
      )}
    </div>
  );
}

/** Extrait deux dimensions numériques d'une taille existante (ex. "60x60 cm", "60 × 60 cm") pour préremplir les champs largeur/hauteur. */
function extraireDimensions(taille: string): { largeur: string; hauteur: string } | null {
  const match = taille.match(/(\d+(?:[.,]\d+)?)\D+(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return { largeur: match[1]!.replace(",", "."), hauteur: match[2]!.replace(",", ".") };
}

/** Statut de stock — reproduit exactement getStockStatus() de la maquette originale (App.jsx §229). */
function StatutStock({ quantite, seuil }: { quantite: number; seuil: number }) {
  const statut =
    quantite <= 0
      ? { label: "Rupture", color: defaultTokens.colors.danger, bg: defaultTokens.colors.dangerSoft }
      : quantite <= seuil
        ? { label: "Stock faible", color: defaultTokens.colors.warning, bg: defaultTokens.colors.warningSoft }
        : { label: "Stock normal", color: defaultTokens.colors.success, bg: defaultTokens.colors.successSoft };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 12,
        fontWeight: 700,
        color: statut.color,
        background: statut.bg,
      }}
    >
      <Circle size={7} fill={statut.color} color={statut.color} />
      {statut.label}
    </span>
  );
}

/**
 * Écran Carreaux — Phase 2, aligné sur la maquette originale validée
 * (CarreauxPage, ligne 1581 de App.jsx) pour l'ordre des colonnes :
 * Carreau (image) | Type | Taille | Référence | Prix | Stock | État.
 * Motif reste une image, jamais un nom affiché — cohérent avec les
 * corrections précédentes ; seul l'ORDRE des colonnes suit ici la
 * maquette plutôt que les corrections, décision explicite prise avec
 * l'utilisateur (les deux références se contredisaient sur ce point).
 * Aucun champ "nom du produit" obligatoire — la référence identifie le
 * produit ; taille saisie en largeur × hauteur (cm) ; images en
 * prévisualisation réelle et immédiate (mécanisme de "staging").
 */
export function ProduitsScreen({ session }: { session: { userId: string } }) {
  const { showSuccess, showWarning, showError } = useToast();
  const [produits, setProduits] = useState<ProduitAvecMiniature[]>([]);
  const [suggestions, setSuggestions] = useState<{ types: string[]; tailles: string[] }>({ types: [], tailles: [] });
  const [recherche, setRecherche] = useState("");
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: null, direction: "asc" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: "", largeur: "", hauteur: "", reference: "", prix: "", seuilAlerte: "10" });
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [principaleStagingId, setPrincipaleStagingId] = useState<string | null>(null);
  const [pickingImages, setPickingImages] = useState(false);
  const [formInstanceKey, setFormInstanceKey] = useState(0);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [confirmDeleteProduit, setConfirmDeleteProduit] = useState<ProduitAvecMiniature | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imagesModalProduit, setImagesModalProduit] = useState<{ id: string; motif: string } | null>(null);

  async function refresh() {
    const [list, sugg] = await Promise.all([window.maxiEquip.listProduits(), window.maxiEquip.getCatalogueSuggestions()]);
    setProduits(list);
    setSuggestions(sugg);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const produitsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return produits;
    // Recherche globale sur les colonnes pertinentes (§16/§17 de la
    // correction) : référence, type ET taille — pas limitée à une seule
    // colonne, l'utilisateur ne doit pas avoir à choisir quel champ chercher.
    return produits.filter(
      (p) => p.reference.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) || p.taille.toLowerCase().includes(q) || p.motif.toLowerCase().includes(q)
    );
  }, [produits, recherche]);

  /**
   * Tri appliqué RÉELLEMENT aux données affichées (pas seulement visuel —
   * demande explicite §8). La taille est triée sur sa valeur numérique
   * (largeur, déjà stockée séparément — §12/§15 des corrections
   * précédentes), jamais sur la chaîne affichée : "100 × 100 cm" ne doit
   * jamais se retrouver avant "60 × 60 cm" à cause d'un tri alphabétique.
   */
  const produitsTries = useMemo(() => {
    if (!tri.colonne) return produitsFiltres;
    const sens = tri.direction === "asc" ? 1 : -1;
    const copie = [...produitsFiltres];
    copie.sort((a, b) => {
      switch (tri.colonne) {
        case "type":
          return sens * a.type.localeCompare(b.type, "fr");
        case "reference":
          return sens * a.reference.localeCompare(b.reference, "fr");
        case "taille":
          return sens * ((a.largeur ?? a.tailleTri) - (b.largeur ?? b.tailleTri));
        case "prix":
          return sens * (a.prix - b.prix);
        case "stockTotal":
          return sens * (a.stockTotal - b.stockTotal);
        default:
          return 0;
      }
    });
    return copie;
  }, [produitsFiltres, tri]);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" }; // 3e clic : retour à l'ordre par défaut
    });
  }

  function resetForm() {
    setForm({ type: "", largeur: "", hauteur: "", reference: "", prix: "", seuilAlerte: "10" });
    setStagedImages([]);
    setPrincipaleStagingId(null);
  }

  async function handleCloseForm() {
    if (stagedImages.length > 0) {
      await window.maxiEquip.discardStagedImages(stagedImages.map((s) => s.stagingId));
    }
    resetForm();
    setEditingId(null);
    setShowForm(false);
  }

  function handleStartEdit(p: ProduitAvecMiniature) {
    const dims = extraireDimensions(p.taille) ?? { largeur: "", hauteur: "" };
    setForm({
      type: p.type,
      largeur: dims.largeur,
      hauteur: dims.hauteur,
      reference: p.reference,
      prix: String(p.prix),
      seuilAlerte: String(p.seuilAlerte),
    });
    setEditingId(p.id);
    setFormInstanceKey((k) => k + 1);
    setShowForm(true);
  }

  async function handleDemanderSuppression() {
    if (!confirmDeleteProduit) return;
    setDeleting(true);
    try {
      await window.maxiEquip.deleteProduit(confirmDeleteProduit.id, session.userId);
      showSuccess("Produit supprimé", `"${confirmDeleteProduit.reference}" a été retiré du catalogue.`);
      setConfirmDeleteProduit(null);
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] suppression impossible :", err);
      showError("Suppression impossible", "Une erreur inattendue s'est produite.");
    } finally {
      setDeleting(false);
    }
  }

  async function handlePickImages() {
    setPickingImages(true);
    try {
      const result = await window.maxiEquip.pickFilesToStaging();
      if (result.success && result.staged) {
        setStagedImages((prev) => {
          const next = [...prev, ...result.staged!];
          if (!principaleStagingId && next.length > 0) setPrincipaleStagingId(next[0]!.stagingId);
          return next;
        });
      } else if (!result.success) {
        showError("Sélection impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setPickingImages(false);
    }
  }

  async function handleRemoveStaged(stagingId: string) {
    await window.maxiEquip.discardStagedImages([stagingId]);
    setStagedImages((prev) => prev.filter((s) => s.stagingId !== stagingId));
    if (principaleStagingId === stagingId) {
      setPrincipaleStagingId(() => {
        const remaining = stagedImages.filter((s) => s.stagingId !== stagingId);
        return remaining[0]?.stagingId ?? null;
      });
    }
  }

  function selectDimensionSuggestion(taille: string) {
    const dims = extraireDimensions(taille);
    if (dims) setForm((f) => ({ ...f, largeur: dims.largeur, hauteur: dims.hauteur }));
  }

  function handleOuvrirConfirmationEnregistrement(e: React.FormEvent) {
    e.preventDefault();
    if (!form.type.trim() || !form.largeur || !form.hauteur || !form.reference.trim() || !form.prix) {
      showWarning("Champs requis", "Merci de renseigner le type, la taille (largeur et hauteur), la référence et le prix.");
      return;
    }
    setShowConfirmSave(true);
  }

  async function handleConfirmerEnregistrement() {
    setSaving(true);
    try {
      const taille = `${form.largeur} × ${form.hauteur} cm`;
      const largeur = Number(form.largeur);
      const hauteur = Number(form.hauteur);

      if (editingId) {
        await window.maxiEquip.updateProduit(editingId, {
          type: form.type.trim(),
          taille,
          largeur,
          hauteur,
          reference: form.reference.trim(),
          prix: Number(form.prix),
          seuilAlerte: Number(form.seuilAlerte) || 0,
        });
        showSuccess("Produit modifié", `Référence "${form.reference.trim()}" mise à jour.`);
      } else {
        const { id } = await window.maxiEquip.createProduit({
          type: form.type.trim(),
          taille,
          largeur,
          hauteur,
          reference: form.reference.trim(),
          prix: Number(form.prix),
          seuilAlerte: Number(form.seuilAlerte) || 0,
        });

        if (stagedImages.length > 0) {
          await window.maxiEquip.commitStagedImages(
            id,
            stagedImages.map((s) => s.stagingId),
            principaleStagingId
          );
        }
        showSuccess("Produit créé", `Référence "${form.reference.trim()}" ajoutée au catalogue.`);
      }

      resetForm();
      setEditingId(null);
      setShowForm(false);
      setShowConfirmSave(false);
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] enregistrement impossible :", err);
      showError(
        editingId ? "Modification impossible" : "Ajout impossible",
        "Une erreur inattendue s'est produite. Vérifiez que la référence n'est pas déjà utilisée."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: 0 }}>Carreaux</h1>
        <Button onClick={() => (showForm ? void handleCloseForm() : (resetForm(), setEditingId(null), setFormInstanceKey((k) => k + 1), setShowForm(true)))}>
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? "Annuler" : "Nouveau produit"}
        </Button>
      </div>

      {showForm && (
        <Card key={formInstanceKey} style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>
            {editingId ? "Modifier le produit" : "Nouveau produit"}
          </h2>
          <form onSubmit={handleOuvrirConfirmationEnregistrement}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <Combobox value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v }))} suggestions={suggestions.types} placeholder="Ex. Grès cérame" />
              </div>
              <div>
                <label style={labelStyle}>Taille</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    style={{ ...inputStyle, textAlign: "center" }}
                    type="number"
                    min={1}
                    value={form.largeur}
                    onChange={(e) => {
                      const brut = e.target.value;
                      setForm((f) => ({ ...f, largeur: brut === "" ? "" : String(Math.max(1, Number(brut))) }));
                    }}
                    placeholder="60"
                  />
                  <span style={{ color: defaultTokens.colors.textFaint, fontWeight: 700 }}>×</span>
                  <input
                    style={{ ...inputStyle, textAlign: "center" }}
                    type="number"
                    min={1}
                    value={form.hauteur}
                    onChange={(e) => {
                      const brut = e.target.value;
                      setForm((f) => ({ ...f, hauteur: brut === "" ? "" : String(Math.max(1, Number(brut))) }));
                    }}
                    placeholder="60"
                  />
                  <span style={{ color: defaultTokens.colors.textSoft, fontSize: 13, flexShrink: 0 }}>cm</span>
                </div>
                {suggestions.tailles.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {suggestions.tailles.slice(0, 6).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => selectDimensionSuggestion(t)}
                        style={{
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: defaultTokens.radius.pill,
                          border: `1px solid ${defaultTokens.colors.border}`,
                          background: "#fff",
                          color: defaultTokens.colors.textSoft,
                          cursor: "pointer",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Référence</label>
                <input style={inputStyle} value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Ex. MB-6060" />
              </div>
              <div>
                <label style={labelStyle}>Prix (FCFA)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.prix}
                  onChange={(e) => {
                    const brut = e.target.value;
                    setForm((f) => ({ ...f, prix: brut === "" ? "" : String(Math.max(0, Number(brut))) }));
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Seuil d'alerte (cartons)</label>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.seuilAlerte}
                  onChange={(e) => {
                    const brut = e.target.value;
                    setForm((f) => ({ ...f, seuilAlerte: brut === "" ? "" : String(Math.max(0, Math.trunc(Number(brut)))) }));
                  }}
                />
              </div>
            </div>

            {!editingId && (
            <div style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, paddingTop: 14, marginBottom: 16 }}>
              <label style={labelStyle}>Photos du carreau (motif)</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {stagedImages.map((img) => {
                  const estPrincipale = img.stagingId === principaleStagingId;
                  return (
                    <div key={img.stagingId} style={{ position: "relative" }}>
                      <div
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: defaultTokens.radius.sm,
                          overflow: "hidden",
                          border: `2px solid ${estPrincipale ? defaultTokens.colors.accent : defaultTokens.colors.borderSoft}`,
                        }}
                      >
                        <img src={img.dataUrl} alt="Photo sélectionnée du carreau" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
                        <button
                          type="button"
                          title="Définir comme image principale"
                          onClick={() => setPrincipaleStagingId(img.stagingId)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                        >
                          <Star size={13} color={estPrincipale ? defaultTokens.colors.warning : defaultTokens.colors.textFaint} fill={estPrincipale ? defaultTokens.colors.warning : "none"} />
                        </button>
                        <button
                          type="button"
                          title="Retirer cette photo"
                          onClick={() => void handleRemoveStaged(img.stagingId)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                        >
                          <X size={13} color={defaultTokens.colors.danger} />
                        </button>
                      </div>
                      {estPrincipale && (
                        <span style={{ position: "absolute", top: -6, left: -6, fontSize: 9, background: defaultTokens.colors.accent, color: "#fff", borderRadius: 8, padding: "1px 5px", fontWeight: 700 }}>
                          principale
                        </span>
                      )}
                    </div>
                  );
                })}
                {stagedImages.length === 0 && (
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: defaultTokens.radius.sm,
                      background: defaultTokens.colors.surfaceAlt,
                      border: `1px dashed ${defaultTokens.colors.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ImageOff size={20} color={defaultTokens.colors.textFaint} />
                  </div>
                )}
              </div>
              <Button type="button" variant="secondary" loading={pickingImages} onClick={() => void handlePickImages()}>
                <ImagePlus size={15} />
                {stagedImages.length > 0 ? "Ajouter d'autres photos" : "Choisir des photos"}
              </Button>
            </div>
            )}
            {editingId && (
              <p style={{ fontSize: 11.5, color: defaultTokens.colors.textFaint, marginTop: -8, marginBottom: 16 }}>
                Les photos se gèrent séparément, via le bouton « Images » de la liste ci-dessous.
              </p>
            )}

            <Button type="submit" loading={saving}>
              {editingId ? "Enregistrer les modifications" : "Enregistrer le produit"}
            </Button>
          </form>
        </Card>
      )}

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 320 }}>
        <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          style={{ ...inputStyle, paddingLeft: 36 }}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Référence, type, taille, motif…"
        />
      </div>

      <Card padding={0}>
        {produitsFiltres.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>
            {produits.length === 0 ? "Aucun produit au catalogue pour l'instant." : "Aucun produit ne correspond à cette recherche."}
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Carreau</th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Type" colonne="type" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Taille" colonne="taille" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Référence" colonne="reference" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Prix / carton" colonne="prix" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px" }}>
                  <EnteteTriable label="Stock" colonne="stockTotal" tri={tri} onTrier={handleTrier} />
                </th>
                <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>État</th>
                <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Images</th>
                <th style={{ padding: "10px 16px" }}></th>
              </tr>
            </thead>
            <tbody>
              {produitsTries.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                  <td style={{ padding: "8px 16px" }}>
                    <Miniature dataUrl={p.imagePrincipaleDataUrl} />
                  </td>
                  <td style={{ padding: "8px 16px" }}>{p.type}</td>
                  <td style={{ padding: "8px 16px", fontWeight: 700 }}>{p.taille}</td>
                  <td style={{ padding: "8px 16px", color: defaultTokens.colors.textSoft, fontFamily: defaultTokens.typography.mono, fontSize: 12.5 }}>{p.reference}</td>
                  <td style={{ padding: "8px 16px" }}>{p.prix.toLocaleString("fr-FR")} FCFA</td>
                  <td style={{ padding: "8px 16px", fontWeight: 700, textAlign: "right" }}>{p.stockTotal} ct.</td>
                  <td style={{ padding: "8px 16px" }}>
                    <StatutStock quantite={p.stockTotal} seuil={p.seuilAlerte} />
                  </td>
                  <td style={{ padding: "8px 16px" }}>
                    <Button variant="ghost" onClick={() => setImagesModalProduit({ id: p.id, motif: p.reference })}>
                      <Images size={15} />
                      {p.nombreImages}
                    </Button>
                  </td>
                  <td style={{ padding: "8px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <Button variant="ghost" onClick={() => handleStartEdit(p)} title="Modifier">
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmDeleteProduit(p)} title="Supprimer">
                      <Trash2 size={15} color={defaultTokens.colors.danger} />
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

      {showConfirmSave && (
        <ConfirmDialog
          title={editingId ? "Confirmer la modification du produit ?" : "Confirmer la création du produit ?"}
          resume={[
            { label: "Référence", value: form.reference.trim() },
            { label: "Type", value: form.type.trim() },
            { label: "Taille", value: `${form.largeur} × ${form.hauteur} cm` },
            { label: "Prix", value: `${Number(form.prix).toLocaleString("fr-FR")} FCFA` },
            ...(!editingId ? [{ label: "Images", value: String(stagedImages.length) }] : []),
          ]}
          onAnnuler={() => setShowConfirmSave(false)}
          onConfirmer={() => void handleConfirmerEnregistrement()}
          confirming={saving}
        />
      )}

      {confirmDeleteProduit && (
        <ConfirmDialog
          title="Supprimer ce produit ?"
          danger
          confirmLabel="Confirmer la suppression"
          resume={[
            { label: "Référence", value: confirmDeleteProduit.reference },
            { label: "Type", value: confirmDeleteProduit.type },
            { label: "Taille", value: confirmDeleteProduit.taille },
          ]}
          onAnnuler={() => setConfirmDeleteProduit(null)}
          onConfirmer={() => void handleDemanderSuppression()}
          confirming={deleting}
        />
      )}
    </div>
  );
}
