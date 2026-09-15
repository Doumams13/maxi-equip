const advantages = [
  { title: "Qualité", description: "Des carreaux fiables, sélectionnés avec soin." },
  { title: "Disponibilité", description: "Un large choix de motifs, tailles et types." },
  { title: "Proximité", description: "Un accompagnement sur mesure, du choix à la livraison." },
];

export function AdvantagesSection() {
  return (
    <section className="border-y border-stone-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-stone-200 px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
        {advantages.map((a) => (
          <div key={a.title} className="py-8 sm:px-8">
            <h3 className="font-display text-lg text-stone-900">{a.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{a.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
