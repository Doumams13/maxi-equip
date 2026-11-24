import { defaultTokens } from "@maxi-equip/design-system";
import type { ScreenId } from "../Shell.js";

/**
 * Onglets en tête d'écran (2026-11-24, allègement du menu) — plusieurs
 * écrans EXISTANTS partagent une seule entrée de menu (ex. Stock = Entrées
 * de stock + Transferts). Chaque onglet est un vrai écran (ScreenId) :
 * changer d'onglet navigue simplement vers lui, donc toutes les
 * redirections existantes (ex. "Convertir en vente" depuis un devis)
 * continuent d'ouvrir le bon onglet sans logique supplémentaire.
 */
export interface OngletEcran {
  id: ScreenId;
  label: string;
}

export function OngletsEcran({ onglets, actif, onChoisir }: { onglets: OngletEcran[]; actif: ScreenId; onChoisir: (id: ScreenId) => void }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, padding: "14px 24px 0", borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
      {onglets.map(({ id, label }) => {
        const estActif = id === actif;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={estActif}
            onClick={() => onChoisir(id)}
            style={{
              padding: "9px 16px",
              border: "none",
              borderBottom: `3px solid ${estActif ? defaultTokens.colors.accent : "transparent"}`,
              marginBottom: -1,
              background: "transparent",
              color: estActif ? defaultTokens.colors.text : defaultTokens.colors.textSoft,
              fontWeight: estActif ? 700 : 500,
              fontSize: 14,
              fontFamily: defaultTokens.typography.body,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
