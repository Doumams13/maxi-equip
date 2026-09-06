import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { defaultTokens } from "@maxi-equip/design-system";
import type { Produit } from "@maxi-equip/shared-types";

export interface ProduitSelectorProps {
  produits: Produit[];
  value: string; // produitId sélectionné (ou "")
  onChange: (produitId: string) => void;
  placeholder?: string;
}

function libelle(p: Produit): string {
  return `${p.motif} — ${p.taille} — ${p.reference}`;
}

/**
 * Sélecteur de produit réutilisable — recherche + filtrage + sélection
 * (correction : "recherche dans les sélecteurs", un seul composant
 * commun plutôt que plusieurs correctifs dupliqués dans Entrée de stock,
 * Transfert et Vente). Filtre sur référence, motif, type ET taille —
 * pas limité à un seul champ. Le produit sélectionné reste toujours lié
 * à son véritable identifiant interne, jamais au texte saisi.
 */
export function ProduitSelector({ produits, value, onChange, placeholder }: ProduitSelectorProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectionne = produits.find((p) => p.id === value) ?? null;

  // Reflète la sélection externe (ex. réinitialisation du formulaire) tant que l'utilisateur n'est pas en train de chercher.
  useEffect(() => {
    if (!open) setQuery(selectionne ? libelle(selectionne) : "");
  }, [value, open, selectionne]);

  const q = query.trim().toLowerCase();
  const resultats =
    open && q.length > 0
      ? produits.filter((p) => p.reference.toLowerCase().includes(q) || p.motif.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) || p.taille.toLowerCase().includes(q))
      : produits;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selectionne ? libelle(selectionne) : "");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectionne]);

  function selectionner(p: Produit) {
    onChange(p.id);
    setQuery(libelle(p));
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, resultats.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && resultats[highlighted]) {
        e.preventDefault();
        selectionner(resultats[highlighted]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(0);
            if (e.target.value.trim() === "") onChange("");
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Rechercher un produit (référence, motif, type, taille)…"}
          autoComplete="off"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 32px 9px 30px",
            borderRadius: defaultTokens.radius.sm,
            border: `1px solid ${open ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
            boxShadow: open ? defaultTokens.shadows.focusRing : "none",
            fontFamily: defaultTokens.typography.body,
            fontSize: 13,
            outline: "none",
          }}
        />
        <ChevronDown size={14} color={defaultTokens.colors.textFaint} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
      </div>

      {open && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: "auto",
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "#fff",
            border: `1px solid ${defaultTokens.colors.border}`,
            borderRadius: defaultTokens.radius.sm,
            boxShadow: defaultTokens.shadows.card,
          }}
        >
          {resultats.length === 0 ? (
            <li style={{ padding: "10px 12px", fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Aucun produit ne correspond.</li>
          ) : (
            resultats.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectionner(p);
                }}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding: "8px 10px",
                  borderRadius: defaultTokens.radius.sm,
                  background: i === highlighted ? defaultTokens.colors.accentSoft : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: defaultTokens.colors.text }}>{p.motif}</div>
                <div style={{ fontSize: 11.5, color: defaultTokens.colors.textSoft }}>
                  {p.taille} · {p.reference} · {p.type}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
