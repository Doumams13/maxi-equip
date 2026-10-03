import { ipcMain } from "electron";
import type { UtilisateurRepository } from "../auth/utilisateurRepository.js";
import type { UtilisateurService } from "../services/utilisateurService.js";
import { pousserMotDePasseRecuperation } from "../services/recuperationInstallationService.js";

/**
 * Configuration initiale (Phase 6C) — remplace le mot de passe
 * Administrateur généré aléatoirement (abandonné). Aucun compte n'est
 * plus créé automatiquement au démarrage : c'est désormais
 * l'utilisateur qui choisit lui-même le mot de passe du premier
 * Administrateur, via l'écran affiché par le Renderer tant que
 * `setup:estRequis` répond `true`.
 *
 * SIGNAL DÉTERMINISTE (jamais un second indicateur "initialisé"
 * dupliqué) : l'installation est considérée comme déjà initialisée dès
 * qu'AU MOINS UN utilisateur existe — exactement le même signal que
 * l'ancien mécanisme de bootstrap (désormais supprimé) utilisait déjà
 * (`repository.count() > 0`). Une base restaurée/conservée lors d'une
 * réinstallation contient
 * déjà son Administrateur : `setup:estRequis` répond alors
 * immédiatement `false`, l'écran de configuration initiale ne s'affiche
 * jamais, rien n'est recréé ni écrasé (§6 du cahier des charges).
 *
 * Aucune seconde logique de création de compte : `setup:creerAdmin`
 * délègue entièrement à `UtilisateurService.creerUtilisateur` (déjà
 * validé — Argon2id, politique de mot de passe, unicité de
 * l'identifiant), avec le rôle forcé à "administrateur" et une
 * revérification défensive que l'installation n'a pas déjà été
 * initialisée entre-temps (jamais un second Administrateur créé par ce
 * canal une fois la configuration initiale terminée).
 */
export interface CreerAdminInitialInput {
  nom: string;
  identifiant: string;
  motDePasse: string;
  confirmation: string;
}

/**
 * Logique pure, exportée séparément de `ipcMain.handle` pour rester
 * testable directement en Vitest — ce projet ne mocke jamais `electron`
 * dans ses tests (voir metier.catalogSync.test.ts).
 */
export function estSetupRequis(repository: Pick<UtilisateurRepository, "count">): boolean {
  return repository.count() === 0;
}

/**
 * Idem : logique pure de création de l'Administrateur initial, séparée
 * du câblage IPC. Délègue entièrement à `UtilisateurService.creerUtilisateur`
 * (Argon2id, politique de mot de passe, unicité déjà validées) — aucune
 * seconde logique de création de compte.
 */
export async function creerAdminInitial(
  repository: Pick<UtilisateurRepository, "count">,
  service: Pick<UtilisateurService, "creerUtilisateur">,
  input: CreerAdminInitialInput
): Promise<{ success: boolean; message?: string }> {
  if (repository.count() > 0) {
    // Défense en profondeur — jamais atteint en usage normal (l'écran
    // de configuration initiale ne s'affiche déjà plus dans ce cas),
    // mais jamais un second Administrateur créé si ce canal était
    // appelé après coup (§6 : ne jamais recréer l'Administrateur).
    return { success: false, message: "L'installation est déjà initialisée." };
  }
  try {
    await service.creerUtilisateur({ ...input, role: "administrateur" });
    // Best-effort (voir recuperationInstallationService.ts) — jamais
    // bloquant : la création du compte local a déjà réussi à cet instant.
    void pousserMotDePasseRecuperation(input.motDePasse);
    return { success: true };
  } catch (err) {
    // Message métier déjà propre (UtilisateurService.creerUtilisateur
    // ne lève que des erreurs destinées à l'utilisateur) — jamais une
    // trace technique, jamais le mot de passe, jamais journalisé.
    return { success: false, message: err instanceof Error ? err.message : "Une erreur inattendue s'est produite." };
  }
}

export function registerSetupIpcHandlers(repository: UtilisateurRepository, service: UtilisateurService): void {
  ipcMain.handle("setup:estRequis", (): boolean => estSetupRequis(repository));

  ipcMain.handle(
    "setup:creerAdmin",
    async (_event, input: CreerAdminInitialInput): Promise<{ success: boolean; message?: string }> =>
      creerAdminInitial(repository, service, input)
  );
}
