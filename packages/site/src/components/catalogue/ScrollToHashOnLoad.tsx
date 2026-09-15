"use client";

import { useEffect } from "react";

/**
 * Correction "Défaut 2 / Défaut 5" — gère le défilement FLUIDE vers une
 * section du catalogue, dans les deux cas de figure :
 *  - arrivée depuis une autre page avec une ancre dans l'URL
 *    (ex. Accueil -> /catalogue#type-Faïence) : le navigateur positionne
 *    la page instantanément sur l'ancre avant même l'hydratation React,
 *    ce qui n'est jamais "fluide" ; ce composant complète ce saut brut par
 *    un vrai défilement animé une fois la page chargée ;
 *  - clic sur un type DEPUIS la page catalogue elle-même (ancre changée
 *    sans rechargement complet) : cet effet réagit aussi à ce cas via
 *    l'écouteur `hashchange`.
 *
 * Aucune modification de contenu, aucun effet visuel — un pur utilitaire
 * de navigation, jamais rendu à l'écran (retourne toujours null).
 */
export function ScrollToHashOnLoad({ legacyTypeParam }: { legacyTypeParam?: string } = {}) {
  useEffect(() => {
    function scrollVersAncre() {
      // Ancien lien `?type=X` (avant cette correction) : traité comme une
      // ancre `#type-X`, jamais comme un filtre — jamais un lien externe
      // ou un favori existant ne doit se retrouver silencieusement ignoré.
      const hash = window.location.hash || (legacyTypeParam ? `#type-${legacyTypeParam}` : "");
      if (!hash) return;
      const cible = document.getElementById(hash.slice(1));
      if (cible) {
        requestAnimationFrame(() => {
          cible.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }

    scrollVersAncre();
    window.addEventListener("hashchange", scrollVersAncre);
    return () => window.removeEventListener("hashchange", scrollVersAncre);
  }, [legacyTypeParam]);

  return null;
}
