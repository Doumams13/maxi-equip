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
 * Panier local au navigateur uniquement (cahier des charges §8, Synthèse
 * d'architecture étape 4). Persisté en localStorage pour survivre à une
 * navigation entre pages ou un rechargement, mais jamais transmis à quelque
 * service que ce soit avant l'envoi explicite d'une demande de commande.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, emptyCartState);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartState;
        if (parsed && Array.isArray(parsed.lines)) {
          dispatch({ type: "HYDRATE", state: parsed });
        }
      }
    } catch {
      // Panier corrompu ou stockage indisponible : on repart d'un panier vide,
      // sans jamais faire planter la page (état d'erreur silencieux et sans risque).
    }
  }, []);

  useEffect(() => {
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
