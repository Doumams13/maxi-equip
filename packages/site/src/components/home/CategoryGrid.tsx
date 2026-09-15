import Link from "next/link";

const categories = [
  { type: "Faïence", description: "Motifs marbrés et unis pour l'intérieur" },
  { type: "Grès cérame", description: "Résistant, idéal cuisines et passages" },
  { type: "Antidérapant", description: "Terrasses, extérieurs, piscines" },
  { type: "Mosaïque", description: "Crédences et touches décoratives" },
];

/**
 * Refonte — une rangée séparée par des liserés fins (joints de pose),
 * jamais quatre cartes identiques à bordure/fond. Le clic amène à la
 * section correspondante du catalogue par défilement fluide, jamais un
 * filtre (voir ScrollToHashOnLoad côté catalogue).
 */
export function CategoryGrid() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h2 className="font-display text-2xl text-stone-900 sm:text-3xl">Nos univers</h2>
      <div className="mt-8 grid grid-cols-1 divide-y divide-stone-200 border-t border-stone-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        {categories.map((c) => (
          <Link key={c.type} href={`/catalogue#type-${encodeURIComponent(c.type)}`} className="group px-1 py-6 first:pl-0 sm:px-6">
            <h3 className="font-display text-lg text-stone-900 transition-colors group-hover:text-pine-700">{c.type}</h3>
            <p className="mt-1.5 text-sm text-stone-500">{c.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
