const advantages = [
  {
    title: "Qualité",
    description: "Des équipements et matériaux fiables, sélectionnés avec soin.",
  },
  {
    title: "Disponibilité",
    description: "Un large choix de motifs, tailles et types de carreaux.",
  },
  {
    title: "Proximité",
    description: "Un accompagnement sur mesure, du choix du carreau à la livraison.",
  },
];

export function AdvantagesSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="grid gap-6 sm:grid-cols-3">
        {advantages.map((a) => (
          <div key={a.title} className="flex items-start gap-4 rounded-lg border border-ink-100 p-5">
            <span
              aria-hidden="true"
              className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <h3 className="font-display text-base font-semibold text-ink-800">{a.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{a.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
