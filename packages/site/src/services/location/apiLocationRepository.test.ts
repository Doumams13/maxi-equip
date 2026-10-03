import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiLocationRepository } from "./index";
import type { CompanyLocation } from "@/lib/types/catalog";

describe("ApiLocationRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("relaie les localisations renvoyées par GET /v1/public/locations", async () => {
    const locations: CompanyLocation[] = [{ id: "loc-shop", name: "MAXI EQUIP — SHOP", kind: "point_de_vente", address: "x", city: "Libreville" }];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toContain("/v1/public/locations");
      return new Response(JSON.stringify({ locations }), { status: 200 });
    }));
    const repo = new ApiLocationRepository("http://api.test");
    expect(await repo.listLocations()).toEqual(locations);
  });

  it("propage une erreur claire si l'API répond en échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erreur", { status: 500 })));
    const repo = new ApiLocationRepository("http://api.test");
    await expect(repo.listLocations()).rejects.toThrow();
  });
});
