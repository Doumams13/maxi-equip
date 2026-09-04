import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { defaultTokens } from "../tokens.js";

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
}

/**
 * Champ combinant suggestions existantes et saisie libre — jamais une
 * liste fermée. Utilisé pour les champs métier "Type" et "Taille" du
 * catalogue (cahier des charges §4) : l'utilisateur peut choisir une
 * valeur déjà utilisée, filtrer en tapant, ou saisir une valeur
 * entièrement nouvelle, qui est toujours acceptée.
 *
 * Implémenté comme composant réel du Design System (pas une balise
 * <datalist> native) pour pouvoir respecter précisément les tokens de
 * couleur, bordure, focus et espacement — la liste déroulante d'un
 * <datalist> natif ne peut pas être stylée par le navigateur.
 */
export function Combobox({ value, onChange, suggestions, placeholder, id }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length === 0 ? suggestions : suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectValue(v: string) {
    onChange(v);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlighted]) {
        e.preventDefault();
        selectValue(filtered[highlighted]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "9px 32px 9px 12px",
            borderRadius: defaultTokens.radius.sm,
            border: `1px solid ${open ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
            boxShadow: open ? defaultTokens.shadows.focusRing : "none",
            fontFamily: defaultTokens.typography.body,
            fontSize: 13.5,
            outline: "none",
          }}
        />
        <ChevronDown
          size={15}
          color={defaultTokens.colors.textFaint}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        />
      </div>

      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 180,
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
          {filtered.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                selectValue(s);
              }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: "7px 10px",
                borderRadius: defaultTokens.radius.sm,
                background: i === highlighted ? defaultTokens.colors.accentSoft : "transparent",
                color: defaultTokens.colors.text,
                fontSize: 13.5,
                cursor: "pointer",
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
