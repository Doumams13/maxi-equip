// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { CartProvider, useCart } from "./CartContext";
import type { CartLine } from "@/lib/types/cart";

const STORAGE_KEY = "maxi-equip-site:cart:v1";

function ligne(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productModelId: "m1",
    productModelSlug: "marbre-blanc",
    productModelName: "Marbre Blanc",
    imageUrl: "/images/products/marbre-blanc-1.svg",
    variantId: "v1",
    size: "60x60",
    reference: "MB-6060",
    unitPriceFcfa: 15000,
    quantity: 2,
    ...overrides,
  };
}

function TestConsumer({ onReady }: { onReady: (cart: ReturnType<typeof useCart>) => void }) {
  const cart = useCart();
  onReady(cart);
  return null;
}

async function monterEtStabiliser(): Promise<{ cart: ReturnType<typeof useCart> | null }> {
  const captured: { cart: ReturnType<typeof useCart> | null } = { cart: null };
  render(
    <React.StrictMode>
      <CartProvider>
        <TestConsumer onReady={(c) => (captured.cart = c)} />
      </CartProvider>
    </React.StrictMode>
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return captured;
}

function localStorageState(): { lines: CartLine[] } | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe("Persistance du panier — CartContext (bug réel reproduit et corrigé)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("TEST 1-4 — un panier déjà sauvegardé n'est JAMAIS écrasé par un panier vide au montage (le bug corrigé)", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ lines: [ligne()] }));

    const { cart } = await monterEtStabiliser();

    expect(cart?.state.lines).toHaveLength(1);
    expect(cart?.state.lines[0]?.productModelName).toBe("Marbre Blanc");
    expect(localStorageState()?.lines).toHaveLength(1);
  });

  it("TEST 5-7 — modifier la quantité, puis un nouveau montage (F5) restaure la quantité modifiée", async () => {
    const { cart } = await monterEtStabiliser();

    await act(async () => {
      cart!.addLine(ligne({ quantity: 1 }));
    });
    await act(async () => {
      cart!.setQuantity("v1", 5);
    });

    expect(localStorageState()?.lines[0]?.quantity).toBe(5);

    const { cart: cartApresRechargement } = await monterEtStabiliser();
    expect(cartApresRechargement?.state.lines).toHaveLength(1);
    expect(cartApresRechargement?.state.lines[0]?.quantity).toBe(5);
  });

  it("TEST 8-10 — supprimer un produit, puis un nouveau montage confirme que le panier est bien vide", async () => {
    const { cart } = await monterEtStabiliser();
    await act(async () => {
      cart!.addLine(ligne());
    });
    await act(async () => {
      cart!.removeLine("v1");
    });

    expect(localStorageState()?.lines).toHaveLength(0);

    const { cart: cartApresRechargement } = await monterEtStabiliser();
    expect(cartApresRechargement?.state.lines).toHaveLength(0);
  });

  it("TEST 11 — plusieurs produits/formats différents sont tous restaurés correctement", async () => {
    const { cart } = await monterEtStabiliser();
    await act(async () => {
      cart!.addLine(ligne({ variantId: "v1", size: "60x60", quantity: 2 }));
      cart!.addLine(ligne({ variantId: "v2", size: "80x80", productModelName: "Marbre Blanc", reference: "MB-8080", quantity: 1 }));
      cart!.addLine(ligne({ variantId: "v3", productModelId: "m2", productModelSlug: "terracotta", productModelName: "Terracotta", reference: "TA-3030", quantity: 3 }));
    });

    const { cart: cartApresRechargement } = await monterEtStabiliser();
    expect(cartApresRechargement?.state.lines).toHaveLength(3);
    expect(cartApresRechargement?.state.lines.map((l) => l.variantId).sort()).toEqual(["v1", "v2", "v3"]);
  });

  it("le total et le compteur d'articles (affiché dans le bouton Panier) sont également restaurés", async () => {
    const { cart } = await monterEtStabiliser();
    await act(async () => {
      cart!.addLine(ligne({ quantity: 2, unitPriceFcfa: 10000 }));
    });

    const { cart: cartApresRechargement } = await monterEtStabiliser();
    expect(cartApresRechargement?.itemCount).toBe(2);
    expect(cartApresRechargement?.totalFcfa).toBe(20000);
  });

  it("premiere visite (aucune donnee sauvegardee) : panier vide, jamais d'erreur", async () => {
    const { cart } = await monterEtStabiliser();
    expect(cart?.state.lines).toEqual([]);
  });

  it("donnees corrompues en localStorage (JSON invalide) : jamais de plantage, panier vide", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{ceci n'est pas du JSON valide");
    const { cart } = await monterEtStabiliser();
    expect(cart?.state.lines).toEqual([]);
  });

  it("donnees incompatibles (forme inattendue, ex. 'lines' absent) : jamais de plantage, panier vide", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ uneAutreForme: true }));
    const { cart } = await monterEtStabiliser();
    expect(cart?.state.lines).toEqual([]);
  });

  it("vider le panier (clear(), utilise apres l'envoi reussi d'une demande) efface aussi la version persistee", async () => {
    const { cart } = await monterEtStabiliser();
    await act(async () => {
      cart!.addLine(ligne());
    });
    expect(localStorageState()?.lines).toHaveLength(1);

    await act(async () => {
      cart!.clear();
    });
    expect(localStorageState()?.lines).toHaveLength(0);

    const { cart: cartApresRechargement } = await monterEtStabiliser();
    expect(cartApresRechargement?.state.lines).toEqual([]);
  });
});
