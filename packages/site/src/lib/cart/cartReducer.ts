import type { CartLine, CartState } from "@/lib/types/cart";

export type CartAction =
  | { type: "ADD_LINE"; line: CartLine }
  | { type: "REMOVE_LINE"; variantId: string }
  | { type: "SET_QUANTITY"; variantId: string; quantity: number }
  | { type: "CLEAR" }
  | { type: "HYDRATE"; state: CartState };

export const emptyCartState: CartState = { lines: [] };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "ADD_LINE": {
      const existing = state.lines.find((l) => l.variantId === action.line.variantId);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.variantId === action.line.variantId
              ? { ...l, quantity: l.quantity + action.line.quantity }
              : l
          ),
        };
      }
      return { lines: [...state.lines, action.line] };
    }

    case "SET_QUANTITY": {
      const quantity = Math.max(1, Math.floor(action.quantity));
      return {
        lines: state.lines.map((l) =>
          l.variantId === action.variantId ? { ...l, quantity } : l
        ),
      };
    }

    case "REMOVE_LINE":
      return { lines: state.lines.filter((l) => l.variantId !== action.variantId) };

    case "CLEAR":
      return emptyCartState;

    default:
      return state;
  }
}

export function cartTotalFcfa(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.unitPriceFcfa * l.quantity, 0);
}

export function cartItemCount(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.quantity, 0);
}
