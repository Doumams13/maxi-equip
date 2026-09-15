import Link from "next/link";
import type { ProductModel } from "@/lib/types/catalog";
import { Mosaic } from "./Mosaic";

export function Hero({ models }: { models: ProductModel[] }) {
  return (
    <div className="mx-auto max-w-[1320px] px-[18px] py-8 sm:px-7 sm:py-14">
      <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[1.05fr_1fr] md:gap-11">
        <div>
          <p className="mb-3.5 text-[13px] tracking-[0.02em] text-sage">Showroom de carrelage — Libreville</p>
          <h1 className="font-display text-[clamp(34px,5vw,58px)] font-medium leading-[1.04] text-forest-deep">
            Le sol commence
            <br />
            ici.
          </h1>
          <p className="mt-4.5 max-w-[46ch] text-[17px] leading-relaxed text-ink-mute">
            MAXI EQUIP sélectionne le carrelage qui donne le ton à vos intérieurs : faïence, grès cérame, mosaïque et
            antidérapant, présentés comme dans un vrai showroom.
          </p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <Link href="/catalogue" className="rounded bg-forest px-6 py-3.5 text-[14.5px] font-semibold text-bg hover:bg-forest-deep">
              Découvrir le catalogue
            </Link>
            <Link href="/contact" className="rounded border border-ink/[0.14] px-6 py-3.5 text-[14.5px] font-semibold text-ink hover:border-ink">
              Nos points de vente
            </Link>
          </div>
        </div>
        <Mosaic models={models} />
      </div>
    </div>
  );
}
