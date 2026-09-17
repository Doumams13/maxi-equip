import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Star, Trash2, ImagePlus, ImageOff } from "lucide-react";

interface ImageAffichable {
  id: string;
  estPrincipale: boolean;
  ordre: number;
  dataUrl: string | null;
}

export interface ImagesModalProps {
  modeleId: string;
  modeleMotif: string;
  onClose: () => void;
  onImagesChanged: () => void;
}

/**
 * Galerie d'images d'un modèle de carreau — images partagées par toutes les
 * variantes du même motif. Toutes les opérations passent par IPC.
 */
export function ImagesModal({ modeleId, modeleMotif, onClose, onImagesChanged }: ImagesModalProps) {
  const { showSuccess, showError } = useToast();
  const [images, setImages] = useState<ImageAffichable[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const list = await window.maxiEquip.listImages(modeleId);
    setImages(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, [modeleId]);

  async function handleAdd() {
    setAdding(true);
    try {
      const result = await window.maxiEquip.pickAndAddImages(modeleId);
      if (result.success) {
        if (result.added && result.added > 0) {
          showSuccess("Images ajoutées", `${result.added} image(s) ajoutée(s) au modèle.`);
          await refresh();
          onImagesChanged();
        }
      } else {
        showError("Ajout impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[images] ajout impossible :", err);
      showError("Ajout impossible", "Une erreur inattendue s'est produite.");
    } finally {
      setAdding(false);
    }
  }

  async function handleSetPrincipale(imageId: string) {
    await window.maxiEquip.setImagePrincipale(modeleId, imageId);
    showSuccess("Image principale mise à jour", "Cette image sera utilisée comme miniature.");
    await refresh();
    onImagesChanged();
  }

  async function handleRemove(imageId: string) {
    await window.maxiEquip.removeImage(imageId);
    showSuccess("Image supprimée", "L'image a été retirée du modèle.");
    await refresh();
    onImagesChanged();
  }

  const principale = images.find((i) => i.estPrincipale) ?? null;
  const autres = images.filter((i) => !i.estPrincipale);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card elevated style={{ width: "min(560px, 92vw)", maxHeight: "80vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 17 }}>Images — {modeleMotif}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Fermer">
            <X size={18} color={defaultTokens.colors.textFaint} />
          </button>
        </div>

        {loading ? (
          <p style={{ color: defaultTokens.colors.textSoft }}>Chargement…</p>
        ) : (
          <>
            <div
              style={{
                width: "100%",
                height: 220,
                borderRadius: defaultTokens.radius.md,
                background: defaultTokens.colors.surfaceAlt,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                marginBottom: 14,
              }}
            >
              {principale?.dataUrl ? (
                <img src={principale.dataUrl} alt={`Carreau ${modeleMotif}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: defaultTokens.colors.textFaint }}>
                  <ImageOff size={28} />
                  <span style={{ fontSize: 13 }}>Aucune image</span>
                </div>
              )}
            </div>

            {autres.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {autres.map((img) => (
                  <div key={img.id} style={{ position: "relative" }}>
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: defaultTokens.radius.sm,
                        overflow: "hidden",
                        background: defaultTokens.colors.surfaceAlt,
                        border: `1px solid ${defaultTokens.colors.border}`,
                      }}
                    >
                      {img.dataUrl && (
                        <img src={img.dataUrl} alt={`Vue supplémentaire — ${modeleMotif}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 3, marginTop: 4, justifyContent: "center" }}>
                      <button
                        onClick={() => void handleSetPrincipale(img.id)}
                        title="Définir comme image principale"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                      >
                        <Star size={14} color={defaultTokens.colors.warning} />
                      </button>
                      <button
                        onClick={() => void handleRemove(img.id)}
                        title="Supprimer cette image"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                      >
                        <Trash2 size={14} color={defaultTokens.colors.danger} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="secondary" loading={adding} onClick={() => void handleAdd()}>
              <ImagePlus size={15} />
              Ajouter des images
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
