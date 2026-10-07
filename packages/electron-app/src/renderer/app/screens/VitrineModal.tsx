import { useEffect, useMemo, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { X, Star, Plus, ChevronUp, ChevronDown, ImageOff } from "lucide-react";
import type { ModeleProduitAvecVariantes } from "../../../preload/index.js";

export interface VitrineModalProps {
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Vitrine du site public (correction "choisir quels carreaux s'affichent
 * en première page", 2026-10-07) — sans ça, la mosaïque d'accueil du
 * site prenait simplement les modèles les plus récents, sans aucun
 * moyen de choisir manuellement lesquels mettre en avant une fois le
 * catalogue volumineux (100 modèles, tous avec une image).
 *
 * Sélection ET ordre : deux colonnes, "Disponibles" (tous les modèles
 * actifs non sélectionnés) et "Dans la vitrine" (les modèles choisis,
 * dans l'ordre d'affichage réel sur le site — position 0 en haut).
 * Un seul enregistrement envoie la liste complète ordonnée (voir
 * ModeleRepository.definirVitrine) : retirer un modèle de la colonne de
 * droite le retire réellement de la vitrine, jamais seulement un ajout.
 */
export function VitrineModal({ onClose, onSaved }: VitrineModalProps) {
  const { showSuccess, showError } = useToast();
  const [modeles, setModeles] = useState<ModeleProduitAvecVariantes[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const liste = await window.maxiEquip.listModelesProduits();
      const actifs = liste.filter((m) => !m.deletedAt);
      setModeles(actifs);
      setSelection(
        actifs
          .filter((m) => m.ordreVitrine !== null)
          .sort((a, b) => a.ordreVitrine! - b.ordreVitrine!)
          .map((m) => m.id)
      );
      setLoading(false);
    })();
  }, []);

  const parId = useMemo(() => new Map(modeles.map((m) => [m.id, m])), [modeles]);
  const disponibles = modeles.filter((m) => !selection.includes(m.id));

  function ajouter(id: string) {
    setSelection((s) => [...s, id]);
  }
  function retirer(id: string) {
    setSelection((s) => s.filter((x) => x !== id));
  }
  function deplacer(index: number, direction: -1 | 1) {
    setSelection((s) => {
      const cible = index + direction;
      if (cible < 0 || cible >= s.length) return s;
      const copie = [...s];
      [copie[index], copie[cible]] = [copie[cible]!, copie[index]!];
      return copie;
    });
  }

  async function handleEnregistrer() {
    setSaving(true);
    try {
      const resultat = await window.maxiEquip.definirVitrineModeles(selection);
      if (resultat.success) {
        showSuccess("Vitrine mise à jour", `${selection.length} modèle(s) affiché(s) sur la page d'accueil du site.`);
        onSaved();
        onClose();
      } else {
        showError("Enregistrement impossible", resultat.message ?? "Une erreur est survenue.");
      }
    } catch (err) {
      showError("Enregistrement impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
      <Card elevated style={{ width: "min(760px, 94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Star size={16} color={defaultTokens.colors.accent} />
            <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Vitrine du site</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Fermer">
            <X size={17} color={defaultTokens.colors.textFaint} />
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
          Choisis quels carreaux apparaissent en priorité sur la page d'accueil du site, et dans quel ordre. Les
          carreaux non sélectionnés restent visibles dans le catalogue complet du site, seule la page d'accueil est
          concernée.
        </p>

        {loading ? (
          <p style={{ fontSize: 13, color: defaultTokens.colors.textSoft }}>Chargement…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                Disponibles ({disponibles.length})
              </div>
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                {disponibles.length === 0 && <p style={{ fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Tous les modèles sont dans la vitrine.</p>}
                {disponibles.map((m) => (
                  <LigneModele key={m.id} modele={m}>
                    <Button variant="secondary" onClick={() => ajouter(m.id)} style={{ padding: "6px 9px" }} aria-label="Ajouter à la vitrine">
                      <Plus size={14} />
                    </Button>
                  </LigneModele>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
                Dans la vitrine, dans l'ordre ({selection.length})
              </div>
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
                {selection.length === 0 && <p style={{ fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Aucun modèle sélectionné — le site retombera sur son tri par défaut.</p>}
                {selection.map((id, index) => {
                  const m = parId.get(id);
                  if (!m) return null;
                  return (
                    <LigneModele key={id} modele={m}>
                      <div style={{ display: "flex", gap: 3 }}>
                        <Button variant="secondary" onClick={() => deplacer(index, -1)} disabled={index === 0} style={{ padding: "6px 8px" }} aria-label="Monter">
                          <ChevronUp size={14} />
                        </Button>
                        <Button variant="secondary" onClick={() => deplacer(index, 1)} disabled={index === selection.length - 1} style={{ padding: "6px 8px" }} aria-label="Descendre">
                          <ChevronDown size={14} />
                        </Button>
                        <Button variant="secondary" onClick={() => retirer(id)} style={{ padding: "6px 8px" }} aria-label="Retirer de la vitrine">
                          <X size={14} />
                        </Button>
                      </div>
                    </LigneModele>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Button variant="secondary" onClick={onClose} disabled={saving} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button onClick={() => void handleEnregistrer()} loading={saving} disabled={loading} style={{ flex: 1 }}>
            Enregistrer
          </Button>
        </div>
      </Card>
    </div>
  );
}

function LigneModele({ modele, children }: { modele: ModeleProduitAvecVariantes; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 9px",
        borderRadius: defaultTokens.radius.sm,
        border: `1px solid ${defaultTokens.colors.borderSoft}`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: defaultTokens.radius.sm,
          overflow: "hidden",
          background: defaultTokens.colors.surfaceAlt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {modele.imagePrincipaleDataUrl ? (
          <img src={modele.imagePrincipaleDataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ImageOff size={14} color={defaultTokens.colors.textFaint} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{modele.motif}</div>
        <div style={{ fontSize: 11, color: defaultTokens.colors.textFaint }}>{modele.type}</div>
      </div>
      {children}
    </div>
  );
}
