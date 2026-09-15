"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getEffectivePrice, getModelDisplayPrice, promotionsForVariant } from "@/lib/pricing";
import { formatFcfa } from "@/lib/format";
import { DiscountBadge, PriceTag } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/cart/CartContext";

/**
 * Correction "Défaut 4" — la taille présélectionnée à l'arrivée sur la
 * fiche produit doit être celle réellement affichée sur la carte du
 * catalogue (`getModelDisplayPrice`, la variante au prix effectif le plus
 * bas), jamais simplement la première du tableau selon l'ordre de saisie.
 * Sans ce correctif, un client cliquant sur une carte affichant "à partir
 * de X FCFA" pourrait arriver sur une fiche présélectionnant une AUTRE
 * taille à un prix différent — incohérence entre ce qui est montré et ce
 * qui est réellement sélectionné.
 */
function variantIdMatchingCardDisplay(model: ProductModel, promotions: Promotion[]): string {
  const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);
  const prixAffiche = effective.promoPriceFcfa ?? effective.normalPriceFcfa;
  const correspondante = model.variants.find((v) => {
    const prixVariante = getEffectivePrice(v.priceFcfa, promotionsForVariant(promotions, model.id, v.id));
    return (prixVariante.promoPriceFcfa ?? prixVariante.normalPriceFcfa) === prixAffiche;
  });
  return correspondante?.id ?? model.variants[0]?.id ?? "";
}

export function PurchasePanel({
  model,
  promotions,
}: {
  model: ProductModel;
  promotions: Promotion[];
}) {
  const [variantId, setVariantId] = useState(() => variantIdMatchingCardDisplay(model, promotions));
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { addLine } = useCart();

  const variant = model.variants.find((v) => v.id === variantId) ?? model.variants[0];

  const effectivePrice = useMemo(() => {
    if (!variant) return null;
    const applicable = promotionsForVariant(promotions, model.id, variant.id);
    return getEffectivePrice(variant.priceFcfa, applicable);
  }, [variant, promotions, model.id]);

  if (!variant || !effectivePrice) {
    return (
      <p className="text-sm text-status-error">
        Aucune taille disponible pour ce modèle pour le moment.
      </p>
    );
  }

  function handleAdd() {
    if (!variant || !effectivePrice) return;
    const mainImage = [...model.images].sort((a, b) => a.order - b.order)[0];
    addLine({
      productModelId: model.id,
      productModelSlug: model.slug,
      productModelName: model.name,
      imageUrl: mainImage?.url ?? "",
      variantId: variant.id,
      size: variant.size,
      reference: variant.reference,
      unitPriceFcfa: effectivePrice.promoPriceFcfa ?? effectivePrice.normalPriceFcfa,
      quantity,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 3000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <PriceTag price={effectivePrice} size="lg" />
        {effectivePrice.isPromotionActive && effectivePrice.discountPercent !== null && (
          <DiscountBadge percent={effectivePrice.discountPercent} />
        )}
      </div>

      <div>
        <h2 className="font-display text-base text-stone-900">
          Taille
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {model.variants.map((v) => {
            // Prix propre à CETTE variante (pas celle sélectionnée), pour que
            // la variation de prix selon la taille soit visible directement
            // sur les boutons, avant même de cliquer.
            const variantPrice = getEffectivePrice(
              v.priceFcfa,
              promotionsForVariant(promotions, model.id, v.id)
            );
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={v.id === variantId}
                className={`flex flex-col items-center border px-4 py-2 text-sm font-semibold ${
                  v.id === variantId
                    ? "border-pine-700 bg-pine-50 text-pine-700"
                    : "border-stone-300 text-stone-700 hover:border-stone-500"
                }`}
              >
                <span>{v.size}</span>
                <span className="mt-0.5 text-xs font-normal text-stone-400">
                  {variantPrice.isPromotionActive && variantPrice.promoPriceFcfa !== null
                    ? formatFcfa(variantPrice.promoPriceFcfa)
                    : formatFcfa(variantPrice.normalPriceFcfa)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-stone-400">Référence : {variant.reference}</p>
      </div>

      <div>
        <h2 className="font-display text-base text-stone-900">
          Quantité
        </h2>
        <div className="mt-2 flex w-fit items-center border border-stone-300">
          <button
            type="button"
            aria-label="Diminuer la quantité"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-stone-600 hover:bg-stone-50"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 border-x border-stone-300 py-2 text-center text-sm"
            aria-label="Quantité"
          />
          <button
            type="button"
            aria-label="Augmenter la quantité"
            onClick={() => setQuantity((q) => q + 1)}
            className="px-3 py-2 text-stone-600 hover:bg-stone-50"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={handleAdd} size="lg">
          Ajouter au panier
        </Button>
        {justAdded && (
          <Link
            href="/panier"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-pine-700"
            role="status"
          >
            ✓ Ajouté — voir le panier →
          </Link>
        )}
      </div>

      <p className="text-xs text-stone-400">
        Ceci n&apos;est pas un achat en ligne : ajoutez vos produits au panier, puis envoyez une
        demande — MAXI EQUIP vous recontactera pour finaliser.
      </p>
    </div>
  );
}
