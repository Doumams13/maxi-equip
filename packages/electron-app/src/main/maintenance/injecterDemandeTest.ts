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

export async function injecterDemandeTest(_db: Database.Database, produitId: string): Promise<ResultatInjectionDemandeTest> {
  const config = getConfigurationSync();
  if (!config.jwt) {
    return { success: false, message: "Aucun jeton de synchronisation configuré (MAXI_EQUIP_SYNC_JWT) — impossible d'injecter via l'API réelle." };
  }

  const entityId = randomUUID();
  const payloadDemande = {
    clientNom: "Client Test Injection",
    clientTelephone: "+241 07 07 07 07",
    clientAdresse: "Libreville, Akébé (test)",
    clientEmail: "test-injection@example.com",
    commentaire: "Demande de test injectée via --maintenance=injecter-demande-test",
    lignes: [{ produitId, motif: "Produit de test", taille: "60x60", quantite: 2, prixIndicatif: 10000 }],
  };

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
