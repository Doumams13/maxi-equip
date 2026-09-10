import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { defaultTokens } from "@maxi-equip/design-system";

/**
 * Pagination intelligente — correction "Amélioration de la pagination"
 * (Factures + Historique). Purement une amélioration d'AFFICHAGE :
 * chaque numéro cliqué appelle `onChangerPage(n)`, qui déclenche le même
 * rechargement serveur (LIMIT/OFFSET SQL) déjà en place — jamais un
 * chargement de toutes les pages en mémoire, jamais une pagination
 * recalculée côté React à partir d'une liste complète.
 *
 * Génère au maximum 5 numéros consécutifs autour de la page actuelle,
 * plus systématiquement la première et la dernière page avec une
 * ellipse entre les deux lorsqu'un écart existe — vérifié en isolation
 * sur les trois exemples exacts du prompt (page 1/50, 20/50, 50/50)
 * avant d'être intégré ici.
 */
function genererNumerosPages(courante: number, total: number): (number | "...")[] {
  const LARGEUR_FENETRE = 5;
  if (total <= LARGEUR_FENETRE + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const debut = Math.max(1, Math.min(courante - 2, total - LARGEUR_FENETRE + 1));
  const fin = Math.min(debut + LARGEUR_FENETRE - 1, total);
  const fenetre: number[] = [];
  for (let p = debut; p <= fin; p++) fenetre.push(p);

  const resultat: (number | "...")[] = [];
  if (debut > 1) {
    resultat.push(1);
    if (debut > 2) resultat.push("...");
  }
  resultat.push(...fenetre);
  if (fin < total) {
    if (fin < total - 1) resultat.push("...");
    resultat.push(total);
  }
  return resultat;
}

const boutonBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 32,
  height: 32,
  padding: "0 6px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  background: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  color: defaultTokens.colors.text,
};

export function PaginationIntelligente({
  page,
  totalPages,
  totalResultats,
  libelleUnite,
  onChangerPage,
}: {
  page: number;
  totalPages: number;
  totalResultats: number;
  libelleUnite: string;
  onChangerPage: (page: number) => void;
}) {
  const numeros = genererNumerosPages(page, totalPages);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={() => onChangerPage(1)}
          disabled={page <= 1}
          title="Première page"
          style={{ ...boutonBase, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          onClick={() => onChangerPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Page précédente"
          style={{ ...boutonBase, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
        >
          <ChevronLeft size={14} />
        </button>

        {numeros.map((n, i) =>
          n === "..." ? (
            <span key={`ellipse-${i}`} style={{ padding: "0 4px", color: defaultTokens.colors.textFaint, fontSize: 12.5 }}>
              …
            </span>
          ) : (
            <button
              key={n}
              onClick={() => onChangerPage(n)}
              aria-current={n === page}
              style={{
                ...boutonBase,
                border: `1px solid ${n === page ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
                background: n === page ? defaultTokens.colors.accent : "#fff",
                color: n === page ? "#fff" : defaultTokens.colors.text,
              }}
            >
              {n}
            </button>
          )
        )}

        <button
          onClick={() => onChangerPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title="Page suivante"
          style={{ ...boutonBase, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => onChangerPage(totalPages)}
          disabled={page >= totalPages}
          title="Dernière page"
          style={{ ...boutonBase, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
      <span style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>
        Page {page} sur {totalPages} ({totalResultats} {libelleUnite})
      </span>
    </div>
  );
}
