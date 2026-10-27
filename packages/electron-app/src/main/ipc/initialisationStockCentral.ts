import { ipcMain } from "electron";
import { StockRepository } from "../repositories/stockRepository.js";
import { ValidationStockDistanteService, type ResultatInitialisationStock } from "../services/validationStockDistanteService.js";
import type { SessionManager } from "../auth/sessionManager.js";

/**
 * Amorçage ponctuel de `stock_central` — correction "pc annexe ne peut
 * pas vendre malgré le stock réel" (2026-10-27), voir
 * `ValidationStockDistanteService.initialiserStockCentral` pour le
 * raisonnement complet.
 *
 * Réservé à l'Administrateur : le jeton de synchronisation de ce poste
 * ne porte pas d'identité par utilisateur (un seul jeton par
 * INSTALLATION), donc le serveur ne peut pas distinguer qui appelle —
 * la vérification vit ici, jamais seulement masquée côté Renderer (même
 * principe que `parametres:setIdentite` dans ipc/metier.ts).
 *
 * Logique extraite dans une fonction pure (`executerInitialisationStockCentral`),
 * jamais directement dans le callback `ipcMain.handle` — ce projet ne
 * mocke jamais `electron` dans ses tests (voir metier.catalogSync.test.ts),
 * donc toute logique à tester doit rester appelable sans lui.
 */
export async function executerInitialisationStockCentral(
  stockRepository: Pick<StockRepository, "listTout">,
  validationStockDistanteService: Pick<ValidationStockDistanteService, "estConfiguree" | "initialiserStockCentral">,
  session: { role: string } | null
): Promise<ResultatInitialisationStock> {
  if (!session || session.role !== "administrateur") {
    return { success: false, message: "Seul l'Administrateur peut effectuer cette action." };
  }
  if (!validationStockDistanteService.estConfiguree()) {
    return { success: false, message: "Synchronisation non configurée sur ce poste." };
  }
  const lignes = stockRepository.listTout();
  if (lignes.length === 0) {
    return { success: false, message: "Aucune ligne de stock trouvée sur ce poste." };
  }
  return validationStockDistanteService.initialiserStockCentral(lignes);
}

export function registerInitialisationStockCentralIpcHandlers(
  stockRepository: StockRepository,
  validationStockDistanteService: ValidationStockDistanteService,
  sessionManager: SessionManager
): void {
  ipcMain.handle("stock:initialiserCentral", () =>
    executerInitialisationStockCentral(stockRepository, validationStockDistanteService, sessionManager.get())
  );
}
