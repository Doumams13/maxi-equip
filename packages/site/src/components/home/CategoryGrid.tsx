import Link from "next/link";

const categories = [
  { type: "Faïence", description: "Motifs marbrés et unis pour l'intérieur" },
  { type: "Grès cérame", description: "Résistant, idéal cuisines et passages" },
  { type: "Antidérapant", description: "Terrasses, extérieurs, piscines" },
  { type: "Mosaïque", description: "Crédences et touches décoratives" },
];

export function CategoryGrid() {
  // Correction "Défaut 5" — le lien pointe vers l'ancre de la section
  // correspondante sur la page catalogue (jamais un paramètre de filtre
  // `?type=`), pour un comportement cohérent avec le Défaut 2 : le
  // catalogue reste toujours une page unique montrant tous les types,
  // l'utilisateur est simplement amené à la bonne section par un
  // défilement fluide (voir ScrollToHashOnLoad côté catalogue).
  return (
    <section className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
      <h2 className="font-display text-xl font-bold text-ink-800 sm:text-2xl">
        Parcourir par type
      </h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.type}
            href={`/catalogue#type-${encodeURIComponent(c.type)}`}
            className="group rounded-lg border border-ink-100 p-4 transition-colors hover:border-green-300 hover:bg-green-50"
          >
            <h3 className="font-display text-sm font-semibold text-ink-800 group-hover:text-green-700">
              {c.type}
            </h3>
            <p className="mt-1 text-xs text-ink-500">{c.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
