"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type { ReactNode } from "react";
import type { CartLine, CartState } from "@/lib/types/cart";
import {
  cartItemCount,
  cartReducer,
  cartTotalFcfa,
  emptyCartState,
} from "./cartReducer";

const STORAGE_KEY = "maxi-equip-site:cart:v1";

interface CartContextValue {
  state: CartState;
  totalFcfa: number;
  itemCount: number;
  addLine: (line: CartLine) => void;
  removeLine: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Repère RÉSERVÉ à l'état initial, avant toute lecture de localStorage —
 * une référence d'objet UNIQUE, jamais retournée par le reducer (à ne
 * pas confondre avec `emptyCartState`, que `CLEAR` retourne réellement).
 * Sert de signal fiable "la réhydratation n'a pas encore eu lieu",
 * jamais un simple booléen ou une ref, qui se feraient piéger par le
 * double déclenchement des effets en React.StrictMode (voir plus bas).
 */
const NON_HYDRATE: CartState = { lines: [] };

/**
 * Panier local au navigateur uniquement (cahier des charges §8, Synthèse
 * d'architecture étape 4). Persisté en localStorage pour survivre à une
 * navigation entre pages ou un rechargement, mais jamais transmis à quelque
 * service que ce soit avant l'envoi explicite d'une demande de commande.
 *
 * CORRECTION — bug réel trouvé et reproduit avec un vrai test (React.
 * StrictMode, comme en développement) : l'effet d'ÉCRITURE se déclenchait
 * AVANT que l'effet de LECTURE n'ait eu le temps de faire aboutir sa
 * réhydratation (dispatch asynchrone), écrasant alors le panier
 * réellement sauvegardé par un panier vide — perte de données
 * silencieuse à chaque montage. Aggravé par StrictMode, qui double les
 * effets en développement. Corrigé en ne laissant JAMAIS l'effet
 * d'écriture s'exécuter tant que l'état est encore la référence
 * `NON_HYDRATE` d'origine — un signal basé sur l'identité de l'objet,
 * donc immunisé contre le double déclenchement (voir NON_HYDRATE).
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, NON_HYDRATE);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartState;
        if (parsed && Array.isArray(parsed.lines)) {
          dispatch({ type: "HYDRATE", state: parsed });
          return;
        }
      }
    } catch {
      // Panier corrompu, format incompatible, ou stockage indisponible :
      // on repart d'un panier vide, sans jamais faire planter la page.
    }
    // Aucune donnée valide à restaurer (première visite, ou données
    // corrompues) : on adopte explicitement un panier vide RÉEL (jamais
    // NON_HYDRATE, qui doit rester exclusivement le repère "pas encore
    // regardé" — sans ce dispatch, l'effet d'écriture resterait bloqué
    // indéfiniment tant qu'aucune ligne n'est ajoutée, ce qui est déjà
    // correct pour ce cas, mais explicite ici pour ne jamais dépendre
    // d'un comportement implicite).
    dispatch({ type: "HYDRATE", state: emptyCartState });
  }, []);

  useEffect(() => {
    // Tant que l'état est encore la référence d'origine, la réhydratation
    // n'a pas fini d'être traitée — ne jamais écrire à ce moment, sous
    // peine d'écraser un panier réel avec un panier vide (le bug corrigé
    // ci-dessus). Comparaison par référence, jamais par contenu : un
    // panier réellement vide restauré (`{lines: []}` construit à partir
    // d'un tout autre objet) doit au contraire être écrit normalement.
    if (state === NON_HYDRATE) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Stockage plein ou indisponible (navigation privée stricte, etc.) :
      // le panier reste fonctionnel pour la session en cours, simplement non persistant.
    }
  }, [state]);

  const value = useMemo<CartContextValue>(
    () => ({
      state,
      totalFcfa: cartTotalFcfa(state),
      itemCount: cartItemCount(state),
      addLine: (line) => dispatch({ type: "ADD_LINE", line }),
      removeLine: (variantId) => dispatch({ type: "REMOVE_LINE", variantId }),
      setQuantity: (variantId, quantity) =>
        dispatch({ type: "SET_QUANTITY", variantId, quantity }),
      clear: () => dispatch({ type: "CLEAR" }),
    }),
    [state]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart doit être utilisé à l'intérieur de <CartProvider>.");
  }
  return ctx;
}
