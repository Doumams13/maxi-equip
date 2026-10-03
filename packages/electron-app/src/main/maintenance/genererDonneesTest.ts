import type Database from "better-sqlite3-multiple-ciphers";
import { ProduitRepository } from "../repositories/produitRepository.js";
import { StockRepository } from "../repositories/stockRepository.js";
import { MouvementRepository } from "../repositories/mouvementRepository.js";
import { FactureRepository } from "../repositories/factureRepository.js";
import { EmplacementRepository, bootstrapDefaultEmplacements } from "../repositories/emplacementRepository.js";
import { StockService } from "../services/stockService.js";
import { VenteService } from "../services/venteService.js";
import { BoiteEnvoiRepository } from "../repositories/boiteEnvoiRepository.js";

/**
 * Génération de données de test réalistes — correction "Tests réels
 * Phase 2" §Partie 2. Passe EXCLUSIVEMENT par les vrais services métier
 * (VenteService, StockService) — jamais un INSERT SQL direct qui
 * contournerait les règles réelles (vérification de stock, création des
 * mouvements associés, calcul du total, etc.), exactement comme
 * explicitement demandé.
 *
 * Cible : ~90 factures (dans la fourchette recommandée 70–100, largement
 * au-delà des 50 nécessaires pour tester la pagination), dont une
 * quinzaine annulées ; ~180 entrées et ~120 transferts pour dépasser
 * clairement les 300 événements d'historique (~405 au total avec les
 * ventes et annulations) — cible dans la fourchette recommandée
 * 350–400.
 */
export interface ResultatGeneration {
  produitsCrees: number;
  facturesCreees: number;
  facturesAnnulees: number;
  entreesCreees: number;
  transfertsCrees: number;
  totalEvenementsHistorique: number;
}

const PRODUITS_TEST = [
  { motif: "Carreau F-606", type: "carrelage", taille: "60 × 60 cm", tailleTri: 60, reference: "TEST-CF606", prix: 12000, seuilAlerte: 20 },
  { motif: "Carreau Blanc Mat", type: "carrelage", taille: "30 × 30 cm", tailleTri: 30, reference: "TEST-CBM30", prix: 6000, seuilAlerte: 30 },
  { motif: "Marbre Beige", type: "marbre", taille: "80 × 80 cm", tailleTri: 80, reference: "TEST-MB80", prix: 25000, seuilAlerte: 10 },
  { motif: "Ciment CEM II", type: "ciment", taille: "Sac 50 kg", tailleTri: 50, reference: "TEST-CIM50", prix: 8000, seuilAlerte: 40 },
  { motif: "Peinture Blanche", type: "peinture", taille: "20 L", tailleTri: 20, reference: "TEST-PEINT20", prix: 35000, seuilAlerte: 15 },
  { motif: "Robinet Standard", type: "sanitaire", taille: "Unité", tailleTri: 1, reference: "TEST-ROB01", prix: 15000, seuilAlerte: 25 },
];

const PRENOMS_CLIENTS = ["Jean", "Marie", "Paul", "Sylvie", "Alice", "Bernard", "Chantal", "Michel", "Nadine", "Serge", "Denise", "Georges"];
const NOMS_CLIENTS = ["Obiang", "Nguema", "Mabika", "Ndong", "Koumba", "Ella", "Moussavou", "Ondo", "Bongo", "Ntoutoume"];
const FOURNISSEURS_EXTERNES = ["Fournisseur ABC", "Établissements GF", "Négoce Import Sarl"];
const MODES_REGLEMENT = ["Espèces", "Mobile Money", "Virement", "Chèque"];

function choisir<T>(tableau: T[], graine: number): T {
  return tableau[graine % tableau.length]!;
}

/**
 * Génère une date répartie sur les 6 derniers mois — nécessaire pour que
 * les filtres de période de l'Historique (jour/semaine/mois/tout) aient
 * réellement quelque chose à filtrer, pas uniquement des données
 * d'aujourd'hui.
 */
function dateEtalee(indice: number, total: number): string {
  const maintenant = Date.now();
  const sixMoisMs = 180 * 24 * 60 * 60 * 1000;
  const decalage = Math.floor((indice / total) * sixMoisMs);
  return new Date(maintenant - sixMoisMs + decalage).toISOString();
}

export function executerGenerationDonneesTest(db: Database.Database): ResultatGeneration {
  const produitRepository = new ProduitRepository(db);
  const stockRepository = new StockRepository(db);
  const mouvementRepository = new MouvementRepository(db);
  const factureRepository = new FactureRepository(db);
  const emplacementRepository = new EmplacementRepository(db);

  bootstrapDefaultEmplacements(emplacementRepository);
  const emplacements = emplacementRepository.list();
  const shop = emplacements.find((e) => e.estPointDeVente)!;
  const depots = emplacements.filter((e) => !e.estPointDeVente && e.actif);
  if (depots.length === 0) {
    throw new Error("Aucun dépôt actif trouvé — impossible de générer des données de test réalistes sans au moins un point de vente actif.");
  }

  // UtilisateurRepository n'expose pas de liste complète (inutile en
  // dehors de ce script de maintenance) — lecture directe, en LECTURE
  // SEULE, pour retrouver un compte de connexion RÉEL déjà existant.
  // Jamais un compte créé pour l'occasion : les comptes de connexion ne
  // sont pas une "donnée de test" (voir resetDonneesTest.ts).
  const vendeur = db.prepare("SELECT id, nom FROM utilisateurs WHERE actif = 1 LIMIT 1").get() as { id: string; nom: string } | undefined;
  if (!vendeur) {
    throw new Error("Aucun utilisateur actif trouvé — impossible d'attribuer les ventes/mouvements de test à un vendeur réel.");
  }

  const boiteEnvoiRepository = new BoiteEnvoiRepository(db);
  const stockService = new StockService(db, stockRepository, mouvementRepository, boiteEnvoiRepository);
  const venteService = new VenteService(db, produitRepository, stockRepository, mouvementRepository, factureRepository, boiteEnvoiRepository);

  const produitIds = PRODUITS_TEST.map((p) => produitRepository.create(p));

  let entreesCreees = 0;
  const NB_ENTREES = 180;
  for (let i = 0; i < NB_ENTREES; i++) {
    const produitId = choisir(produitIds, i);
    const depot = choisir(depots, i + 1);
    const quantite = 20 + (i % 15) * 5;
    stockService.enregistrerEntree(produitId, depot.id, quantite, vendeur.id);
    db.prepare("UPDATE mouvements SET date = ? WHERE id = (SELECT id FROM mouvements ORDER BY rowid DESC LIMIT 1)").run(dateEtalee(i, NB_ENTREES + 300));
    entreesCreees++;
  }

  let transfertsCrees = 0;
  const NB_TRANSFERTS = depots.length >= 2 ? 120 : 0;
  for (let i = 0; i < NB_TRANSFERTS; i++) {
    const produitId = choisir(produitIds, i + 2);
    const source = depots[i % depots.length]!;
    const destination = depots[(i + 1) % depots.length]!;
    if (source.id === destination.id) continue;
    const disponible = stockRepository.getQuantite(produitId, source.id);
    const quantite = Math.min(5 + (i % 10), Math.max(1, Math.floor(disponible / 4)));
    if (quantite <= 0) continue;
    stockService.enregistrerTransfert(produitId, source.id, destination.id, quantite, vendeur.id);
    db.prepare("UPDATE mouvements SET date = ? WHERE id = (SELECT id FROM mouvements ORDER BY rowid DESC LIMIT 1) AND emplacement_source_id IS NOT NULL").run(
      dateEtalee(i + NB_ENTREES, NB_ENTREES + 300)
    );
    transfertsCrees++;
  }

  const NB_FACTURES = 90;
  const facturesCreeesIds: string[] = [];
  for (let i = 0; i < NB_FACTURES; i++) {
    const produitId = choisir(produitIds, i);
    const produit = PRODUITS_TEST[i % PRODUITS_TEST.length]!;
    const depot = choisir(depots, i);
    const disponible = stockRepository.getQuantite(produitId, depot.id);
    const quantiteVente = Math.max(1, Math.min(6, Math.floor(disponible / 3) || 1));

    const modulo = i % 10;
    let allocationsDepots: { emplacementId: string; quantite: number }[] = [];
    let fournisseurExterne: string | undefined;
    let prixAchatExterne: number | undefined;

    if (modulo < 4) {
      const qteReelle = Math.min(quantiteVente, disponible);
      if (qteReelle > 0) allocationsDepots = [{ emplacementId: depot.id, quantite: qteReelle }];
    } else if (modulo < 7) {
      fournisseurExterne = choisir(FOURNISSEURS_EXTERNES, i);
      prixAchatExterne = Math.round(produit.prix * 0.65);
    } else {
      const qteInterne = Math.min(1, disponible);
      if (qteInterne > 0) allocationsDepots = [{ emplacementId: depot.id, quantite: qteInterne }];
      fournisseurExterne = choisir(FOURNISSEURS_EXTERNES, i + 1);
      prixAchatExterne = Math.round(produit.prix * 0.65);
    }

    const quantiteAllouee = allocationsDepots.reduce((s, a) => s + a.quantite, 0);
    const quantiteFinale = Math.max(quantiteAllouee, quantiteAllouee < quantiteVente && fournisseurExterne ? quantiteVente : quantiteAllouee || 1);

    try {
      const resultat = venteService.enregistrerVente({
        pointDeVenteId: shop.id,
        clientNom: `${choisir(PRENOMS_CLIENTS, i)} ${choisir(NOMS_CLIENTS, i + 3)}`,
        clientTelephone: `077${String(100000 + i).padStart(6, "0")}`,
        clientAdresse: i % 3 === 0 ? "Libreville" : null,
        vendeurUtilisateurId: vendeur.id,
        vendeurCompteConnecteNom: vendeur.nom,
        vendeurNomManuel: null,
        modeReglement: choisir(MODES_REGLEMENT, i),

        remise: 0,
        lignes: [
          {
            produitId,
            quantite: quantiteFinale,
            prixUnitaire: produit.prix,
            allocationsDepots,
            fournisseurExterne,
            prixAchatExterne,
          },
        ],
      });
      facturesCreeesIds.push(resultat.factureId);
      db.prepare("UPDATE factures SET date = ? WHERE id = ?").run(dateEtalee(i, NB_FACTURES), resultat.factureId);
      db.prepare("UPDATE mouvements SET date = (SELECT date FROM factures WHERE id = ?) WHERE facture_id = ?").run(resultat.factureId, resultat.factureId);
    } catch {
      // Une ligne dont le stock s'avère insuffisant (cas rare, dépôt
      // épuisé par les ventes précédentes du même lot de test) est
      // simplement ignorée plutôt que de fausser les données — jamais
      // contourner la vérification réelle de disponibilité.
    }
  }

  let facturesAnnulees = 0;
  const motifs = ["Erreur de saisie", "Client s'est rétracté", "Produit indisponible finalement", "Double saisie"];
  for (let i = 0; i < facturesCreeesIds.length; i += 6) {
    try {
      venteService.annulerVente(facturesCreeesIds[i]!, choisir(motifs, i), vendeur.id);
      facturesAnnulees++;
    } catch {
      // Ignore si déjà annulée ou introuvable.
    }
  }

  const totalEvenements = (
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM factures) +
           (SELECT COUNT(*) FROM factures WHERE annulee_le IS NOT NULL) +
           (SELECT COUNT(*) FROM mouvements WHERE facture_id IS NULL) as n`
      )
      .get() as { n: number }
  ).n;

  return {
    produitsCrees: produitIds.length,
    facturesCreees: facturesCreeesIds.length,
    facturesAnnulees,
    entreesCreees,
    transfertsCrees,
    totalEvenementsHistorique: totalEvenements,
  };
}
