const principles = [
  { title: "Choisi, pas empilé", text: "Chaque référence est sélectionnée pour sa tenue dans le temps et sa disponibilité réelle, pas pour remplir un catalogue." },
  { title: "Une demande, pas un panier", text: "Vous préparez votre sélection en ligne, un conseiller confirme les quantités et le meilleur prix avec vous." },
  { title: "Vu avant d'être acheté", text: "Formats, teintes et finitions sont visibles au showroom pour juger du rendu réel dans votre pièce." },
];

export function Principles() {
  return (
    <div className="border-y border-ink/[0.08]">
      <div className="mx-auto max-w-[1320px] px-[18px] sm:px-7">
        <ul className="grid grid-cols-1 list-none p-0 sm:grid-cols-3">
          {principles.map((p, i) => (
            <li key={p.title} className={`py-8 sm:px-7 ${i < principles.length - 1 ? "border-b border-ink/[0.08] sm:border-b-0 sm:border-r" : ""}`}>
              <h3 className="mb-2.5 font-display text-lg">{p.title}</h3>
              <p className="text-[14.5px] leading-relaxed text-ink-mute">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
