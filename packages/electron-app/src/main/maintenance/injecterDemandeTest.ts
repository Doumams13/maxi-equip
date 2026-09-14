import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3-multiple-ciphers";
import { getConfigurationSync } from "../services/syncConfig.js";

/**
 * Phase 4.1, Partie 18 — injection TECHNIQUE d'une demande de test,
 * jamais une fonctionnalité utilisateur : aucun bouton, aucun menu,
 * accessible uniquement via `--maintenance=injecter-demande-test`,
 * exactement comme `genererDonneesTest.ts`/`resetDonneesTest.ts` déjà
 * établis.
 *
 * Utilise le VRAI mécanisme de synchronisation — un vrai POST HTTP vers
 * `/v1/sync/push` avec le vrai JWT configuré (`MAXI_EQUIP_SYNC_JWT`),
 * exactement comme le fera le futur site vitrine (Phase 5). Ne touche
 * jamais directement la base locale : la demande n'apparaît dans
 * l'application qu'après un vrai PULL, exactement comme en conditions
 * réelles — permet de tester dès maintenant le parcours complet
 * Demande -> API -> Synchronisation -> Application -> Notification.
 */
export interface ResultatInjectionDemandeTest {
  success: boolean;
  entityId?: string;
  message?: string;
}

/**
 * Correction — trois variantes réalistes plutôt qu'une seule demande
 * toujours identique, pour permettre de tester le parcours complet
 * (liste, ouverture, suivi, "Traiter la demande") sur plusieurs cas
 * distincts (client unique, plusieurs lignes) sans avoir à modifier le
 * code à chaque fois.
 */
function construirePayload(variante: 1 | 2 | 3, produitId: string) {
  if (variante === 2) {
    return {
      clientNom: "Marie Obiang",
      clientTelephone: "+241 06 12 34 56",
      clientAdresse: "Libreville, Nombakélé (test)",
      clientEmail: null,
      commentaire: "Demande de test n°2 — client sans email.",
      lignes: [{ produitId, motif: "Produit de test", taille: "60x60", quantite: 5, prixIndicatif: 10000 }],
    };
  }
  if (variante === 3) {
    return {
      clientNom: "Paul Ndong",
      clientTelephone: "+241 05 98 76 54",
      clientAdresse: "Libreville, Glass (test)",
      clientEmail: "paul.ndong@example.com",
      commentaire: "Demande de test n°3 — plusieurs produits.",
      lignes: [
        { produitId, motif: "Produit de test", taille: "60x60", quantite: 3, prixIndicatif: 10000 },
        { produitId, motif: "Produit de test", taille: "60x60", quantite: 1, prixIndicatif: 10000 },
      ],
    };
  }
  return {
    clientNom: "Client Test Injection",
    clientTelephone: "+241 07 07 07 07",
    clientAdresse: "Libreville, Akébé (test)",
    clientEmail: "test-injection@example.com",
    commentaire: "Demande de test n°1 injectée via --maintenance=injecter-demande-test",
    lignes: [{ produitId, motif: "Produit de test", taille: "60x60", quantite: 2, prixIndicatif: 10000 }],
  };
}

export async function injecterDemandeTest(_db: Database.Database, produitId: string, variante: 1 | 2 | 3 = 1): Promise<ResultatInjectionDemandeTest> {
  const config = getConfigurationSync();
  if (!config.jwt) {
    return { success: false, message: "Aucun jeton de synchronisation configuré (MAXI_EQUIP_SYNC_JWT) — impossible d'injecter via l'API réelle." };
  }

  const entityId = randomUUID();
  const payloadDemande = construirePayload(variante, produitId);

  try {
    const reponse = await fetch(`${config.apiUrl}/v1/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.jwt}` },
      body: JSON.stringify({ operations: [{ entityType: "demande", entityId, payload: payloadDemande }] }),
    });
    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => "");
      return { success: false, message: `Le serveur a refusé l'injection (HTTP ${reponse.status}) : ${texte.slice(0, 300)}` };
    }
    return { success: true, entityId };
  } catch (err) {
    return { success: false, message: `Impossible de contacter le serveur : ${err instanceof Error ? err.message : String(err)}` };
  }
}
