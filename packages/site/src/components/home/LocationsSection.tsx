import type { CompanyLocation } from "@/lib/types/catalog";

export function LocationsSection({ locations }: { locations: CompanyLocation[] }) {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1400px] px-5 py-24 sm:px-10">
        <p className="font-display text-lg italic text-ink/50">Où nous trouver</p>
        <p className="mt-2 max-w-md text-sm text-ink/60">
          Le point de vente MAXI EQUIP est ouvert à tous. Les dépôts sont réservés à la gestion du stock.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
          {locations.map((loc) => (
            <div key={loc.id}>
              <p className="font-display text-2xl italic text-ink">{loc.name}</p>
              <p className="mt-1 text-xs italic text-ink/40">{loc.kind === "point_de_vente" ? "Point de vente" : "Dépôt"}</p>
              <p className="mt-3 text-sm text-ink/70">{loc.city}</p>
              <p className="text-sm text-ink/50">{loc.address}</p>
              {loc.hours && <p className="mt-2 text-sm text-ink/50">{loc.hours}</p>}
              {loc.kind === "depot" && <p className="mt-2 text-xs italic text-ink/40">Achat uniquement au point de vente SHOP.</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
