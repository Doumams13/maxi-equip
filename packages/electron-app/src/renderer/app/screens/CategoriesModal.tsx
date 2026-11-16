import { useEffect, useState } from "react";
import { Card, Button, ConfirmDialog, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Plus, Trash2, Pencil, Check, ImagePlus, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { Categorie, SousCategorie, SousCategorieChamp } from "../../../preload/index.js";
import { UNITES_VENTE, type UniteVente, type TypeChampCaracteristique, type ConfigurationUnitesSousCategorie } from "@maxi-equip/shared-types";

export interface CategoriesModalProps {
  onClose: () => void;
  onSaved: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 10px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13,
};

/**
 * Gestion des catégories/sous-catégories — fondations quincaillerie
 * (Phase 2). Administrable depuis l'application, jamais codé en dur
 * dans le code source. Même patron que VitrineModal.tsx (modale
 * pleine-largeur, deux colonnes), même permission que le reste de la
 * gestion catalogue (aucune fonction de permission dédiée).
 */
export function CategoriesModal({ onClose, onSaved }: CategoriesModalProps) {
  const { showError } = useToast();
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [sousCategories, setSousCategories] = useState<SousCategorie[]>([]);
  const [categorieSelectionneeId, setCategorieSelectionneeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nouvelleCategorie, setNouvelleCategorie] = useState("");
  const [nouvelleSousCategorie, setNouvelleSousCategorie] = useState("");
  const [renommageCategorieId, setRenommageCategorieId] = useState<string | null>(null);
  const [renommageValeur, setRenommageValeur] = useState("");
  const [confirmSuppressionCategorie, setConfirmSuppressionCategorie] = useState<Categorie | null>(null);
  const [confirmSuppressionSousCategorie, setConfirmSuppressionSousCategorie] = useState<SousCategorie | null>(null);
  // Phase 5 (référentiel commun), sous-phase 5.6 — confirmation renforcée, UNIQUEMENT pour un champ obligatoire (voir handleSupprimerChamp).
  const [confirmSuppressionChampObligatoire, setConfirmSuppressionChampObligatoire] = useState<SousCategorieChamp | null>(null);
  const [aChange, setAChange] = useState(false);

  // Champs de caractéristiques suggérés par sous-catégorie.
  const [champsParSousCategorie, setChampsParSousCategorie] = useState<Record<string, SousCategorieChamp[]>>({});
  const [sousCategorieChampsOuverte, setSousCategorieChampsOuverte] = useState<string | null>(null);
  const [nouveauChampNom, setNouveauChampNom] = useState("");
  const [nouveauChampType, setNouveauChampType] = useState<TypeChampCaracteristique>("texte");
  const [nouveauChampObligatoire, setNouveauChampObligatoire] = useState(false);
  const [nouveauChampValeursAutorisees, setNouveauChampValeursAutorisees] = useState("");
  const [nouveauChampUniteMesure, setNouveauChampUniteMesure] = useState("");

  // Fondations quincaillerie (Phase 3 bis) — unités de vente autorisées par sous-catégorie.
  const [unitesParSousCategorie, setUnitesParSousCategorie] = useState<Record<string, ConfigurationUnitesSousCategorie>>({});
  const [uniteEditionSousCategorieId, setUniteEditionSousCategorieId] = useState<string | null>(null);
  const [uniteBrouillon, setUniteBrouillon] = useState<Set<UniteVente>>(new Set());

  async function recharger() {
    const [cats, sousCats, champsGroupes, unitesGroupes] = await Promise.all([
      window.maxiEquip.listerCategories(),
      window.maxiEquip.listerSousCategories(),
      window.maxiEquip.listerChampsSousCategories(),
      window.maxiEquip.listerUnitesSousCategories(),
    ]);
    setCategories(cats);
    setSousCategories(sousCats);
    setChampsParSousCategorie(champsGroupes);
    setUnitesParSousCategorie(unitesGroupes);
    setLoading(false);
  }

  async function handleCreerChamp(sousCategorieId: string) {
    if (!nouveauChampNom.trim()) return;
    const valeursAutorisees =
      nouveauChampType === "liste"
        ? nouveauChampValeursAutorisees.split(",").map((v) => v.trim()).filter((v) => v.length > 0)
        : null;
    const resultat = await window.maxiEquip.creerChampSousCategorie({
      sousCategorieId,
      nom: nouveauChampNom.trim(),
      type: nouveauChampType,
      obligatoire: nouveauChampObligatoire,
      valeursAutorisees,
      uniteMesure: nouveauChampUniteMesure.trim() || null,
    });
    if (!resultat.success) {
      showError("Création impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setNouveauChampNom("");
    setNouveauChampType("texte");
    setNouveauChampObligatoire(false);
    setNouveauChampValeursAutorisees("");
    setNouveauChampUniteMesure("");
    setAChange(true);
    await recharger();
  }

  async function handleToggleObligatoireChamp(champ: SousCategorieChamp) {
    const resultat = await window.maxiEquip.modifierChampSousCategorie(champ.id, { obligatoire: !champ.obligatoire });
    if (!resultat.success) {
      showError("Modification impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setAChange(true);
    await recharger();
  }

  /**
   * Phase 5 (référentiel commun), sous-phase 5.6 — un champ OBLIGATOIRE
   * exige une confirmation renforcée distincte (voir
   * confirmSuppressionChampObligatoire/handleConfirmerSuppressionChampObligatoire
   * ci-dessous) : ouvre le dialogue au lieu de supprimer directement. Un
   * champ facultatif conserve le comportement normal (suppression
   * immédiate, toujours en tombstone côté main — voir
   * SousCategorieChampRepository.delete).
   */
  async function handleSupprimerChamp(champ: SousCategorieChamp) {
    if (champ.obligatoire) {
      setConfirmSuppressionChampObligatoire(champ);
      return;
    }
    const resultat = await window.maxiEquip.supprimerChampSousCategorie(champ.id);
    if (!resultat.success) {
      showError("Suppression impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setAChange(true);
    await recharger();
  }

  async function handleConfirmerSuppressionChampObligatoire() {
    if (!confirmSuppressionChampObligatoire) return;
    const resultat = await window.maxiEquip.supprimerChampSousCategorie(confirmSuppressionChampObligatoire.id, true);
    if (!resultat.success) {
      showError("Suppression impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setConfirmSuppressionChampObligatoire(null);
    setAChange(true);
    await recharger();
  }

  // Fondations quincaillerie (Phase 3 bis) — unités de vente autorisées.
  function demarrerEditionUnites(sousCategorieId: string) {
    const config = unitesParSousCategorie[sousCategorieId] ?? { configuree: false, unites: [] };
    const depart = config.configuree ? config.unites : UNITES_VENTE.map((u) => u.valeur);
    setUniteBrouillon(new Set(depart));
    setUniteEditionSousCategorieId(sousCategorieId);
  }

  function basculerUniteBrouillon(unite: UniteVente) {
    setUniteBrouillon((prev) => {
      const next = new Set(prev);
      if (next.has(unite)) next.delete(unite);
      else next.add(unite);
      return next;
    });
  }

  async function handleEnregistrerUnites(sousCategorieId: string) {
    const resultat = await window.maxiEquip.definirUnitesSousCategorie(sousCategorieId, [...uniteBrouillon]);
    if (!resultat.success) {
      // Ex. "au moins une unité" si tout est décoché — jamais enregistré, voir domain/catalogue.
      showError("Configuration impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setUniteEditionSousCategorieId(null);
    setAChange(true);
    await recharger();
  }

  async function handleReinitialiserUnites(sousCategorieId: string) {
    const resultat = await window.maxiEquip.reinitialiserUnitesSousCategorie(sousCategorieId);
    if (!resultat.success) {
      showError("Réinitialisation impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setUniteEditionSousCategorieId(null);
    setAChange(true);
    await recharger();
  }

  useEffect(() => {
    void recharger();
  }, []);

  const sousCategoriesDeLaCategorie = sousCategories.filter((sc) => sc.categorieId === categorieSelectionneeId);

  async function handleCreerCategorie() {
    if (!nouvelleCategorie.trim()) return;
    const resultat = await window.maxiEquip.creerCategorie({ nom: nouvelleCategorie.trim() });
    if (!resultat.success) {
      showError("Création impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setNouvelleCategorie("");
    setAChange(true);
    await recharger();
  }

  async function handleRenommerCategorie(id: string) {
    if (!renommageValeur.trim()) return;
    const resultat = await window.maxiEquip.modifierCategorie(id, { nom: renommageValeur.trim() });
    if (!resultat.success) {
      showError("Modification impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setRenommageCategorieId(null);
    setAChange(true);
    await recharger();
  }

  async function handleChoisirImage(categorie: Categorie) {
    const resultat = await window.maxiEquip.pickFilesToStaging();
    if (!resultat.success || !resultat.staged || resultat.staged.length === 0) {
      if (!resultat.success) showError("Sélection impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    // Réutilise le mécanisme de "staging" déjà existant (ImagesModal) pour
    // obtenir une data URL à partir d'un fichier choisi par l'utilisateur
    // — jamais engagée via commitStagedImages (réservé aux images de
    // modèle) : l'image est capturée directement dans la ligne catégorie,
    // puis le fichier temporaire de staging est aussitôt libéré.
    const image = resultat.staged[0]!;
    const maj = await window.maxiEquip.modifierCategorie(categorie.id, { imageDataUrl: image.dataUrl });
    await window.maxiEquip.discardStagedImages([image.stagingId]);
    if (!maj.success) {
      showError("Mise à jour impossible", maj.message ?? "Une erreur est survenue.");
      return;
    }
    setAChange(true);
    await recharger();
  }

  async function handleSupprimerCategorie() {
    if (!confirmSuppressionCategorie) return;
    const resultat = await window.maxiEquip.supprimerCategorie(confirmSuppressionCategorie.id);
    if (!resultat.success) {
      showError("Suppression impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    if (categorieSelectionneeId === confirmSuppressionCategorie.id) setCategorieSelectionneeId(null);
    setConfirmSuppressionCategorie(null);
    setAChange(true);
    await recharger();
  }

  async function handleCreerSousCategorie() {
    if (!categorieSelectionneeId || !nouvelleSousCategorie.trim()) return;
    const resultat = await window.maxiEquip.creerSousCategorie({ categorieId: categorieSelectionneeId, nom: nouvelleSousCategorie.trim() });
    if (!resultat.success) {
      showError("Création impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setNouvelleSousCategorie("");
    setAChange(true);
    await recharger();
  }

  async function handleSupprimerSousCategorie() {
    if (!confirmSuppressionSousCategorie) return;
    const resultat = await window.maxiEquip.supprimerSousCategorie(confirmSuppressionSousCategorie.id);
    if (!resultat.success) {
      showError("Suppression impossible", resultat.message ?? "Une erreur est survenue.");
      return;
    }
    setConfirmSuppressionSousCategorie(null);
    setAChange(true);
    await recharger();
  }

  function handleFermer() {
    if (aChange) onSaved();
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 260 }}>
      <Card elevated style={{ width: "min(760px, 94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Catégories du catalogue</h2>
          <button onClick={handleFermer} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Fermer">
            <X size={17} color={defaultTokens.colors.textFaint} />
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
          Organise le catalogue en catégories (ex. "Plomberie et évacuation") et sous-catégories (ex. "Tuyaux") — aucune
          limite, aucune liste figée : ajoute ce dont tu as besoin.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: defaultTokens.colors.textSoft }}>Chargement…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                Catégories ({categories.length})
              </div>
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4, flex: 1 }}>
                {categories.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setCategorieSelectionneeId(c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: defaultTokens.radius.sm, cursor: "pointer",
                      border: `1px solid ${categorieSelectionneeId === c.id ? defaultTokens.colors.accent : defaultTokens.colors.borderSoft}`,
                      background: categorieSelectionneeId === c.id ? defaultTokens.colors.accentSoft + "44" : "transparent",
                    }}
                  >
                    {renommageCategorieId === c.id ? (
                      <>
                        <input
                          autoFocus
                          style={{ ...inputStyle, flex: 1 }}
                          value={renommageValeur}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenommageValeur(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && void handleRenommerCategorie(c.id)}
                        />
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); void handleRenommerCategorie(c.id); }} style={{ padding: "5px 7px" }}>
                          <Check size={13} />
                        </Button>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            width: 28, height: 28, borderRadius: defaultTokens.radius.sm, overflow: "hidden", flexShrink: 0,
                            background: defaultTokens.colors.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          {c.imageDataUrl && <img src={c.imageDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.nom}</span>
                        <span style={{ fontSize: 11, color: defaultTokens.colors.textFaint }}>{c.nombreProduits}</span>
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); void handleChoisirImage(c); }} style={{ padding: "5px 7px" }} title="Choisir une image">
                          <ImagePlus size={12} />
                        </Button>
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); setRenommageCategorieId(c.id); setRenommageValeur(c.nom); }} style={{ padding: "5px 7px" }}>
                          <Pencil size={12} />
                        </Button>
                        <Button variant="ghost" onClick={(e) => { e.stopPropagation(); setConfirmSuppressionCategorie(c); }} style={{ padding: "5px 7px" }}>
                          <Trash2 size={12} color={defaultTokens.colors.danger} />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input
                  style={inputStyle}
                  value={nouvelleCategorie}
                  onChange={(e) => setNouvelleCategorie(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleCreerCategorie()}
                  placeholder="Nouvelle catégorie"
                />
                <Button variant="secondary" onClick={() => void handleCreerCategorie()} style={{ padding: "6px 9px" }}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                Sous-catégories {categorieSelectionneeId ? `(${sousCategoriesDeLaCategorie.length})` : ""}
              </div>
              {!categorieSelectionneeId ? (
                <p style={{ fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Sélectionne une catégorie à gauche.</p>
              ) : (
                <>
                  <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4, flex: 1 }}>
                    {sousCategoriesDeLaCategorie.map((sc) => {
                      const ouverte = sousCategorieChampsOuverte === sc.id;
                      const champsDeCetteSousCategorie = champsParSousCategorie[sc.id] ?? [];
                      return (
                        <div key={sc.id} style={{ borderRadius: defaultTokens.radius.sm, border: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px" }}>
                            <button
                              onClick={() => setSousCategorieChampsOuverte(ouverte ? null : sc.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
                              title="Champs de caractéristiques suggérés"
                            >
                              {ouverte ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <span style={{ flex: 1, fontSize: 13 }}>{sc.nom}</span>
                            {champsDeCetteSousCategorie.length > 0 && (
                              <span style={{ fontSize: 10.5, color: defaultTokens.colors.textFaint }}>{champsDeCetteSousCategorie.length} champ{champsDeCetteSousCategorie.length !== 1 ? "s" : ""}</span>
                            )}
                            <span style={{ fontSize: 11, color: defaultTokens.colors.textFaint }}>{sc.nombreProduits}</span>
                            <Button variant="ghost" onClick={() => setConfirmSuppressionSousCategorie(sc)} style={{ padding: "5px 7px" }}>
                              <Trash2 size={12} color={defaultTokens.colors.danger} />
                            </Button>
                          </div>
                          {ouverte && (
                            <div style={{ padding: "0 9px 9px 30px", display: "flex", flexDirection: "column", gap: 6 }}>
                              <p style={{ margin: 0, fontSize: 11, color: defaultTokens.colors.textFaint }}>
                                Champs suggérés à la saisie d'un produit de cette sous-catégorie :
                              </p>
                              {champsDeCetteSousCategorie.map((champ) => (
                                <div key={champ.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ flex: 1, fontSize: 12.5 }}>
                                    {champ.nom}
                                    <span style={{ color: defaultTokens.colors.textFaint, fontWeight: 400 }}>
                                      {" "}({champ.type}
                                      {champ.uniteMesure ? `, ${champ.uniteMesure}` : ""})
                                    </span>
                                  </span>
                                  <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, color: defaultTokens.colors.textFaint, whiteSpace: "nowrap" }}>
                                    <input type="checkbox" checked={champ.obligatoire} onChange={() => void handleToggleObligatoireChamp(champ)} />
                                    Obligatoire
                                  </label>
                                  <Button variant="ghost" onClick={() => void handleSupprimerChamp(champ)} style={{ padding: "4px 6px" }}>
                                    <X size={11} color={defaultTokens.colors.danger} />
                                  </Button>
                                </div>
                              ))}
                              <div style={{ display: "flex", gap: 6 }}>
                                <input
                                  style={{ ...inputStyle, fontSize: 12.5, padding: "5px 8px" }}
                                  value={nouveauChampNom}
                                  onChange={(e) => setNouveauChampNom(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && nouveauChampType !== "liste" && void handleCreerChamp(sc.id)}
                                  placeholder="Ex. Diamètre"
                                />
                                <select
                                  style={{ ...inputStyle, fontSize: 12.5, padding: "5px 6px", width: 90 }}
                                  value={nouveauChampType}
                                  onChange={(e) => setNouveauChampType(e.target.value as TypeChampCaracteristique)}
                                >
                                  <option value="texte">Texte</option>
                                  <option value="nombre">Nombre</option>
                                  <option value="liste">Liste</option>
                                </select>
                                <Button variant="secondary" onClick={() => void handleCreerChamp(sc.id)} style={{ padding: "4px 7px" }}>
                                  <Plus size={12} />
                                </Button>
                              </div>
                              {nouveauChampType === "liste" && (
                                <input
                                  style={{ ...inputStyle, fontSize: 12, padding: "4px 8px" }}
                                  value={nouveauChampValeursAutorisees}
                                  onChange={(e) => setNouveauChampValeursAutorisees(e.target.value)}
                                  placeholder="Valeurs autorisées, séparées par des virgules"
                                />
                              )}
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <input
                                  style={{ ...inputStyle, fontSize: 12, padding: "4px 8px", width: 100 }}
                                  value={nouveauChampUniteMesure}
                                  onChange={(e) => setNouveauChampUniteMesure(e.target.value)}
                                  placeholder="Unité (ex. mm)"
                                />
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
                                  <input type="checkbox" checked={nouveauChampObligatoire} onChange={(e) => setNouveauChampObligatoire(e.target.checked)} />
                                  Obligatoire
                                </label>
                              </div>

                              {/* Fondations quincaillerie (Phase 3 bis) — unités de vente autorisées. */}
                              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                                <p style={{ margin: "0 0 6px", fontSize: 11, color: defaultTokens.colors.textFaint }}>Unités de vente autorisées :</p>
                                {uniteEditionSousCategorieId === sc.id ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                      {UNITES_VENTE.map((u) => (
                                        <label key={u.valeur} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                                          <input type="checkbox" checked={uniteBrouillon.has(u.valeur)} onChange={() => basculerUniteBrouillon(u.valeur)} />
                                          {u.libelle}
                                        </label>
                                      ))}
                                    </div>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <Button variant="secondary" onClick={() => void handleEnregistrerUnites(sc.id)} style={{ padding: "4px 9px", fontSize: 12 }}>
                                        Enregistrer
                                      </Button>
                                      <Button variant="ghost" onClick={() => setUniteEditionSousCategorieId(null)} style={{ padding: "4px 9px", fontSize: 12 }}>
                                        Annuler
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  (() => {
                                    const config = unitesParSousCategorie[sc.id] ?? { configuree: false, unites: [] };
                                    return (
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>
                                          {config.configuree
                                            ? config.unites.map((u) => UNITES_VENTE.find((x) => x.valeur === u)?.libelle ?? u).join(", ")
                                            : "Aucune restriction — les 6 unités sont proposées"}
                                        </span>
                                        <Button variant="ghost" onClick={() => demarrerEditionUnites(sc.id)} style={{ padding: "4px 7px" }} title="Configurer les unités">
                                          <Pencil size={11} />
                                        </Button>
                                        {config.configuree && (
                                          <Button
                                            variant="ghost"
                                            onClick={() => void handleReinitialiserUnites(sc.id)}
                                            style={{ padding: "4px 7px" }}
                                            title="Revenir à : aucune restriction"
                                          >
                                            <RotateCcw size={11} />
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {sousCategoriesDeLaCategorie.length === 0 && <p style={{ fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Aucune sous-catégorie.</p>}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <input
                      style={inputStyle}
                      value={nouvelleSousCategorie}
                      onChange={(e) => setNouvelleSousCategorie(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void handleCreerSousCategorie()}
                      placeholder="Nouvelle sous-catégorie"
                    />
                    <Button variant="secondary" onClick={() => void handleCreerSousCategorie()} style={{ padding: "6px 9px" }}>
                      <Plus size={14} />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Button onClick={handleFermer} style={{ flex: 1 }}>
            Fermer
          </Button>
        </div>
      </Card>

      {confirmSuppressionCategorie && (
        <ConfirmDialog
          title="Supprimer cette catégorie ?"
          danger
          confirmLabel="Confirmer la suppression"
          resume={[
            { label: "Nom", value: confirmSuppressionCategorie.nom },
            { label: "Produits concernés", value: `${confirmSuppressionCategorie.nombreProduits} — resteront dans le catalogue, simplement non comptés dans cette catégorie` },
          ]}
          onAnnuler={() => setConfirmSuppressionCategorie(null)}
          onConfirmer={() => void handleSupprimerCategorie()}
        />
      )}

      {confirmSuppressionSousCategorie && (
        <ConfirmDialog
          title="Supprimer cette sous-catégorie ?"
          danger
          confirmLabel="Confirmer la suppression"
          resume={[
            { label: "Nom", value: confirmSuppressionSousCategorie.nom },
            { label: "Produits concernés", value: `${confirmSuppressionSousCategorie.nombreProduits} — resteront dans le catalogue, simplement non comptés dans cette sous-catégorie` },
          ]}
          onAnnuler={() => setConfirmSuppressionSousCategorie(null)}
          onConfirmer={() => void handleSupprimerSousCategorie()}
        />
      )}

      {confirmSuppressionChampObligatoire && (
        <ConfirmDialog
          title="Supprimer ce champ OBLIGATOIRE ?"
          danger
          confirmLabel="Je confirme la suppression de ce champ obligatoire"
          resume={[
            { label: "Champ", value: confirmSuppressionChampObligatoire.nom },
            { label: "Attention", value: "Ce champ est marqué obligatoire : il ne sera plus proposé ni exigé à la saisie d'un produit." },
            { label: "Produits existants", value: "Les valeurs déjà enregistrées sur les produits existants ne seront PAS supprimées." },
          ]}
          onAnnuler={() => setConfirmSuppressionChampObligatoire(null)}
          onConfirmer={() => void handleConfirmerSuppressionChampObligatoire()}
        />
      )}
    </div>
  );
}
