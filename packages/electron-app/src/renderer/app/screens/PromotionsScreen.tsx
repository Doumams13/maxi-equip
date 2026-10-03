import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import type { Promotion } from "@maxi-equip/shared-types";
import { Plus, Pencil, Trash2, X, Tag, AlertTriangle } from "lucide-react";

type PerimetrePromotion = "global" | "cible";
type TypeReductionPromotion = "pourcentage" | "montant_fixe";

type ModalEtat =
  | null
  | { mode: "creer" }
  | { mode: "modifier"; promotion: Promotion }
  | { mode: "supprimer"; promotion: Promotion };

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  color: defaultTokens.colors.text,
};

const inputErrStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: defaultTokens.colors.danger,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: defaultTokens.colors.text,
};

function BadgeStatut({ promotion }: { promotion: Promotion }) {
  const now = new Date();
  const debut = new Date(promotion.dateDebut);
  const fin = new Date(promotion.dateFin);
  let texte: string;
  let bg: string;
  let color: string;

  if (now < debut) {
    texte = "À venir";
    bg = defaultTokens.colors.accentSoft;
    color = defaultTokens.colors.accent;
  } else if (now > fin) {
    texte = "Expirée";
    bg = defaultTokens.colors.borderSoft;
    color = defaultTokens.colors.textSoft;
  } else {
    texte = "Active";
    bg = "#d1fae5";
    color = "#065f46";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 11.5,
        fontWeight: 700,
        background: bg,
        color,
      }}
    >
      {texte}
    </span>
  );
}

function formaterReduction(typeReduction: TypeReductionPromotion, valeur: number): string {
  if (typeReduction === "pourcentage") return `-${valeur}%`;
  return `-${valeur.toLocaleString("fr-FR")} FCFA`;
}

function formaterDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface FormulairePromo {
  libelle: string;
  typeReduction: TypeReductionPromotion;
  valeur: string;
  perimetre: PerimetrePromotion;
  produitIds: string[];
  dateDebut: string;
  dateFin: string;
}

const FORM_VIDE: FormulairePromo = {
  libelle: "",
  typeReduction: "pourcentage",
  valeur: "",
  perimetre: "global",
  produitIds: [],
  dateDebut: "",
  dateFin: "",
};

function promotionVersFormulaire(p: Promotion): FormulairePromo {
  return {
    libelle: p.libelle,
    typeReduction: p.typeReduction,
    valeur: String(p.valeur),
    perimetre: p.perimetre,
    produitIds: p.produitIds,
    dateDebut: p.dateDebut.slice(0, 10),
    dateFin: p.dateFin.slice(0, 10),
  };
}

export function PromotionsScreen() {
  const { showSuccess, showError } = useToast();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalEtat>(null);
  const [form, setForm] = useState<FormulairePromo>(FORM_VIDE);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflits, setConflits] = useState<Promotion[]>([]);
  const [produitsDispo, setProduitsDispo] = useState<{ id: string; modeleKey: string; motif: string; reference: string; taille: string }[]>([]);
  const [rechercheProduits, setRechercheProduits] = useState("");

  async function charger() {
    setLoading(true);
    try {
      const res = await window.maxiEquip.promotionsLister();
      if (res.success && res.data) setPromotions(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void charger();
    void window.maxiEquip.listProduits().then((produits) => {
      setProduitsDispo(
        produits.map((p) => ({
          id: p.id,
          modeleKey: p.modeleId ?? p.motif,
          motif: p.motif,
          reference: p.reference,
          taille: p.taille,
        }))
      );
    });
  }, []);

  // Regroupe par modèle (motif) — sélectionner 30-50 références parmi une
  // centaine devient gérable via une case "tout sélectionner ce modèle"
  // plutôt qu'un clic par référence. Filtré par la recherche (motif OU
  // référence), insensible à la casse.
  const groupesProduits = (() => {
    const q = rechercheProduits.trim().toLowerCase();
    const filtres = q
      ? produitsDispo.filter((p) => p.motif.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q))
      : produitsDispo;

    const parGroupe = new Map<string, { motif: string; produits: typeof produitsDispo }>();
    for (const p of filtres) {
      const existant = parGroupe.get(p.modeleKey);
      if (existant) existant.produits.push(p);
      else parGroupe.set(p.modeleKey, { motif: p.motif, produits: [p] });
    }
    return [...parGroupe.entries()]
      .map(([modeleKey, g]) => ({ modeleKey, ...g }))
      .sort((a, b) => a.motif.localeCompare(b.motif, "fr"));
  })();

  function ouvrirCreer() {
    setForm(FORM_VIDE);
    setErreurs({});
    setConflits([]);
    setModal({ mode: "creer" });
  }

  function ouvrirModifier(promotion: Promotion) {
    setForm(promotionVersFormulaire(promotion));
    setErreurs({});
    setConflits([]);
    setModal({ mode: "modifier", promotion });
  }

  function ouvrirSupprimer(promotion: Promotion) {
    setModal({ mode: "supprimer", promotion });
  }

  function validerForm(): boolean {
    const errs: Record<string, string> = {};
    if (!form.libelle.trim()) errs.libelle = "Le libellé est obligatoire.";
    if (!form.valeur || isNaN(Number(form.valeur)) || Number(form.valeur) <= 0) {
      errs.valeur = "La valeur doit être un nombre strictement positif.";
    } else if (form.typeReduction === "pourcentage" && Number(form.valeur) > 100) {
      errs.valeur = "Un pourcentage ne peut pas dépasser 100.";
    }
    if (!form.dateDebut) errs.dateDebut = "La date de début est obligatoire.";
    if (!form.dateFin) errs.dateFin = "La date de fin est obligatoire.";
    if (form.dateDebut && form.dateFin && form.dateDebut >= form.dateFin) {
      errs.dateFin = "La date de fin doit être strictement postérieure à la date de début.";
    }
    if (form.perimetre === "cible" && form.produitIds.length === 0) {
      errs.produitIds = "Sélectionnez au moins un produit.";
    }
    setErreurs(errs);
    return Object.keys(errs).length === 0;
  }

  async function sauvegarder() {
    if (!validerForm()) return;
    setSaving(true);
    setConflits([]);
    try {
      const payload = {
        libelle: form.libelle.trim(),
        typeReduction: form.typeReduction,
        valeur: Number(form.valeur),
        perimetre: form.perimetre,
        produitIds: form.perimetre === "global" ? [] : form.produitIds,
        dateDebut: new Date(form.dateDebut).toISOString(),
        dateFin: new Date(form.dateFin + "T23:59:59").toISOString(),
      };

      let res: { success: boolean; data?: Promotion; message?: string; conflits?: Promotion[] };
      if (modal?.mode === "modifier") {
        res = await window.maxiEquip.promotionsModifier(modal.promotion.id, payload);
      } else {
        res = await window.maxiEquip.promotionsCreer(payload);
      }

      if (res.success && res.data) {
        showSuccess(
          modal?.mode === "modifier" ? "Promotion modifiée" : "Promotion créée",
          modal?.mode === "modifier" ? "La promotion a été mise à jour." : "La promotion a été enregistrée."
        );
        setModal(null);
        void charger();
      } else if (res.conflits && res.conflits.length > 0) {
        setConflits(res.conflits);
      } else {
        showError("Erreur", res.message ?? "Une erreur s'est produite.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function supprimer() {
    if (modal?.mode !== "supprimer") return;
    setSaving(true);
    try {
      const res = await window.maxiEquip.promotionsSupprimer(modal.promotion.id);
      if (res.success) {
        showSuccess("Promotion supprimée", "La promotion a été supprimée.");
        setModal(null);
        void charger();
      } else {
        showError("Erreur", res.message ?? "Impossible de supprimer la promotion.");
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleProduit(id: string) {
    setForm((f) => ({
      ...f,
      produitIds: f.produitIds.includes(id) ? f.produitIds.filter((p) => p !== id) : [...f.produitIds, id],
    }));
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  };

  const modalStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: defaultTokens.radius.md,
    padding: 28,
    width: 520,
    maxWidth: "95vw",
    maxHeight: "90vh",
    overflowY: "auto",
  };

  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: defaultTokens.colors.text }}>
            Promotions
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: defaultTokens.colors.textSoft }}>
            Gérez les réductions applicables automatiquement lors des ventes.
          </p>
        </div>
        <Button variant="primary" onClick={ouvrirCreer}>
          <Plus size={16} />
          Nouvelle promotion
        </Button>
      </div>

      {loading ? (
        <p style={{ color: defaultTokens.colors.textSoft, fontSize: 14 }}>Chargement…</p>
      ) : promotions.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <Tag size={40} color={defaultTokens.colors.textSoft} style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, color: defaultTokens.colors.textSoft, fontSize: 14 }}>
            Aucune promotion configurée. Créez la première ci-dessus.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {promotions.map((p) => (
            <Card key={p.id} style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: defaultTokens.colors.text }}>{p.libelle}</span>
                  <BadgeStatut promotion={p} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: defaultTokens.colors.accent,
                      background: defaultTokens.colors.accentSoft,
                      padding: "2px 8px",
                      borderRadius: defaultTokens.radius.sm,
                    }}
                  >
                    {formaterReduction(p.typeReduction, p.valeur)}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft, display: "flex", gap: 16 }}>
                  <span>{p.perimetre === "global" ? "Tous produits" : `${p.produitIds.length} produit(s) ciblé(s)`}</span>
                  <span>
                    {formaterDate(p.dateDebut)} → {formaterDate(p.dateFin)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Button variant="ghost" onClick={() => ouvrirModifier(p)} title="Modifier">
                  <Pencil size={15} />
                </Button>
                <Button variant="ghost" onClick={() => ouvrirSupprimer(p)} title="Supprimer" style={{ color: defaultTokens.colors.danger }}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal création/modification */}
      {(modal?.mode === "creer" || modal?.mode === "modifier") && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                {modal.mode === "creer" ? "Nouvelle promotion" : "Modifier la promotion"}
              </h2>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {conflits.length > 0 && (
              <div
                style={{
                  background: "#fef3c7",
                  border: `1px solid #f59e0b`,
                  borderRadius: defaultTokens.radius.sm,
                  padding: "10px 14px",
                  marginBottom: 16,
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <AlertTriangle size={16} color="#92400e" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#92400e" }}>
                    Conflit de planification
                  </p>
                  <p style={{ margin: 0, fontSize: 12.5, color: "#92400e" }}>
                    {conflits.length} promotion(s) existante(s) couvrent déjà cette période pour les mêmes produits :{" "}
                    {conflits.map((c) => c.libelle).join(", ")}.
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Libellé *</label>
                <input
                  style={erreurs.libelle ? inputErrStyle : inputStyle}
                  value={form.libelle}
                  onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                  placeholder="ex. Soldes été 2026"
                  maxLength={100}
                />
                {erreurs.libelle && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: defaultTokens.colors.danger }}>{erreurs.libelle}</p>}
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Type de réduction *</label>
                  <select
                    style={inputStyle}
                    value={form.typeReduction}
                    onChange={(e) => setForm((f) => ({ ...f, typeReduction: e.target.value as TypeReductionPromotion }))}
                  >
                    <option value="pourcentage">Pourcentage (%)</option>
                    <option value="montant_fixe">Montant fixe (FCFA)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>
                    Valeur * {form.typeReduction === "pourcentage" ? "(0-100%)" : "(FCFA)"}
                  </label>
                  <input
                    style={erreurs.valeur ? inputErrStyle : inputStyle}
                    type="number"
                    min={0.01}
                    max={form.typeReduction === "pourcentage" ? 100 : undefined}
                    step={form.typeReduction === "pourcentage" ? 0.1 : 1}
                    value={form.valeur}
                    onChange={(e) => setForm((f) => ({ ...f, valeur: e.target.value }))}
                    placeholder={form.typeReduction === "pourcentage" ? "ex. 15" : "ex. 2000"}
                  />
                  {erreurs.valeur && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: defaultTokens.colors.danger }}>{erreurs.valeur}</p>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Date de début *</label>
                  <input
                    style={erreurs.dateDebut ? inputErrStyle : inputStyle}
                    type="date"
                    value={form.dateDebut}
                    onChange={(e) => setForm((f) => ({ ...f, dateDebut: e.target.value }))}
                  />
                  {erreurs.dateDebut && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: defaultTokens.colors.danger }}>{erreurs.dateDebut}</p>}
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Date de fin *</label>
                  <input
                    style={erreurs.dateFin ? inputErrStyle : inputStyle}
                    type="date"
                    value={form.dateFin}
                    onChange={(e) => setForm((f) => ({ ...f, dateFin: e.target.value }))}
                  />
                  {erreurs.dateFin && <p style={{ margin: "3px 0 0", fontSize: 11.5, color: defaultTokens.colors.danger }}>{erreurs.dateFin}</p>}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Périmètre *</label>
                <div style={{ display: "flex", gap: 12 }}>
                  {(["global", "cible"] as const).map((p) => (
                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5 }}>
                      <input
                        type="radio"
                        name="perimetre"
                        value={p}
                        checked={form.perimetre === p}
                        onChange={() => setForm((f) => ({ ...f, perimetre: p }))}
                      />
                      {p === "global" ? "Tous les produits" : "Produits sélectionnés"}
                    </label>
                  ))}
                </div>
              </div>

              {form.perimetre === "cible" && (
                <div>
                  <label style={labelStyle}>Produits ciblés *</label>
                  {erreurs.produitIds && (
                    <p style={{ margin: "0 0 4px", fontSize: 11.5, color: defaultTokens.colors.danger }}>{erreurs.produitIds}</p>
                  )}
                  <input
                    type="text"
                    value={rechercheProduits}
                    onChange={(e) => setRechercheProduits(e.target.value)}
                    placeholder="Rechercher un motif ou une référence…"
                    style={{ ...inputStyle, marginBottom: 6, fontSize: 13, padding: "7px 10px" }}
                  />
                  <div
                    style={{
                      border: `1px solid ${erreurs.produitIds ? defaultTokens.colors.danger : defaultTokens.colors.border}`,
                      borderRadius: defaultTokens.radius.sm,
                      maxHeight: 280,
                      overflowY: "auto",
                      background: "#fafafa",
                    }}
                  >
                    {groupesProduits.length === 0 ? (
                      <p style={{ padding: "10px 12px", margin: 0, fontSize: 13, color: defaultTokens.colors.textSoft }}>
                        {produitsDispo.length === 0 ? "Aucun produit disponible." : "Aucun résultat pour cette recherche."}
                      </p>
                    ) : (
                      groupesProduits.map((groupe) => {
                        const idsGroupe = groupe.produits.map((p) => p.id);
                        const nbSelectionnes = idsGroupe.filter((id) => form.produitIds.includes(id)).length;
                        const touSelectionnes = nbSelectionnes === idsGroupe.length;

                        function toggleGroupe() {
                          setForm((f) => {
                            const sansGroupe = f.produitIds.filter((id) => !idsGroupe.includes(id));
                            return { ...f, produitIds: touSelectionnes ? sansGroupe : [...sansGroupe, ...idsGroupe] };
                          });
                        }

                        return (
                          <div key={groupe.modeleKey} style={{ borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                            <label
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 12px",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 700,
                                background: defaultTokens.colors.surfaceAlt,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={touSelectionnes}
                                ref={(el) => {
                                  if (el) el.indeterminate = nbSelectionnes > 0 && !touSelectionnes;
                                }}
                                onChange={toggleGroupe}
                              />
                              {groupe.motif}
                              <span style={{ fontWeight: 400, color: defaultTokens.colors.textFaint, fontSize: 11.5 }}>
                                ({nbSelectionnes}/{idsGroupe.length})
                              </span>
                            </label>
                            {groupe.produits.map((prod) => (
                              <label
                                key={prod.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "6px 12px 6px 30px",
                                  cursor: "pointer",
                                  fontSize: 12.5,
                                  background: form.produitIds.includes(prod.id) ? defaultTokens.colors.accentSoft : "transparent",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={form.produitIds.includes(prod.id)}
                                  onChange={() => toggleProduit(prod.id)}
                                />
                                <span style={{ fontFamily: defaultTokens.typography.mono, color: defaultTokens.colors.textSoft }}>{prod.reference}</span>
                                <span style={{ color: defaultTokens.colors.textFaint }}>{prod.taille}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {form.produitIds.length > 0 && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.textSoft }}>
                      {form.produitIds.length} produit(s) sélectionné(s)
                    </p>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <Button variant="ghost" onClick={() => setModal(null)} disabled={saving}>
                Annuler
              </Button>
              <Button variant="primary" onClick={() => void sauvegarder()} loading={saving}>
                {modal.mode === "creer" ? "Créer la promotion" : "Enregistrer les modifications"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal suppression */}
      {modal?.mode === "supprimer" && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, width: 420 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>Supprimer la promotion</h2>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: defaultTokens.colors.text }}>
              Supprimer <strong>« {modal.promotion.libelle} »</strong> ? Les ventes déjà effectuées avec cette promotion conservent leur prix promo enregistré — seules les nouvelles ventes ne l'appliqueront plus.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button variant="ghost" onClick={() => setModal(null)} disabled={saving}>
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={() => void supprimer()}
                loading={saving}
                style={{ background: defaultTokens.colors.danger, borderColor: defaultTokens.colors.danger }}
              >
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
