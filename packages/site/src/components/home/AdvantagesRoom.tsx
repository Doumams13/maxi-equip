const advantages = [
  { n: "01", title: "La matière avant tout", description: "Chaque référence est choisie pour sa tenue dans le temps, pas seulement son prix." },
  { n: "02", title: "Un choix qui ne s'épuise pas", description: "Motifs, tailles et types couvrent l'intérieur, l'extérieur, la piscine, la cuisine." },
  { n: "03", title: "Du conseil, pas un formulaire", description: "Une demande envoyée depuis le site est reprise par une vraie personne, pas un robot." },
];

export function AdvantagesRoom() {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <div className="grid grid-cols-1 gap-14 sm:grid-cols-3 sm:gap-10">
          {advantages.map((a) => (
            <div key={a.n}>
              <span className="font-display text-base italic text-paper/40">{a.n}</span>
              <h3 className="mt-3 font-display text-3xl italic leading-tight">{a.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-paper/60">{a.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
