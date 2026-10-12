import { useMemo, useState, useEffect, Fragment } from "react";
import { Card, Button, Combobox, ConfirmDialog, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, ImageOff, Images, Search, Star, X, ImagePlus, Pencil, Trash2, Circle, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type { ModeleProduitAvecVariantes, VarianteProduit, StagedImage } from "../../../preload/index.js";
import { ImagesModal } from "./ImagesModal.js";
import { VitrineModal } from "./VitrineModal.js";
import { PaginationIntelligente } from "../components/PaginationIntelligente.js";
import { useSurbrillanceOperation } from "../highlight.js";
import { pricing as domainPricing } from "@maxi-equip/domain";

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
        width: 48,
        height: 48,
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
        <ImageOff size={16} color={defaultTokens.colors.textFaint} />
      )}
    </div>
  );
}

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
        gap: 5,
        padding: "3px 8px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 11,
        fontWeight: 700,
        color: statut.color,
        background: statut.bg,
      }}
    >
      <Circle size={6} fill={statut.color} color={statut.color} />
      {statut.label}
    </span>
  );
}

function extraireDimensions(taille: string): { largeur: string; hauteur: string } | null {
  const match = taille.match(/(\d+(?:[.,]\d+)?)\D+(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return { largeur: match[1]!.replace(",", "."), hauteur: match[2]!.replace(",", ".") };
}

type VarianteForm = { id?: string; largeur: string; hauteur: string; reference: string; prix: string; carreauxParCarton: string; seuilAlerte: string };
function varianteFormVide(): VarianteForm {
  return { largeur: "", hauteur: "", reference: "", prix: "", carreauxParCarton: "", seuilAlerte: "10" };
}

/**
 * Surface d'un carton (m²) à partir d'un formulaire en cours de saisie —
 * `null` tant que largeur/hauteur/carreauxParCarton ne sont pas tous
 * renseignés (le prix de carton ne peut alors pas être calculé) —
 * correction "le prix de référence est au m²" (2026-10-08).
 */
function surfaceCartonForm(f: Pick<VarianteForm, "largeur" | "hauteur" | "carreauxParCarton">): number | null {
  const largeur = Number(f.largeur);
  const hauteur = Number(f.hauteur);
  const carreaux = Number(f.carreauxParCarton);
  if (!largeur || !hauteur || !carreaux) return null;
  return domainPricing.calculerSurfaceCartonM2(carreaux, largeur, hauteur);
}

/**
 * Formulaire inline d'édition/ajout d'UN format (ligne du tableau déplié
 * d'un modèle) — DOIT rester une fonction top-level (jamais imbriquée
 * dans ProduitsScreen) : un composant défini à l'intérieur d'un autre
 * composant est recréé (nouvelle identité de fonction) à chaque rendu du
 * parent, ce qui force React à démonter/remonter ce <tr> — et donc les
 * <input> qu'il contient — à chaque frappe, faisant perdre le focus dès
 * le premier caractère saisi (bug réel rapporté par l'utilisateur, 2026-10-09).
 */
function VarianteFormRow({
  modele,
  editingVariante,
  ajoutVarianteModeleId,
  varianteForm,
  setVarianteForm,
  savingVariante,
  onSave,
  onCancel,
}: {
  modele: ModeleProduitAvecVariantes;
  editingVariante: { modeleId: string; varianteId: string } | null;
  ajoutVarianteModeleId: string | null;
  varianteForm: VarianteForm;
  setVarianteForm: React.Dispatch<React.SetStateAction<VarianteForm>>;
  savingVariante: boolean;
  onSave: (modele: ModeleProduitAvecVariantes) => void;
  onCancel: () => void;
}) {
  const isEdit = editingVariante?.modeleId === modele.id;
  const isAdd = ajoutVarianteModeleId === modele.id;
  if (!isEdit && !isAdd) return null;
  return (
    <tr style={{ background: defaultTokens.colors.accentSoft + "44", borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
      <td colSpan={6} style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Largeur (cm)</label>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={1}
              value={varianteForm.largeur}
              onChange={(e) => setVarianteForm((f) => ({ ...f, largeur: e.target.value }))}
              placeholder="60"
            />
          </div>
          <span style={{ paddingBottom: 8, color: defaultTokens.colors.textFaint, fontWeight: 700 }}>×</span>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Hauteur (cm)</label>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={1}
              value={varianteForm.hauteur}
              onChange={(e) => setVarianteForm((f) => ({ ...f, hauteur: e.target.value }))}
              placeholder="60"
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Référence</label>
            <input
              style={{ ...inputStyle, width: 120 }}
              value={varianteForm.reference}
              onChange={(e) => setVarianteForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="MB-6060"
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Carreaux/carton</label>
            <input
              style={{ ...inputStyle, width: 90 }}
              type="number"
              min={1}
              value={varianteForm.carreauxParCarton}
              onChange={(e) => setVarianteForm((f) => ({ ...f, carreauxParCarton: e.target.value }))}
              placeholder="4"
            />
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Prix / m² (FCFA)</label>
            <input
              style={{ ...inputStyle, width: 110 }}
              type="number"
              min={0}
              value={varianteForm.prix}
              onChange={(e) => setVarianteForm((f) => ({ ...f, prix: e.target.value }))}
            />
          </div>
          <div>
            {(() => {
              const surface = surfaceCartonForm(varianteForm);
              const prixM2 = Number(varianteForm.prix) || 0;
              const prixCarton = surface !== null && prixM2 ? domainPricing.calculerPrixCartonDepuisPrixM2(prixM2, surface) : null;
              return (
                <>
                  <label style={{ ...labelStyle, fontSize: 11 }}>Prix / carton (FCFA)</label>
                  <input
                    style={{ ...inputStyle, width: 110, opacity: surface === null ? 0.5 : 1 }}
                    type="number"
                    min={0}
                    disabled={surface === null}
                    title={surface === null ? "Renseignez largeur, hauteur et carreaux/carton pour activer ce champ" : undefined}
                    value={prixCarton !== null ? String(prixCarton) : ""}
                    onChange={(e) => {
                      if (surface === null) return;
                      const valeur = Number(e.target.value) || 0;
                      setVarianteForm((f) => ({ ...f, prix: valeur ? String(domainPricing.calculerPrixM2DepuisPrixCarton(valeur, surface)) : "" }));
                    }}
                  />
                </>
              );
            })()}
          </div>
          <div>
            <label style={{ ...labelStyle, fontSize: 11 }}>Seuil alerte</label>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={0}
              value={varianteForm.seuilAlerte}
              onChange={(e) => setVarianteForm((f) => ({ ...f, seuilAlerte: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Button loading={savingVariante} onClick={() => onSave(modele)}>
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              <X size={14} />
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function ProduitsScreen({ session: _session }: { session: { userId: string } }) {
  const { showSuccess, showWarning, showError } = useToast();
  const [modeles, setModeles] = useState<ModeleProduitAvecVariantes[]>([]);
  const [suggestions, setSuggestions] = useState<{ types: string[]; tailles: string[] }>({ types: [], tailles: [] });
  const [recherche, setRecherche] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Pagination de la liste des modèles — correction "pagination page
  // Carreaux" (2026-10-10), même principe que StockScreen : la liste
  // complète est déjà chargée en mémoire (listModelesProduits), le
  // découpage se fait donc côté client.
  const MODELES_PAR_PAGE = 10;
  const [pageCarreaux, setPageCarreaux] = useState(1);

  // Surbrillance du modèle tout juste modifié — correction "se perdre
  // après avoir enregistré une modification" (2026-10-10), d'autant plus
  // nécessaire depuis l'ajout de la pagination ci-dessus : le modèle
  // modifié peut désormais se trouver sur une autre page que celle
  // affichée au moment de l'édition. Même principe que l'historique des
  // mouvements (voir highlight.ts), réutilisé tel quel.
  const [modeleEnSurbrillance, setModeleEnSurbrillance] = useState<string | null>(null);

  // Formulaire modèle
  const [showModeleForm, setShowModeleForm] = useState(false);
  const [editingModeleId, setEditingModeleId] = useState<string | null>(null);
  const [modeleForm, setModeleForm] = useState({ motif: "", type: "" });
  const [variantesForm, setVariantesForm] = useState<VarianteForm[]>([varianteFormVide()]);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [principaleStagingId, setPrincipaleStagingId] = useState<string | null>(null);
  const [pickingImages, setPickingImages] = useState(false);
  const [savingModele, setSavingModele] = useState(false);
  const [showConfirmSaveModele, setShowConfirmSaveModele] = useState(false);

  // Formulaire variante (ajout/édition inline)
  const [ajoutVarianteModeleId, setAjoutVarianteModeleId] = useState<string | null>(null);
  const [editingVariante, setEditingVariante] = useState<{ modeleId: string; varianteId: string } | null>(null);
  const [varianteForm, setVarianteForm] = useState<VarianteForm>(varianteFormVide());
  const [savingVariante, setSavingVariante] = useState(false);

  // Confirmation suppression
  const [confirmDeleteModele, setConfirmDeleteModele] = useState<ModeleProduitAvecVariantes | null>(null);
  const [confirmDeleteVariante, setConfirmDeleteVariante] = useState<{ modele: ModeleProduitAvecVariantes; variante: VarianteProduit } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Images modal
  const [imagesModal, setImagesModal] = useState<{ modeleId: string; modeleMotif: string } | null>(null);

  // Vitrine du site (2026-10-07)
  const [showVitrineModal, setShowVitrineModal] = useState(false);

  async function refresh() {
    const [liste, sugg] = await Promise.all([window.maxiEquip.listModelesProduits(), window.maxiEquip.getCatalogueSuggestions()]);
    setModeles(liste);
    setSuggestions(sugg);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const modelesFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return modeles;
    return modeles.filter(
      (m) =>
        m.motif.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        m.variantes.some((v) => v.reference.toLowerCase().includes(q) || v.taille.toLowerCase().includes(q))
    );
  }, [modeles, recherche]);

  // Retrouve le modèle visé même si une recherche active le masquerait.
  useEffect(() => {
    if (!modeleEnSurbrillance) return;
    setRecherche("");
  }, [modeleEnSurbrillance]);

  // Bascule automatiquement sur la page où se trouve désormais le modèle
  // modifié, plutôt que de laisser l'utilisateur la chercher lui-même.
  useEffect(() => {
    if (!modeleEnSurbrillance) return;
    const index = modelesFiltres.findIndex((m) => m.id === modeleEnSurbrillance);
    if (index === -1) return;
    setPageCarreaux(Math.floor(index / MODELES_PAR_PAGE) + 1);
  }, [modeleEnSurbrillance, modelesFiltres]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetModeleForm() {
    setModeleForm({ motif: "", type: "" });
    setVariantesForm([varianteFormVide()]);
    setStagedImages([]);
    setPrincipaleStagingId(null);
    setEditingModeleId(null);
  }

  async function handleCloseModeleForm() {
    if (stagedImages.length > 0) {
      await window.maxiEquip.discardStagedImages(stagedImages.map((s) => s.stagingId));
    }
    resetModeleForm();
    setShowModeleForm(false);
  }

  function handleStartEditModele(m: ModeleProduitAvecVariantes) {
    setModeleForm({ motif: m.motif, type: m.type });
    setEditingModeleId(m.id);
    // Correction "Modifier doit rouvrir l'écran d'ajout avec les cases
    // préremplies" (2026-10-08) — jusqu'ici ce formulaire masquait
    // entièrement la section "Formats disponibles" en mode édition
    // (voir plus bas, {!editingModeleId && ...}) et la réinitialisait à
    // une ligne vide, perdant toute visibilité sur les tailles/prix déjà
    // enregistrés. Préremplie ici avec les formats réels du modèle.
    setVariantesForm(
      m.variantes.length > 0
        ? m.variantes.map((v) => {
            const dims = extraireDimensions(v.taille) ?? { largeur: "", hauteur: "" };
            return {
              id: v.id,
              largeur: dims.largeur,
              hauteur: dims.hauteur,
              reference: v.reference,
              prix: String(v.prix),
              carreauxParCarton: v.carreauxParCarton !== null ? String(v.carreauxParCarton) : "",
              seuilAlerte: String(v.seuilAlerte),
            };
          })
        : [varianteFormVide()]
    );
    setStagedImages([]);
    setPrincipaleStagingId(null);
    setShowModeleForm(true);
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
      const remaining = stagedImages.filter((s) => s.stagingId !== stagingId);
      setPrincipaleStagingId(remaining[0]?.stagingId ?? null);
    }
  }

  function handleOuvrirConfirmSaveModele(e: React.FormEvent) {
    e.preventDefault();
    if (!modeleForm.motif.trim()) {
      showWarning("Champs requis", "Le motif est obligatoire.");
      return;
    }
    if (!modeleForm.type.trim()) {
      showWarning("Champs requis", "Le type de carreau est obligatoire.");
      return;
    }
    const varInvalide = variantesForm.find((v) => !v.largeur || !v.hauteur || !v.reference.trim() || !v.prix);
    if (varInvalide) {
      showWarning("Champs requis", "Chaque format doit avoir une taille (L×H), une référence et un prix.");
      return;
    }
    setShowConfirmSaveModele(true);
  }

  async function handleConfirmerSaveModele() {
    setSavingModele(true);
    // Capturé AVANT handleCloseModeleForm() ci-dessous, qui réinitialise
    // editingModeleId via resetModeleForm() — jamais lu après coup.
    const modeleIdModifie = editingModeleId;
    try {
      if (editingModeleId) {
        const result = await window.maxiEquip.modifierModeleProduit(editingModeleId, { motif: modeleForm.motif, type: modeleForm.type });
        if (!result.success) throw new Error(result.message);
        // Correction "Modifier doit rouvrir l'écran d'ajout avec les
        // cases préremplies" (2026-10-08) — les formats affichés dans ce
        // même formulaire sont désormais réellement enregistrés : mise à
        // jour pour les lignes déjà existantes (v.id présent), création
        // pour les nouvelles lignes ajoutées pendant l'édition (v.id
        // absent). Jamais de suppression implicite ici — retirer un
        // format existant reste réservé au flux de suppression dédié
        // (bouton X masqué pour ces lignes-là, voir plus bas).
        for (const v of variantesForm) {
          const input = {
            taille: `${v.largeur} × ${v.hauteur} cm`,
            tailleTri: Number(v.largeur),
            largeur: Number(v.largeur),
            hauteur: Number(v.hauteur),
            reference: v.reference.trim(),
            prix: Number(v.prix),
            carreauxParCarton: v.carreauxParCarton ? Number(v.carreauxParCarton) : null,
            seuilAlerte: Number(v.seuilAlerte) || 0,
          };
          const resultVariante = v.id
            ? await window.maxiEquip.modifierVariante(v.id, input)
            : await window.maxiEquip.ajouterVariante(editingModeleId, input);
          if (!resultVariante.success) throw new Error(resultVariante.message);
        }
        showSuccess("Modèle modifié", `"${modeleForm.motif}" mis à jour.`);
      } else {
        const variantes = variantesForm.map((v) => ({
          taille: `${v.largeur} × ${v.hauteur} cm`,
          tailleTri: Number(v.largeur),
          largeur: Number(v.largeur),
          hauteur: Number(v.hauteur),
          reference: v.reference.trim(),
          prix: Number(v.prix),
          carreauxParCarton: v.carreauxParCarton ? Number(v.carreauxParCarton) : null,
          seuilAlerte: Number(v.seuilAlerte) || 0,
        }));
        const result = await window.maxiEquip.creerModeleProduit({
          motif: modeleForm.motif,
          type: modeleForm.type,
          variantes,
          stagedImages: stagedImages.map((s) => s.stagingId),
          principaleStagingId,
        });
        if (!result.success) throw new Error(result.message);
        showSuccess("Modèle créé", `"${modeleForm.motif}" ajouté au catalogue.`);
      }
      setShowConfirmSaveModele(false);
      await handleCloseModeleForm();
      await refresh();
      if (modeleIdModifie) setModeleEnSurbrillance(modeleIdModifie);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] enregistrement impossible :", err);
      showError(editingModeleId ? "Modification impossible" : "Création impossible", "Une erreur inattendue s'est produite. Vérifiez que les références ne sont pas déjà utilisées.");
    } finally {
      setSavingModele(false);
    }
  }

  async function handleSupprimerModele() {
    if (!confirmDeleteModele) return;
    setDeleting(true);
    try {
      await window.maxiEquip.supprimerModeleProduit(confirmDeleteModele.id);
      showSuccess("Modèle supprimé", `"${confirmDeleteModele.motif}" retiré du catalogue.`);
      setConfirmDeleteModele(null);
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] suppression modèle impossible :", err);
      showError("Suppression impossible", "Une erreur inattendue s'est produite.");
    } finally {
      setDeleting(false);
    }
  }

  function handleStartAjoutVariante(modeleId: string) {
    setAjoutVarianteModeleId(modeleId);
    setEditingVariante(null);
    setVarianteForm(varianteFormVide());
    setExpanded((prev) => new Set([...prev, modeleId]));
  }

  function handleStartEditVariante(modele: ModeleProduitAvecVariantes, variante: VarianteProduit) {
    const dims = extraireDimensions(variante.taille) ?? { largeur: "", hauteur: "" };
    setVarianteForm({
      largeur: dims.largeur,
      hauteur: dims.hauteur,
      reference: variante.reference,
      prix: String(variante.prix),
      carreauxParCarton: variante.carreauxParCarton !== null ? String(variante.carreauxParCarton) : "",
      seuilAlerte: String(variante.seuilAlerte),
    });
    setEditingVariante({ modeleId: modele.id, varianteId: variante.id });
    setAjoutVarianteModeleId(null);
    setExpanded((prev) => new Set([...prev, modele.id]));
  }

  async function handleSauvegarderVariante(modele: ModeleProduitAvecVariantes) {
    const v = varianteForm;
    if (!v.largeur || !v.hauteur || !v.reference.trim() || !v.prix) {
      showWarning("Champs requis", "Taille (L×H), référence et prix sont obligatoires.");
      return;
    }
    setSavingVariante(true);
    try {
      const input = {
        taille: `${v.largeur} × ${v.hauteur} cm`,
        tailleTri: Number(v.largeur),
        largeur: Number(v.largeur),
        hauteur: Number(v.hauteur),
        reference: v.reference.trim(),
        prix: Number(v.prix),
        carreauxParCarton: v.carreauxParCarton ? Number(v.carreauxParCarton) : null,
        seuilAlerte: Number(v.seuilAlerte) || 0,
      };
      if (editingVariante) {
        const result = await window.maxiEquip.modifierVariante(editingVariante.varianteId, input);
        if (!result.success) throw new Error(result.message);
        showSuccess("Format modifié", `Format "${input.taille}" mis à jour.`);
        setEditingVariante(null);
      } else {
        const result = await window.maxiEquip.ajouterVariante(modele.id, input);
        if (!result.success) throw new Error(result.message);
        showSuccess("Format ajouté", `Format "${input.taille}" ajouté à "${modele.motif}".`);
        setAjoutVarianteModeleId(null);
      }
      setVarianteForm(varianteFormVide());
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] variante impossible :", err);
      showError("Erreur", "Une erreur inattendue s'est produite. Vérifiez que la référence n'est pas déjà utilisée.");
    } finally {
      setSavingVariante(false);
    }
  }

  async function handleSupprimerVariante() {
    if (!confirmDeleteVariante) return;
    setDeleting(true);
    try {
      await window.maxiEquip.supprimerVariante(confirmDeleteVariante.variante.id);
      showSuccess("Format supprimé", `Le format "${confirmDeleteVariante.variante.taille}" a été retiré.`);
      setConfirmDeleteVariante(null);
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[produits] suppression variante impossible :", err);
      showError("Suppression impossible", "Une erreur inattendue s'est produite.");
    } finally {
      setDeleting(false);
    }
  }

  const totalPagesCarreaux = Math.max(1, Math.ceil(modelesFiltres.length / MODELES_PAR_PAGE));
  const pageCarreauxActuelle = Math.min(pageCarreaux, totalPagesCarreaux);
  const modelesPage = modelesFiltres.slice((pageCarreauxActuelle - 1) * MODELES_PAR_PAGE, pageCarreauxActuelle * MODELES_PAR_PAGE);

  // La cible n'est transmise au hook QUE si elle est réellement présente
  // sur la page actuellement affichée — garantit que la ligne existe déjà
  // dans le DOM quand le défilement/surbrillance s'applique (voir
  // HistoriqueOperationsTable, même principe).
  const modeleCibleActif = modeleEnSurbrillance && modelesPage.some((m) => m.id === modeleEnSurbrillance) ? modeleEnSurbrillance : null;
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(modeleCibleActif, () => setModeleEnSurbrillance(null));

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: 0 }}>Carreaux</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={() => setShowVitrineModal(true)}>
            <Star size={16} />
            Vitrine du site
          </Button>
          <Button
            onClick={() => {
              if (showModeleForm) {
                void handleCloseModeleForm();
              } else {
                resetModeleForm();
                setShowModeleForm(true);
              }
            }}
          >
            {showModeleForm ? <X size={16} /> : <Plus size={16} />}
            {showModeleForm ? "Annuler" : "Nouveau modèle"}
          </Button>
        </div>
      </div>

      {showModeleForm && (
        <Card style={{ marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>
            {editingModeleId ? "Modifier le modèle" : "Nouveau modèle de carreau"}
          </h2>
          <form onSubmit={handleOuvrirConfirmSaveModele}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Motif / Nom du modèle</label>
                <input style={inputStyle} value={modeleForm.motif} onChange={(e) => setModeleForm((f) => ({ ...f, motif: e.target.value }))} placeholder="Ex. Marbre Blanc" />
              </div>
              <div>
                <label style={labelStyle}>Type de carreau</label>
                <Combobox value={modeleForm.type} onChange={(v) => setModeleForm((f) => ({ ...f, type: v }))} suggestions={suggestions.types} placeholder="Ex. Grès cérame" />
              </div>
            </div>

            <>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: defaultTokens.colors.text }}>
                  Formats disponibles
                </h3>
                {variantesForm.map((v, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 16px auto auto auto auto auto 1fr", gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
                    <div>
                      <label style={labelStyle}>Largeur (cm)</label>
                      <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number" min={1}
                        value={v.largeur}
                        onChange={(e) => setVariantesForm((prev) => prev.map((x, j) => j === i ? { ...x, largeur: e.target.value } : x))}
                        placeholder="60"
                      />
                    </div>
                    <span style={{ paddingBottom: 10, fontWeight: 700, color: defaultTokens.colors.textFaint }}>×</span>
                    <div>
                      <label style={labelStyle}>Hauteur (cm)</label>
                      <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number" min={1}
                        value={v.hauteur}
                        onChange={(e) => setVariantesForm((prev) => prev.map((x, j) => j === i ? { ...x, hauteur: e.target.value } : x))}
                        placeholder="60"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Référence</label>
                      <input
                        style={{ ...inputStyle, width: 120 }}
                        value={v.reference}
                        onChange={(e) => setVariantesForm((prev) => prev.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))}
                        placeholder="MB-6060"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Prix / m² (FCFA)</label>
                      <input
                        style={{ ...inputStyle, width: 110 }}
                        type="number" min={0}
                        value={v.prix}
                        onChange={(e) => setVariantesForm((prev) => prev.map((x, j) => j === i ? { ...x, prix: e.target.value } : x))}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Carreaux/carton</label>
                      <input
                        style={{ ...inputStyle, width: 90 }}
                        type="number" min={1}
                        value={v.carreauxParCarton}
                        onChange={(e) => setVariantesForm((prev) => prev.map((x, j) => j === i ? { ...x, carreauxParCarton: e.target.value } : x))}
                        placeholder="4"
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Seuil alerte</label>
                      <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number" min={0}
                        value={v.seuilAlerte}
                        onChange={(e) => setVariantesForm((prev) => prev.map((x, j) => j === i ? { ...x, seuilAlerte: e.target.value } : x))}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      {/* Un format déjà existant (v.id présent) ne peut jamais être retiré d'ici — seul le flux de suppression dédié (confirmation, écoulement du stock) le permet. */}
                      {!v.id && (variantesForm.length > 1 || variantesForm.some((x) => x.id)) && (
                        <Button type="button" variant="ghost" onClick={() => setVariantesForm((prev) => prev.filter((_, j) => j !== i))}>
                          <X size={14} color={defaultTokens.colors.danger} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setVariantesForm((prev) => [...prev, varianteFormVide()])}
                  style={{ marginBottom: 16 }}
                >
                  <Plus size={14} />
                  Ajouter un format
                </Button>

                {/* Gestion des photos réservée à la création — en édition, passe par le bouton "Images" dédié par modèle (ImagesModal), jamais dupliquée ici (le flux d'enregistrement en édition ne traite pas stagedImages). */}
                {!editingModeleId && (
                <div style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, paddingTop: 14, marginBottom: 16 }}>
                  <label style={labelStyle}>Photos du carreau (motif)</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {stagedImages.map((img) => {
                      const estPrincipale = img.stagingId === principaleStagingId;
                      return (
                        <div key={img.stagingId} style={{ position: "relative" }}>
                          <div
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: defaultTokens.radius.sm,
                              overflow: "hidden",
                              border: `2px solid ${estPrincipale ? defaultTokens.colors.accent : defaultTokens.colors.borderSoft}`,
                            }}
                          >
                            <img src={img.dataUrl} alt="Photo sélectionnée" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
                            <button type="button" title="Principale" onClick={() => setPrincipaleStagingId(img.stagingId)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                              <Star size={12} color={estPrincipale ? defaultTokens.colors.warning : defaultTokens.colors.textFaint} fill={estPrincipale ? defaultTokens.colors.warning : "none"} />
                            </button>
                            <button type="button" title="Retirer" onClick={() => void handleRemoveStaged(img.stagingId)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                              <X size={12} color={defaultTokens.colors.danger} />
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
                      <div style={{ width: 72, height: 72, borderRadius: defaultTokens.radius.sm, background: defaultTokens.colors.surfaceAlt, border: `1px dashed ${defaultTokens.colors.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ImageOff size={18} color={defaultTokens.colors.textFaint} />
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="secondary" loading={pickingImages} onClick={() => void handlePickImages()}>
                    <ImagePlus size={14} />
                    {stagedImages.length > 0 ? "Ajouter d'autres photos" : "Choisir des photos"}
                  </Button>
                </div>
                )}
              </>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Button type="submit" loading={savingModele}>
                {editingModeleId ? "Enregistrer les modifications" : "Créer le modèle"}
              </Button>
              {!editingModeleId && (
                <Button type="button" variant="ghost" onClick={resetModeleForm}>
                  <RotateCcw size={14} />
                  Réinitialiser
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <div style={{ position: "relative", marginBottom: 14, maxWidth: 320 }}>
        <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          style={{ ...inputStyle, paddingLeft: 36 }}
          value={recherche}
          onChange={(e) => {
            setRecherche(e.target.value);
            setPageCarreaux(1);
          }}
          placeholder="Motif, type, référence, taille…"
        />
      </div>

      <Card padding={0}>
        {modelesFiltres.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>
            {modeles.length === 0 ? "Aucun modèle au catalogue pour l'instant." : "Aucun modèle ne correspond à cette recherche."}
          </p>
        ) : (
          <>
          <div ref={conteneurRef} style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                  <th style={{ width: 32, padding: "10px 8px 10px 16px" }} />
                  <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Photo</th>
                  <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Motif</th>
                  <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Référence</th>
                  <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Type</th>
                  <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12, textAlign: "right" }}>Formats</th>
                  <th style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12 }}>Images</th>
                  <th style={{ padding: "10px 16px" }} />
                </tr>
              </thead>
              <tbody>
                {modelesPage.map((m) => {
                  const isOpen = expanded.has(m.id);
                  const stockTotal = m.variantes.reduce((acc, v) => acc + v.stockTotal, 0);
                  return (
                    <Fragment key={m.id}>
                      <tr
                        data-operation-id={m.id}
                        style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, cursor: "pointer", ...styleSurbrillance(m.id) }}
                        onClick={() => toggleExpand(m.id)}
                      >
                        <td style={{ padding: "8px 4px 8px 16px", color: defaultTokens.colors.textFaint }}>
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td style={{ padding: "8px 16px" }}>
                          <Miniature dataUrl={m.imagePrincipaleDataUrl} />
                        </td>
                        <td style={{ padding: "8px 16px", fontWeight: 700 }}>{m.motif}</td>
                        <td
                          style={{
                            padding: "8px 16px",
                            color: defaultTokens.colors.textSoft,
                            fontFamily: defaultTokens.typography.mono,
                            fontSize: 12,
                          }}
                        >
                          {m.variantes.map((v) => v.reference).join(", ")}
                        </td>
                        <td style={{ padding: "8px 16px", color: defaultTokens.colors.textSoft }}>{m.type}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }}>
                          <span style={{ fontWeight: 700 }}>{m.variantes.length}</span>
                          <span style={{ color: defaultTokens.colors.textFaint, fontSize: 12, marginLeft: 4 }}>format{m.variantes.length !== 1 ? "s" : ""}</span>
                          <span style={{ marginLeft: 10, color: defaultTokens.colors.textFaint, fontSize: 12 }}>({stockTotal} ct. total)</span>
                        </td>
                        <td style={{ padding: "8px 16px" }}>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setImagesModal({ modeleId: m.id, modeleMotif: m.motif });
                            }}
                          >
                            <Images size={14} />
                            {m.nombreImages}
                          </Button>
                        </td>
                        <td style={{ padding: "8px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditModele(m);
                            }}
                            title="Modifier le modèle"
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteModele(m);
                            }}
                            title="Supprimer le modèle"
                          >
                            <Trash2 size={14} color={defaultTokens.colors.danger} />
                          </Button>
                        </td>
                      </tr>

                      {isOpen && (
                        <>
                          <tr style={{ background: defaultTokens.colors.surfaceAlt + "88" }}>
                            <td />
                            <td colSpan={7} style={{ padding: "0 16px" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                  <tr>
                                    <th style={{ padding: "8px 0", fontWeight: 600, color: defaultTokens.colors.textSoft, fontSize: 11, textAlign: "left" }}>Taille</th>
                                    <th style={{ padding: "8px 8px", fontWeight: 600, color: defaultTokens.colors.textSoft, fontSize: 11, textAlign: "left" }}>Référence</th>
                                    <th style={{ padding: "8px 8px", fontWeight: 600, color: defaultTokens.colors.textSoft, fontSize: 11, textAlign: "right" }}>Prix / m²</th>
                                    <th style={{ padding: "8px 8px", fontWeight: 600, color: defaultTokens.colors.textSoft, fontSize: 11, textAlign: "right" }}>Stock</th>
                                    <th style={{ padding: "8px 8px", fontWeight: 600, color: defaultTokens.colors.textSoft, fontSize: 11 }}>État</th>
                                    <th style={{ padding: "8px 0" }} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {m.variantes.map((v) => (
                                    <tr key={v.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                                      <td style={{ padding: "7px 0", fontWeight: 700 }}>{v.taille}</td>
                                      <td style={{ padding: "7px 8px", color: defaultTokens.colors.textSoft, fontFamily: defaultTokens.typography.mono, fontSize: 12 }}>{v.reference}</td>
                                      <td style={{ padding: "7px 8px", textAlign: "right" }}>
                                        {v.prix.toLocaleString("fr-FR")} FCFA
                                        {v.carreauxParCarton && v.largeur && v.hauteur && (
                                          <div style={{ fontSize: 10.5, color: defaultTokens.colors.textFaint, fontWeight: 400 }}>
                                            ≈ {domainPricing
                                              .calculerPrixCartonDepuisPrixM2(v.prix, domainPricing.calculerSurfaceCartonM2(v.carreauxParCarton, v.largeur, v.hauteur))
                                              .toLocaleString("fr-FR")}{" "}
                                            FCFA/carton
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700 }}>{v.stockTotal} ct.</td>
                                      <td style={{ padding: "7px 8px" }}>
                                        <StatutStock quantite={v.stockTotal} seuil={v.seuilAlerte} />
                                      </td>
                                      <td style={{ padding: "7px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                                        <Button
                                          variant="ghost"
                                          onClick={() => handleStartEditVariante(m, v)}
                                          title="Modifier ce format"
                                        >
                                          <Pencil size={13} />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          onClick={() => setConfirmDeleteVariante({ modele: m, variante: v })}
                                          title="Supprimer ce format"
                                        >
                                          <Trash2 size={13} color={defaultTokens.colors.danger} />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                  <VarianteFormRow
                                    modele={m}
                                    editingVariante={editingVariante}
                                    ajoutVarianteModeleId={ajoutVarianteModeleId}
                                    varianteForm={varianteForm}
                                    setVarianteForm={setVarianteForm}
                                    savingVariante={savingVariante}
                                    onSave={(mod) => void handleSauvegarderVariante(mod)}
                                    onCancel={() => {
                                      setAjoutVarianteModeleId(null);
                                      setEditingVariante(null);
                                      setVarianteForm(varianteFormVide());
                                    }}
                                  />
                                </tbody>
                              </table>
                            </td>
                          </tr>
                          <tr style={{ background: defaultTokens.colors.surfaceAlt + "88" }}>
                            <td />
                            <td colSpan={7} style={{ padding: "6px 16px 12px" }}>
                              {ajoutVarianteModeleId !== m.id && editingVariante?.modeleId !== m.id && (
                                <Button
                                  variant="ghost"
                                  onClick={() => handleStartAjoutVariante(m.id)}
                                  style={{ fontSize: 12 }}
                                >
                                  <Plus size={13} />
                                  Ajouter un format
                                </Button>
                              )}
                            </td>
                          </tr>
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPagesCarreaux > 1 && (
            <PaginationIntelligente
              page={pageCarreauxActuelle}
              totalPages={totalPagesCarreaux}
              totalResultats={modelesFiltres.length}
              libelleUnite="modèles"
              onChangerPage={setPageCarreaux}
            />
          )}
          </>
        )}
      </Card>

      {imagesModal && (
        <ImagesModal
          modeleId={imagesModal.modeleId}
          modeleMotif={imagesModal.modeleMotif}
          onClose={() => setImagesModal(null)}
          onImagesChanged={() => void refresh()}
        />
      )}

      {showVitrineModal && <VitrineModal onClose={() => setShowVitrineModal(false)} onSaved={() => void refresh()} />}

      {showConfirmSaveModele && (
        <ConfirmDialog
          title={editingModeleId ? "Confirmer la modification ?" : "Créer ce modèle de carreau ?"}
          resume={[
            { label: "Motif", value: modeleForm.motif },
            { label: "Type", value: modeleForm.type },
            ...(!editingModeleId
              ? [
                  { label: "Formats", value: variantesForm.map((v) => `${v.largeur}×${v.hauteur} cm — ${v.reference}`).join(", ") },
                  { label: "Photos", value: String(stagedImages.length) },
                ]
              : []),
          ]}
          onAnnuler={() => setShowConfirmSaveModele(false)}
          onConfirmer={() => void handleConfirmerSaveModele()}
          confirming={savingModele}
        />
      )}

      {confirmDeleteModele && (
        <ConfirmDialog
          title="Supprimer ce modèle ?"
          danger
          confirmLabel="Confirmer la suppression"
          resume={[
            { label: "Motif", value: confirmDeleteModele.motif },
            { label: "Type", value: confirmDeleteModele.type },
            { label: "Formats concernés", value: String(confirmDeleteModele.variantes.length) },
            // Correction "produit supprimé avec du stock restant" : le
            // stock n'est jamais laissé fantôme en base (voir
            // StockService.ecoulerStockPourSuppression) — une vraie sortie
            // traçable est enregistrée automatiquement pour chaque dépôt
            // concerné, montrée ici pour que l'utilisateur le sache AVANT
            // de confirmer, jamais une surprise découverte après coup.
            ...(confirmDeleteModele.variantes.reduce((s, v) => s + v.stockTotal, 0) > 0
              ? [{ label: "Stock restant", value: `${confirmDeleteModele.variantes.reduce((s, v) => s + v.stockTotal, 0)} carton(s) — seront sortis automatiquement du stock` }]
              : []),
          ]}
          onAnnuler={() => setConfirmDeleteModele(null)}
          onConfirmer={() => void handleSupprimerModele()}
          confirming={deleting}
        />
      )}

      {confirmDeleteVariante && (
        <ConfirmDialog
          title="Supprimer ce format ?"
          danger
          confirmLabel="Confirmer la suppression"
          resume={[
            { label: "Modèle", value: confirmDeleteVariante.modele.motif },
            { label: "Taille", value: confirmDeleteVariante.variante.taille },
            { label: "Référence", value: confirmDeleteVariante.variante.reference },
            ...(confirmDeleteVariante.variante.stockTotal > 0
              ? [{ label: "Stock restant", value: `${confirmDeleteVariante.variante.stockTotal} carton(s) — seront sortis automatiquement du stock` }]
              : []),
          ]}
          onAnnuler={() => setConfirmDeleteVariante(null)}
          onConfirmer={() => void handleSupprimerVariante()}
          confirming={deleting}
        />
      )}
    </div>
  );
}
