const categories = [
  { type: "Faïence", description: "Motifs marbrés et unis pour l'intérieur" },
  { type: "Grès cérame", description: "Résistant, idéal cuisines et passages" },
  { type: "Antidérapant", description: "Terrasses, extérieurs, piscines" },
  { type: "Mosaïque", description: "Crédences et touches décoratives" },
];

export function CollectionsIndex() {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <p className="font-display text-lg italic text-ink/50">Les collections</p>
        <div className="mt-6 border-t border-ink/15">
          {categories.map((c, i) => (
            <a
              key={c.type}
              href={`/catalogue#type-${encodeURIComponent(c.type)}`}
              className="group flex flex-col justify-between gap-1 border-b border-ink/15 py-6 transition-colors hover:bg-ink hover:px-4 hover:text-paper sm:flex-row sm:items-baseline sm:gap-8"
            >
              <span className="flex items-baseline gap-6">
                <span className="font-display text-base italic text-ink/30 group-hover:text-paper/40">0{i + 1}</span>
                <span className="font-display text-4xl italic tracking-tightest sm:text-5xl">{c.type}</span>
              </span>
              <span className="text-sm text-ink/50 group-hover:text-paper/70">{c.description}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
