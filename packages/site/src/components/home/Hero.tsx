import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import type { ProductModel } from "@/lib/types/catalog";

export function Hero({ featuredModel }: { featuredModel: ProductModel | undefined }) {
  const image = featuredModel ? [...featuredModel.images].sort((a, b) => a.order - b.order)[0] : undefined;

  return (
    <section className="relative">
      <div className="relative h-[78vh] min-h-[560px] w-full overflow-hidden bg-ink">
        {image && <Image src={image.url} alt={image.alt} fill priority sizes="100vw" className="object-cover opacity-80" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent" />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-[1400px] px-5 pb-12 sm:px-10 sm:pb-16">
            <p className="font-display text-lg italic text-paper/80">{siteConfig.city}</p>
            <h1 className="mt-2 max-w-4xl font-display text-display-1 italic text-paper">
              Le carrelage,
              <br />
              raconté comme une matière.
            </h1>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-6 px-5 py-8 sm:flex-row sm:items-center sm:px-10">
        <p className="max-w-xl text-base leading-relaxed text-ink/70">{siteConfig.description}</p>
        <Link
          href="/catalogue"
          className="shrink-0 font-display text-xl italic text-ink underline decoration-ember decoration-2 underline-offset-8 hover:text-ember"
        >
          Entrer dans le catalogue
        </Link>
      </div>
    </section>
  );
}
