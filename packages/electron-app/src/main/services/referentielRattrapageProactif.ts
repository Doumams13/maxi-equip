import type Database from "better-sqlite3-multiple-ciphers";
import type { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";
import type { CategorieRepository } from "../repositories/categorieRepository.js";
import type { SousCategorieRepository } from "../repositories/sousCategorieRepository.js";
import type { SousCategorieChampRepository } from "../repositories/sousCategorieChampRepository.js";
import type { SousCategorieUniteRepository } from "../repositories/sousCategorieUniteRepository.js";
import { enqueueCategorieSync, enqueueSousCategorieSync, enqueueSousCategorieChampSync } from "../ipc/metier.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.7 — rattrapage PONCTUEL du
 * référentiel local (catégories/sous-catégories/champs) déjà créé AVANT
 * cette sous-phase (notamment via `initialiserCategoriesQuincailleriePredefiniesSiAbsentes`,
 * voir db/migrate.ts), jamais mis en file vers le serveur central (le
 * mécanisme d'enfilage n'existait pas encore). Appelé UNE SEULE FOIS
 * depuis `main/index.ts`, après l'instanciation des repositories
 * référentiels — extrait dans ce fichier dédié (plutôt que codé en
 * ligne dans `main/index.ts`) uniquement pour rester testable sur une
 * vraie base SQLite, sans dépendre d'Electron.
 *
 * Réutilise STRICTEMENT les fonctions d'enfilage déjà existantes
 * (`enqueueCategorieSync`/`enqueueSousCategorieSync`/
 * `enqueueSousCategorieChampSync`, voir ipc/metier.ts) — jamais un
 * second mécanisme de synchronisation.
 *
 * TROIS gardes STRICTEMENT INDÉPENDANTES (jamais un indicateur global
 * unique — un poste pourrait avoir déjà rattrapé ses catégories mais pas
 * encore ses champs) : chacune considère TOUTE entrée déjà existante
 * pour son type (`existeEntreePourType`), quel que soit son statut
 * (pending/sent/confirmed/error) — une entrée existante signale que CE
 * rattrapage a déjà commencé, jamais rejoué à chaque démarrage.
 *
 * Protection contre une exécution partielle (§4.5 du cahier des
 * charges) : chaque boucle est déposée dans une VRAIE transaction
 * SQLite (`db.transaction`, déjà utilisé ailleurs dans ce projet — voir
 * SousCategorieRepository.creerDepuisServeur). Si l'application s'arrête
 * au milieu d'un lot, AUCUNE entrée de ce lot n'est validée (rollback
 * complet) : la garde reste `false` au prochain démarrage et le lot
 * ENTIER est retenté, jamais une reprise partielle silencieuse qui
 * laisserait certaines entités invisibles pour toujours.
 *
 * Ordre respecté : catégories → sous-catégories (avec leurs unités) →
 * champs, chaque niveau dépendant du précédent côté serveur (mêmes clés
 * étrangères que le catch-up, voir referentielStore.ts côté API).
 */
export function executerRattrapageProactifReferentiel(
  db: Database.Database,
  boiteEnvoiRepository: BoiteEnvoiRepository,
  categorieRepository: CategorieRepository,
  sousCategorieRepository: SousCategorieRepository,
  sousCategorieChampRepository: SousCategorieChampRepository,
  sousCategorieUniteRepository: SousCategorieUniteRepository
): void {
  if (!boiteEnvoiRepository.existeEntreePourType("categorie")) {
    const deposerCategories = db.transaction(() => {
      for (const c of categorieRepository.list()) {
        enqueueCategorieSync(boiteEnvoiRepository, c, "create");
      }
    });
    deposerCategories();
  }

  if (!boiteEnvoiRepository.existeEntreePourType("sous_categorie")) {
    const deposerSousCategories = db.transaction(() => {
      for (const sc of sousCategorieRepository.list()) {
        const config = sousCategorieUniteRepository.obtenirConfiguration(sc.id);
        const unitesAutorisees = config.configuree ? config.unites : null;
        enqueueSousCategorieSync(boiteEnvoiRepository, sc, unitesAutorisees, "create");
      }
    });
    deposerSousCategories();
  }

  if (!boiteEnvoiRepository.existeEntreePourType("sous_categorie_champ")) {
    const deposerChamps = db.transaction(() => {
      for (const sc of sousCategorieRepository.list()) {
        for (const champ of sousCategorieChampRepository.listBySousCategorie(sc.id)) {
          enqueueSousCategorieChampSync(boiteEnvoiRepository, champ, "create");
        }
      }
    });
    deposerChamps();
  }
}
