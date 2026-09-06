import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { defaultTokens } from "@maxi-equip/design-system";

const DUREE_SURBRILLANCE_MS = 2600;

/**
 * Défilement + mise en évidence temporaire d'une ligne/carte retrouvée
 * via la navigation cliquable (Consolidation §16-§21). Basée sur le vert
 * de la charte MAXI EQUIP, non agressive, disparaît progressivement.
 *
 * `cibleId` : identifiant de l'opération à retrouver (ou null si aucune
 * navigation en attente). Dès qu'un élément portant `data-operation-id`
 * égal à `cibleId` est présent dans le DOM, il est centré à l'écran et
 * mis en évidence quelques secondes, puis `onAppliquee` est appelé pour
 * que l'écran appelant efface la cible (évite de re-déclencher l'effet
 * à chaque rendu).
 */
export function useSurbrillanceOperation(cibleId: string | null, onAppliquee: () => void) {
  const [idEnSurbrillance, setIdEnSurbrillance] = useState<string | null>(null);
  const conteneurRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cibleId) return;
    const conteneur = conteneurRef.current;
    if (!conteneur) return;
    const element = conteneur.querySelector<HTMLElement>(`[data-operation-id="${CSS.escape(cibleId)}"]`);
    if (!element) {
      // La cible n'est pas (encore) dans le DOM — par exemple un filtre
      // actif la masque. On efface la demande plutôt que de rester dans
      // un état d'attente indéfini ; l'écran appelant est responsable de
      // réinitialiser ses filtres si besoin avant d'appeler la navigation.
      onAppliquee();
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setIdEnSurbrillance(cibleId);
    const timer = setTimeout(() => {
      setIdEnSurbrillance(null);
      onAppliquee();
    }, DUREE_SURBRILLANCE_MS);
    return () => clearTimeout(timer);
  }, [cibleId]);

  function styleSurbrillance(operationId: string): CSSProperties {
    if (operationId !== idEnSurbrillance) return {};
    return {
      background: defaultTokens.colors.accentSoft,
      boxShadow: `inset 0 0 0 1px ${defaultTokens.colors.accent}`,
      transition: "background 1.8s ease, box-shadow 1.8s ease",
    };
  }

  return { conteneurRef, styleSurbrillance };
}
