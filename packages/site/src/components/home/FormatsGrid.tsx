import Image from "next/image";
import type { ProductModel } from "@/lib/types/catalog";

export function FormatsGrid({ sizes, models }: { sizes: string[]; models: ProductModel[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {sizes.map((size) => {
        const sample = models.find((m) => m.variants.some((v) => v.size === size));
        const image = sample ? [...sample.images].sort((a, b) => a.order - b.order)[0] : undefined;
        const ratio = parseAspectRatio(size);

        return (
          <div key={size} className="flex flex-col overflow-hidden rounded border border-ink/[0.08] bg-surface">
            <div className="relative flex aspect-[4/5] items-center justify-center bg-surface-soft p-7">
              <div
                className="relative overflow-hidden rounded-[2px] shadow-[0_10px_28px_rgba(18,42,29,.16)]"
                style={{ width: ratio.w, aspectRatio: `${ratio.ratio}` }}
              >
                {image && (
                  <Image src={image.url} alt={`Exemple de carrelage au format ${size} cm`} fill sizes="200px" className="object-cover" />
                )}
              </div>
            </div>
            <div className="border-t border-ink/[0.08] px-[22px] py-5">
              <p className="font-display text-[21px] font-semibold text-forest-deep">{size}</p>
              <p className="mt-1 text-[13px] text-ink-mute">cm</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseAspectRatio(size: string): { w: string; ratio: number } {
  const match = size.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!match || !match[1] || !match[2]) return { w: "70%", ratio: 1 };
  const width = parseFloat(match[1].replace(",", "."));
  const height = parseFloat(match[2].replace(",", "."));
  if (!width || !height) return { w: "70%", ratio: 1 };
  const ratio = width / height;
  const w = ratio >= 0.85 ? "70%" : "44%";
  return { w, ratio };
}
