import type { CompanyLocation } from "@/lib/types/catalog";
import { Badge, Card } from "@/components/ui/primitives";

export function LocationsSection({ locations }: { locations: CompanyLocation[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h2 className="font-display text-xl font-bold text-ink-800 sm:text-2xl">
        Où nous trouver
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Le point de vente MAXI EQUIP est ouvert à tous. Les dépôts sont réservés à la gestion du stock.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {locations.map((loc) => (
          <Card key={loc.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-ink-800">{loc.name}</h3>
              <Badge tone={loc.kind === "point_de_vente" ? "type" : "neutral"}>
                {loc.kind === "point_de_vente" ? "Point de vente" : "Dépôt"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-ink-500">{loc.city}</p>
            <p className="text-xs text-ink-400">{loc.address}</p>
            {loc.hours && <p className="mt-2 text-xs text-ink-500">{loc.hours}</p>}
            {loc.kind === "depot" && (
              <p className="mt-2 text-xs italic text-ink-400">
                Dépôt de stockage — achat uniquement au point de vente SHOP.
              </p>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
