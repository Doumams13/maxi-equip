"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getEffectivePrice, getModelDisplayPrice, promotionsForVariant } from "@/lib/pricing";
import { formatFcfa } from "@/lib/format";
import { DiscountMark, PriceTag } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/cart/CartContext";

function variantIdMatchingCardDisplay(model: ProductModel, promotions: Promotion[]): string {
  const { effective } = getModelDisplayPrice(model.variants, promotions, model.id);
  const prixAffiche = effective.promoPriceFcfa ?? effective.normalPriceFcfa;
  const correspondante = model.variants.find((v) => {
    const p = getEffectivePrice(v.priceFcfa, promotionsForVariant(promotions, model.id, v.id));
    return (p.promoPriceFcfa ?? p.normalPriceFcfa) === prixAffiche;
  });
  return correspondante?.id ?? model.variants[0]?.id ?? "";
}

export function PurchasePanel({ model, promotions }: { model: ProductModel; promotions: Promotion[] }) {
  const [variantId, setVariantId] = useState(() => variantIdMatchingCardDisplay(model, promotions));
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const { addLine } = useCart();

  const variant = model.variants.find((v) => v.id === variantId) ?? model.variants[0];

  const effectivePrice = useMemo(() => {
    if (!variant) return null;
    return getEffectivePrice(variant.priceFcfa, promotionsForVariant(promotions, model.id, variant.id));
  }, [variant, promotions, model.id]);

  if (!variant || !effectivePrice) {
    return <p className="text-sm text-status-error">Aucune taille disponible pour ce modèle pour le moment.</p>;
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <PriceTag price={effectivePrice} size="lg" />
        {effectivePrice.isPromotionActive && effectivePrice.discountPercent !== null && <DiscountMark percent={effectivePrice.discountPercent} />}
      </div>

      <div>
        <p className="font-display text-lg italic text-ink">Choisissez une taille</p>
        <p className="text-xs text-ink/50">Le prix affiché correspond exactement à la taille sélectionnée.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {model.variants.map((v) => {
            const variantPrice = getEffectivePrice(v.priceFcfa, promotionsForVariant(promotions, model.id, v.id));
            const selected = v.id === variantId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={selected}
                className={`flex min-w-[92px] flex-col items-center gap-1 border px-5 py-3 transition-colors ${
                  selected ? "border-ink bg-ink text-paper" : "border-ink/20 text-ink hover:border-ink"
                }`}
              >
                <span className="font-display text-lg italic">{v.size}</span>
                <span className={`text-xs ${selected ? "text-paper/60" : "text-ink/50"}`}>
                  {variantPrice.isPromotionActive && variantPrice.promoPriceFcfa !== null
                    ? formatFcfa(variantPrice.promoPriceFcfa)
                    : formatFcfa(variantPrice.normalPriceFcfa)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink/40">Référence {variant.reference}</p>
      </div>

      <div>
        <p className="font-display text-lg italic text-ink">Quantité</p>
        <div className="mt-3 flex w-fit items-center border border-ink/20">
          <button type="button" aria-label="Diminuer la quantité" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-4 py-2.5 text-ink hover:bg-ink/5">
            −
          </button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 border-x border-ink/20 py-2.5 text-center text-sm"
            aria-label="Quantité"
          />
          <button type="button" aria-label="Augmenter la quantité" onClick={() => setQuantity((q) => q + 1)} className="px-4 py-2.5 text-ink hover:bg-ink/5">
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button onClick={handleAdd} size="lg">
          Ajouter au panier
        </Button>
        {justAdded && (
          <Link href="/panier" className="font-display text-lg italic text-ember" role="status">
            Ajouté — voir le panier
          </Link>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ink/45">
        Ceci n&apos;est pas un achat en ligne : ajoutez vos produits au panier, puis envoyez une demande — MAXI EQUIP vous recontactera pour finaliser.
      </p>
    </div>
  );
}
