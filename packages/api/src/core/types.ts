/**
 * Contrat provider-agnostique pour les fonctions serverless (Synthèse §2/§5).
 *
 * Le fournisseur d'hébergement précis n'est pas encore arrêté (choix reporté
 * à l'issue de la définition de la stack — Synthèse §2). Pour ne pas lier
 * prématurément tout le code métier à un format d'écriture propriétaire
 * (risque de dépendance signalé et neutralisé dans les Corrections §2), les
 * routes sont écrites contre ce contrat minimal et provider-agnostique.
 * Adapter vers un fournisseur précis consistera à écrire une fine couche
 * d'adaptation (voir local-dev-server.ts pour un exemple avec Node http),
 * jamais à réécrire les routes elles-mêmes.
 */

export type TrustLevel = "public" | "app";

export interface ApiRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  query: Record<string, string | undefined>;
  /**
   * Correction "Intégration Site Phase 5" — nécessaire pour la
   * limitation de fréquence par adresse (rate limiting) des routes
   * publiques, désormais réellement exposées à un trafic non maîtrisé
   * pour la première fois (auparavant purement théorique, voir
   * router.ts). `undefined` si l'adaptateur d'hébergement ne peut pas
   * la déterminer — jamais une valeur inventée.
   */
  ip?: string;
  /**
   * Renseigné UNIQUEMENT après une validation JWT réelle réussie
   * (Partie 4, point 9 de la correction "Sécurisation de l'API") —
   * jamais présent pour une route publique, jamais renseigné à partir
   * d'une simple présence de jeton non vérifiée.
   */
  auth?: { sub: string; role?: string };
}

export interface ApiResponse {
  status: number;
  body: unknown;
  /**
   * Réponse binaire — correction "Intégration Site Phase 5" (images
   * catalogue). Quand renseigné, `body` est ignoré par l'adaptateur
   * d'hébergement (`local-dev-server.ts`) : les octets de `data` sont
   * envoyés tels quels avec le `Content-Type` indiqué, jamais passés à
   * `JSON.stringify` (qui corromprait des données binaires). Absent pour
   * toutes les routes JSON existantes — champ additif, sans impact sur le
   * contrat déjà utilisé par les routes en place.
   */
  raw?: { contentType: string; data: Buffer };
}

export type Handler = (req: ApiRequest) => Promise<ApiResponse> | ApiResponse;

export interface Route {
  method: ApiRequest["method"];
  /** Chemin sans le préfixe de version, ex. "/demandes" (pas "/v1/demandes"). */
  path: string;
  trustLevel: TrustLevel;
  handler: Handler;
}
