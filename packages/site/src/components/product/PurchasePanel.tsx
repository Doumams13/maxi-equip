"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProductModel, Promotion } from "@/lib/types/catalog";
import { getEffectivePrice, getModelDisplayPrice, promotionsForVariant } from "@/lib/pricing";
import { formatFcfa } from "@/lib/format";
import { Button } from "@/components/ui/primitives";
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
    return <p className="text-sm text-clay">Aucune taille disponible pour ce modèle pour le moment.</p>;
  }

  const now = effectivePrice.isPromotionActive && effectivePrice.promoPriceFcfa !== null ? effectivePrice.promoPriceFcfa : effectivePrice.normalPriceFcfa;

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
      unitPriceFcfa: now,
      quantity,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 3000);
  }

  return (
    <div>
      <p className="mb-2 text-[13px] text-sage">{model.type}</p>
      <h1 className="font-display text-[clamp(26px,3vw,36px)]">{model.name}</h1>
      <p className="mt-2 text-[13px] text-ink-mute">Réf. {variant.reference}</p>

      <div className="my-5 flex items-baseline gap-3">
        <span className={`font-display text-[28px] font-semibold ${effectivePrice.isPromotionActive ? "text-clay" : "text-ink"}`}>{formatFcfa(now)}</span>
        {effectivePrice.isPromotionActive && <span className="text-[15px] text-ink-mute line-through">{formatFcfa(effectivePrice.normalPriceFcfa)}</span>}
      </div>

      <p className="max-w-[46ch] text-[14.5px] leading-relaxed text-ink-mute">{model.description}</p>

      <p className="mb-2.5 mt-6.5 text-[12.5px] font-bold uppercase tracking-[0.05em] text-ink-mute">Format</p>
      <div className="flex flex-wrap gap-2.5">
        {model.variants.map((v) => {
          const selected = v.id === variantId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariantId(v.id)}
              aria-pressed={selected}
              className={`rounded border px-4 py-2.5 text-sm ${selected ? "border-forest bg-sage-pale font-semibold text-forest-deep" : "border-ink/[0.14] bg-surface text-ink"}`}
            >
              {v.size}
            </button>
          );
        })}
      </div>

      <p className="mb-2.5 mt-6.5 text-[12.5px] font-bold uppercase tracking-[0.05em] text-ink-mute">Quantité</p>
      <div className="flex items-center gap-3.5">
        <div className="flex items-center rounded border border-ink/[0.14]">
          <button type="button" aria-label="Diminuer" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="h-[38px] w-[38px] text-base">
            −
          </button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="w-11 border-none bg-transparent text-center text-[14.5px]"
            aria-label="Quantité"
          />
          <button type="button" aria-label="Augmenter" onClick={() => setQuantity((q) => q + 1)} className="h-[38px] w-[38px] text-base">
            +
          </button>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap gap-3.5">
        <Button onClick={handleAdd}>Ajouter à la sélection</Button>
        <Link href="/panier" className="rounded border border-ink/[0.14] px-6 py-3.5 text-[14.5px] font-semibold text-ink hover:border-ink">
          Voir la sélection
        </Link>
      </div>
      {justAdded && (
        <p role="status" className="mt-3.5 text-[13.5px] text-forest">
          Ajouté à votre sélection.
        </p>
      )}

      <div className="mt-9 flex flex-col gap-2.5 border-t border-ink/[0.08] pt-5">
        <div className="flex justify-between border-b border-dashed border-ink/[0.08] pb-2 text-[13.5px] text-ink-mute">
          <span>Univers</span>
          <b className="font-semibold text-ink">{model.type}</b>
        </div>
        <div className="flex justify-between border-b border-dashed border-ink/[0.08] pb-2 text-[13.5px] text-ink-mute">
          <span>Référence</span>
          <b className="font-semibold text-ink">{variant.reference}</b>
        </div>
        <div className="flex justify-between pb-2 text-[13.5px] text-ink-mute">
          <span>Disponibilité</span>
          <b className="font-semibold text-ink">En stock — showroom &amp; entrepôt</b>
        </div>
      </div>
    </div>
  );
}
