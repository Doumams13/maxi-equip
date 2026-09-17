import type { auth } from "@maxi-equip/domain";
import type { Role } from "@maxi-equip/shared-types";
import type { UtilisateurRepository, UtilisateurPublic } from "../auth/utilisateurRepository.js";

/**
 * Politique de mot de passe interne — jamais exposée directement au
 * Renderer. Retourne un message d'erreur ou null si le mot de passe est
 * valide.
 */
function validerPolitiqueMotDePasse(motDePasse: string): string | null {
  if (!motDePasse) return "Le mot de passe est obligatoire.";
  if (motDePasse.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  return null;
}

/**
 * Service de gestion des utilisateurs — orchestre le repository + hasher
 * + règles métier. Toutes les erreurs métier sont levées avec
 * `throw new Error("message")` ; les IPC les catchent et renvoient
 * `{ success: false, message }`.
 *
 * Sécurité : le hash n'est JAMAIS présent dans les données retournées ;
 * les mots de passe ne sont JAMAIS journalisés.
 */
export class UtilisateurService {
  constructor(
    private readonly repository: UtilisateurRepository,
    private readonly hasher: auth.PasswordHasher
  ) {}

  /** Liste tous les utilisateurs (sans hash), triés par nom ASC. */
  listerUtilisateurs(): UtilisateurPublic[] {
    return this.repository.list();
  }

  /**
   * Crée un utilisateur après validation complète :
   * nom non vide, identifiant non vide, rôle obligatoire,
   * politique mot de passe, confirmation identique, identifiant unique.
   */
  async creerUtilisateur(input: {
    nom: string;
    identifiant: string;
    role: Role;
    motDePasse: string;
    confirmation: string;
  }): Promise<{ id: string }> {
    if (!input.nom || !input.nom.trim()) {
      throw new Error("Le nom est obligatoire.");
    }
    if (!input.identifiant || !input.identifiant.trim()) {
      throw new Error("L'identifiant est obligatoire.");
    }
    if (!input.role) {
      throw new Error("Le rôle est obligatoire.");
    }

    const erreurMotDePasse = validerPolitiqueMotDePasse(input.motDePasse);
    if (erreurMotDePasse) throw new Error(erreurMotDePasse);

    if (input.motDePasse !== input.confirmation) {
      throw new Error("La confirmation du mot de passe ne correspond pas.");
    }

    if (this.repository.identifiantPris(input.identifiant)) {
      throw new Error(`L'identifiant "${input.identifiant}" est déjà utilisé.`);
    }

    // Le mot de passe en clair n'est jamais journalisé ni persisté tel quel.
    const passwordHash = await this.hasher.hash(input.motDePasse);
    const id = this.repository.create({
      nom: input.nom.trim(),
      identifiant: input.identifiant.trim(),
      role: input.role,
      passwordHash,
    });

    return { id };
  }

  /**
   * Modifie un utilisateur existant.
   * Protections :
   * - l'utilisateur doit exister
   * - si changement d'identifiant → non vide + unique (hors soi-même)
   * - si changement de nom → non vide
   * - PROTECTION LAST ADMIN : si le rôle passe de "administrateur" à
   *   "gerant" ET que l'utilisateur est actif ET qu'il est le seul admin
   *   actif → erreur
   */
  modifierUtilisateur(
    id: string,
    input: { nom?: string; role?: Role; identifiant?: string }
  ): void {
    const utilisateur = this.repository.findById(id);
    if (!utilisateur) {
      throw new Error("Utilisateur introuvable.");
    }

    if (input.nom !== undefined) {
      if (!input.nom.trim()) {
        throw new Error("Le nom ne peut pas être vide.");
      }
    }

    if (input.identifiant !== undefined) {
      if (!input.identifiant.trim()) {
        throw new Error("L'identifiant ne peut pas être vide.");
      }
      if (this.repository.identifiantPris(input.identifiant.trim(), id)) {
        throw new Error(`L'identifiant "${input.identifiant}" est déjà utilisé.`);
      }
    }

    // Protection "dernier administrateur actif"
    if (
      input.role !== undefined &&
      input.role !== "administrateur" &&
      utilisateur.role === "administrateur" &&
      utilisateur.actif
    ) {
      const nbAdminsActifs = this.repository.countAdminActifs();
      if (nbAdminsActifs <= 1) {
        throw new Error(
          "Impossible de changer le rôle du dernier Administrateur actif."
        );
      }
    }

    const sanitized: { nom?: string; role?: Role; identifiant?: string } = {};
    if (input.nom !== undefined) sanitized.nom = input.nom.trim();
    if (input.role !== undefined) sanitized.role = input.role;
    if (input.identifiant !== undefined) sanitized.identifiant = input.identifiant.trim();

    this.repository.update(id, sanitized);
  }

  /**
   * Réinitialise le mot de passe d'un utilisateur existant.
   * Validations : utilisateur existe, politique mot de passe, confirmation.
   * Le mot de passe en clair n'est jamais journalisé.
   */
  async reinitialiserMotDePasse(
    id: string,
    input: { motDePasse: string; confirmation: string }
  ): Promise<void> {
    const utilisateur = this.repository.findById(id);
    if (!utilisateur) {
      throw new Error("Utilisateur introuvable.");
    }

    const erreurMotDePasse = validerPolitiqueMotDePasse(input.motDePasse);
    if (erreurMotDePasse) throw new Error(erreurMotDePasse);

    if (input.motDePasse !== input.confirmation) {
      throw new Error("La confirmation du mot de passe ne correspond pas.");
    }

    const hash = await this.hasher.hash(input.motDePasse);
    this.repository.updatePasswordHash(id, hash);
  }

  /**
   * Désactive un utilisateur.
   * Validations :
   * - l'utilisateur doit exister
   * - pas déjà désactivé
   * - PROTECTION LAST ADMIN : si l'utilisateur est admin ET c'est le
   *   seul admin actif → erreur
   */
  desactiverUtilisateur(id: string): void {
    const utilisateur = this.repository.findById(id);
    if (!utilisateur) {
      throw new Error("Utilisateur introuvable.");
    }
    if (!utilisateur.actif) {
      throw new Error("Cet utilisateur est déjà désactivé.");
    }
    if (utilisateur.role === "administrateur") {
      const nbAdminsActifs = this.repository.countAdminActifs();
      if (nbAdminsActifs <= 1) {
        throw new Error(
          "Impossible de désactiver le dernier Administrateur actif."
        );
      }
    }
    this.repository.deactivate(id);
  }

  /**
   * Réactive un utilisateur existant (l'utilisateur doit exister).
   */
  activerUtilisateur(id: string): void {
    const utilisateur = this.repository.findById(id);
    if (!utilisateur) {
      throw new Error("Utilisateur introuvable.");
    }
    this.repository.activate(id);
  }
}
