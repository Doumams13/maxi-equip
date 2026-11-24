import { describe, it, expect } from "vitest";
import Database from "better-sqlite3-multiple-ciphers";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { runMigrations } from "../db/migrate.js";
import { BoiteEnvoiRepository } from "./boiteEnvoiRepository.js";

/**
 * Allègement de la base (2026-11-24) — sur une VRAIE base chiffrée
 * (SQLCipher, même moteur que l'application) : seules les images
 * confirmées perdent leur copie base64, tout le reste est intact, et le
 * VACUUM réduit réellement la taille du fichier.
 */
describe("BoiteEnvoiRepository.retirerContenuImagesConfirmees", () => {
  it("retire uniquement contentBase64 des images confirmées, conserve les lignes et le reste ; VACUUM réduit le fichier", () => {
    const chemin = join(mkdtempSync(join(tmpdir(), "allegement-")), "base.sqlite");
    const db = new Database(chemin);
    db.pragma(`key = 'cle-de-test'`);
    runMigrations(db);
    const repo = new BoiteEnvoiRepository(db);

    const image = () => ({ operation: "create", imageId: "i", modeleId: "m", contentBase64: randomBytes(300_000).toString("base64"), contentType: "image/jpeg" });
    const confirmee1 = repo.creer("image_produit", "img1", image());
    const confirmee2 = repo.creer("image_produit", "img2", image());
    const enAttente = repo.creer("image_produit", "img3", image());
    const autreConfirme = repo.creer("modele", "m1", { operation: "update", motif: "X" });
    repo.mettreAJourStatut(confirmee1, "confirmed");
    repo.mettreAJourStatut(confirmee2, "confirmed");
    repo.mettreAJourStatut(autreConfirme, "confirmed");

    const tailleAvant = statSync(chemin).size;
    expect(repo.retirerContenuImagesConfirmees(confirmee1)).toBe(1);
    expect(repo.retirerContenuImagesConfirmees()).toBe(1); // seule img2 restait à alléger
    expect(repo.retirerContenuImagesConfirmees()).toBe(0); // idempotent

    const payload = (id: string) => JSON.parse(repo.findById(id)!.payloadJson) as Record<string, unknown>;
    expect(payload(confirmee1)["contentBase64"]).toBeUndefined();
    expect(payload(confirmee1)).toMatchObject({ operation: "create", imageId: "i", contentType: "image/jpeg" });
    expect(typeof payload(enAttente)["contentBase64"]).toBe("string"); // pas encore envoyée : intacte
    expect(payload(autreConfirme)).toEqual({ operation: "update", motif: "X" });
    expect(repo.findById(confirmee1)!.status).toBe("confirmed");

    db.exec("VACUUM");
    const tailleApres = statSync(chemin).size;
    expect(tailleApres).toBeLessThan(tailleAvant * 0.6);
    db.close();
  });
});
