import { defaultTokens } from "@maxi-equip/design-system";
import { Plus, X } from "lucide-react";
import type { CaracteristiqueEntry, SousCategorieChamp } from "@maxi-equip/shared-types";

/**
 * Éditeur de caractéristiques en paires clé/valeur — fondations
 * quincaillerie (Phase 2). Jamais un formulaire par famille de produit
 * (décision explicite du client, voir shared-types/caracteristiques.ts)
 * — un seul éditeur générique, réutilisable pour n'importe quelle
 * sous-catégorie.
 *
 * Fondations quincaillerie (Phase 3 bis) — `champs` (optionnel, la
 * configuration de la sous-catégorie courante) adapte automatiquement
 * le champ de saisie par entrée : un nombre pour `type:"nombre"`, une
 * liste déroulante pour `type:"liste"` (options = `valeursAutorisees`),
 * texte libre sinon ou pour toute entrée ad hoc/legacy sans
 * correspondance — jamais un formulaire différent par sous-catégorie,
 * uniquement ce même composant piloté par la configuration.
 */
export interface CaracteristiquesEditorProps {
  value: CaracteristiqueEntry[];
  onChange: (next: CaracteristiqueEntry[]) => void;
  champs?: SousCategorieChamp[];
}

function trouverChamp(champs: SousCategorieChamp[], cle: string): SousCategorieChamp | undefined {
  const normalise = cle.trim().toLowerCase();
  if (!normalise) return undefined;
  return champs.find((c) => c.nom.trim().toLowerCase() === normalise);
}

const champStyle: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "7px 9px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 12.5,
};

export function CaracteristiquesEditor({ value, onChange, champs = [] }: CaracteristiquesEditorProps) {
  function majLigne(index: number, champ: "cle" | "valeur", texte: string) {
    onChange(value.map((e, i) => (i === index ? { ...e, [champ]: texte } : e)));
  }

  function supprimerLigne(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function ajouterLigne() {
    onChange([...value, { cle: "", valeur: "" }]);
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 4 }}>
        Caractéristiques (optionnel)
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {value.map((entry, i) => {
          const champConfigure = trouverChamp(champs, entry.cle);
          return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              style={{ ...champStyle, width: 130 }}
              value={entry.cle}
              onChange={(e) => majLigne(i, "cle", e.target.value)}
              placeholder="Ex. Diamètre"
            />
            {champConfigure?.type === "liste" ? (
              <select style={{ ...champStyle, flex: 1 }} value={entry.valeur} onChange={(e) => majLigne(i, "valeur", e.target.value)}>
                <option value="">— Choisir —</option>
                {(champConfigure.valeursAutorisees ?? []).map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                style={{ ...champStyle, flex: 1 }}
                type={champConfigure?.type === "nombre" ? "number" : "text"}
                value={entry.valeur}
                onChange={(e) => majLigne(i, "valeur", e.target.value)}
                placeholder={champConfigure?.uniteMesure ? `Ex. 100 ${champConfigure.uniteMesure}` : "Ex. 100 mm"}
              />
            )}
            {champConfigure?.obligatoire && (
              <span title="Caractéristique obligatoire" style={{ color: defaultTokens.colors.danger, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                *
              </span>
            )}
            <button
              type="button"
              onClick={() => supprimerLigne(i)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
              aria-label="Retirer cette caractéristique"
            >
              <X size={14} color={defaultTokens.colors.danger} />
            </button>
          </div>
          );
        })}
        <button
          type="button"
          onClick={ajouterLigne}
          style={{
            display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer",
            padding: "4px 0", fontSize: 12, fontWeight: 600, color: defaultTokens.colors.accent, alignSelf: "flex-start",
          }}
        >
          <Plus size={12} />
          Ajouter une caractéristique
        </button>
      </div>
    </div>
  );
}
