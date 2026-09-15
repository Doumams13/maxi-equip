import type { CompanyLocation } from "@/lib/types/catalog";

export function LocationsSection({ locations }: { locations: CompanyLocation[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h2 className="font-display text-2xl text-stone-900 sm:text-3xl">Où nous trouver</h2>
      <p className="mt-2 max-w-lg text-sm text-stone-500">
        Le point de vente MAXI EQUIP est ouvert à tous. Les dépôts sont réservés à la gestion du stock.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {locations.map((loc) => (
          <div key={loc.id} className="border-t-2 border-pine-700 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base text-stone-900">{loc.name}</h3>
              <span className="text-xs font-medium text-stone-400">
                {loc.kind === "point_de_vente" ? "Point de vente" : "Dépôt"}
              </span>
            </div>
            <p className="mt-2 text-sm text-stone-600">{loc.city}</p>
            <p className="text-xs text-stone-400">{loc.address}</p>
            {loc.hours && <p className="mt-2 text-xs text-stone-500">{loc.hours}</p>}
            {loc.kind === "depot" && (
              <p className="mt-2 text-xs italic text-stone-400">Achat uniquement au point de vente SHOP.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
