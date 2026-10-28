import { useEffect, useState } from "react";
import type { auth } from "@maxi-equip/domain";
import { useToast, Card, Button, defaultTokens } from "@maxi-equip/design-system";
import { Shell, type NavItem, type ScreenId } from "./Shell.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { ProduitsScreen } from "./screens/ProduitsScreen.js";
import { StockScreen } from "./screens/StockScreen.js";
import { TransfertsScreen } from "./screens/TransfertsScreen.js";
import { VentesScreen } from "./screens/VentesScreen.js";
import { FacturesScreen } from "./screens/FacturesScreen.js";
import { DemandesScreen } from "./screens/DemandesScreen.js";
import { HistoriqueScreen } from "./screens/HistoriqueScreen.js";
import { ParametresScreen } from "./screens/ParametresScreen.js";
import { UtilisateursScreen } from "./screens/UtilisateursScreen.js";
import { PostesScreen } from "./screens/PostesScreen.js";
import { PromotionsScreen } from "./screens/PromotionsScreen.js";
import { BilanScreen } from "./screens/BilanScreen.js";

type Session = { userId: string; identifiant: string; nom: string; role: string };

/**
 * Cible d'une navigation "cliquable" depuis l'Historique ou le Dashboard
 * (Consolidation §16-§21, complétée par "Entrée de stock / Transferts"
 * §12-§17) — un type d'opération + son identifiant réel, jamais une
 * correspondance approximative par nom/date/montant.
 */
export type CibleOperation =
  | { type: "facture"; id: string }
  | { type: "entree"; id: string }
  | { type: "transfert"; id: string }
  | { type: "demande"; id: string }
  // Correction "Dashboard cliquable" (2026-10-21) — `id` = identifiant du
  // MODÈLE (jamais une variante : la liste Carreaux est groupée par
  // modèle, voir ProduitsScreen.tsx).
  | { type: "produit"; id: string };

export interface AppRootProps {
  onLoggedOut: () => void;
}

/**
 * Point d'entrée de l'application principale (Phase 2). Construit la
 * navigation à partir des permissions réelles de l'utilisateur connecté
 * (getPermissionSet, déjà en place depuis la Phase 1) — une entrée non
 * autorisée n'est ni affichée ni activable (§7). Rappel : ceci est un
 * confort d'interface, la protection réelle reste assurée par les
 * services/IPC (voir main/ipc/metier.ts), jamais uniquement ici.
 */
export function AppRoot({ onLoggedOut }: AppRootProps) {
  const { showSuccess, showError } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<auth.PermissionSet | null>(null);
  const [activeScreen, setActiveScreen] = useState<ScreenId>("dashboard");
  const [loading, setLoading] = useState(true);
  const [cibleSurbrillance, setCibleSurbrillance] = useState<CibleOperation | null>(null);
  const [factureAPreRemplir, setFactureAPreRemplir] = useState<string | null>(null);
  const [demandeAPreRemplir, setDemandeAPreRemplir] = useState<string | null>(null);
  const [demandesActives, setDemandesActives] = useState(0);
  const [nomPosteRequis, setNomPosteRequis] = useState(false);

  /**
   * Correction "Workflow réel des demandes", Partie 18/19/20 : compteur
   * réel, jamais purement visuel — rafraîchi au chargement puis
   * périodiquement, comme l'indicateur de notifications déjà existant.
   */
  async function rafraichirCompteurDemandes() {
    try {
      setDemandesActives(await window.maxiEquip.demandesCompterActives());
    } catch {
      // Silencieux — un compteur momentanément indisponible ne doit jamais bloquer le reste de l'application.
    }
  }

  /**
   * Navigation cliquable centralisée (§16-§23 de la consolidation) : reçoit
   * une cible fiable (type + identifiant réel), bascule vers le module
   * approprié, et transmet la cible pour que l'écran de destination
   * retrouve, fasse défiler et mette en évidence la bonne ligne — jamais
   * une correspondance approximative par texte affiché.
   */
  function irVersOperation(cible: CibleOperation) {
    const ecran =
      cible.type === "facture" ? "factures" :
      cible.type === "entree" ? "stock" :
      cible.type === "transfert" ? "transferts" :
      cible.type === "produit" ? "produits" :
      "demandes";
    setActiveScreen(ecran);
    setCibleSurbrillance(cible);
  }

  /**
   * Ouverture directe depuis une notification vente/entree/sortie/
   * transfert — système multiposte fiable (2026-10-28). "vente" réutilise
   * la navigation facture déjà existante ; "entree"/"sortie"/"transfert"
   * ouvrent l'Historique (qui liste tous les mouvements, sans distinction
   * de type contrairement aux écrans Entrée de stock/Transferts) — jamais
   * de surbrillance précise pour ces trois-là pour l'instant, HistoriqueScreen
   * n'en ayant pas besoin pour rester consultable (recherche déjà possible).
   */
  function ouvrirEntiteNotification(entityType: string, entityId: string) {
    if (entityType === "vente") irVersOperation({ type: "facture", id: entityId });
    else setActiveScreen("historique");
  }

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([window.maxiEquip.getSession(), window.maxiEquip.getPermissions()]);
      setSession(s);
      setPermissions(p);
      setLoading(false);

      // Système multiposte fiable (2026-10-28) : juste après une
      // restauration, le nouveau poste n'a pas encore de nom choisi
      // (voir postes/moi.ts côté API) — aucun appel réseau émis sur une
      // installation indépendante (isolation garantie côté Main, voir
      // posteSyncService.ts).
      if (s) {
        const moi = await window.maxiEquip.posteObtenirMoi();
        if (moi.success && moi.poste !== null && moi.poste.nom === null) {
          setNomPosteRequis(true);
        }
      }
    })();
    void rafraichirCompteurDemandes();
    const intervalle = setInterval(() => void rafraichirCompteurDemandes(), 15000);
    return () => clearInterval(intervalle);
  }, []);

  /**
   * Blocage à distance (2026-10-28) — abonnement PERMANENT (jamais
   * conditionné à la session, un blocage doit pouvoir être détecté à
   * tout moment) : le cycle de synchro automatique côté Main peut
   * fermer cette session SANS qu'aucun écran n'ait rien demandé (voir
   * main/index.ts, `lancerSyncAutomatique`) — ce poste doit alors
   * revenir à l'écran de connexion IMMÉDIATEMENT, jamais attendre une
   * prochaine action de l'utilisateur qui échouerait silencieusement.
   */
  useEffect(() => {
    return window.maxiEquip.onSessionRevoquee((message) => {
      showError("Poste bloqué", message);
      onLoggedOut();
    });
  }, [onLoggedOut, showError]);

  async function handleLogout() {
    await window.maxiEquip.logout();
    showSuccess("Déconnexion réussie", "Vous avez été déconnecté avec succès.");
    onLoggedOut();
  }

  if (loading || !session || !permissions) return null;

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Tableau de bord", autorise: permissions.canAccessOperationalDashboard },
    { id: "produits", label: "Carreaux", autorise: permissions.canOperateStock },
    { id: "stock", label: "Entrée de stock", autorise: permissions.canOperateStock },
    { id: "transferts", label: "Transferts", autorise: permissions.canOperateStock },
    { id: "ventes", label: "Vente", autorise: permissions.canOperateSales },
    { id: "factures", label: "Factures", autorise: permissions.canAccessHistory },
    { id: "demandes", label: "Demandes", autorise: permissions.canHandleSiteRequests, badge: demandesActives > 0 ? demandesActives : undefined },
    { id: "historique", label: "Historique", autorise: permissions.canAccessHistory },
    { id: "promotions", label: "Promotions", autorise: permissions.canManagePromotions },
    { id: "utilisateurs", label: "Utilisateurs", autorise: permissions.canManageUsers },
    // Système multiposte fiable (2026-10-28) — réservé à l'Administrateur,
    // même garde que "Utilisateurs" (la protection réelle reste côté IPC,
    // checkAdminGuard, voir ipc/postes.ts).
    { id: "postes", label: "Postes", autorise: permissions.canManageUsers },
    { id: "parametres", label: "Paramètres", autorise: permissions.canEditCompanySettings },
    // Correction "bilan d'activité" (2026-10-21) — réservé à l'Administrateur
    // (décision confirmée), la protection réelle restant côté IPC
    // (checkAdminGuard, voir main/ipc/metier.ts), jamais uniquement ici.
    { id: "bilan", label: "Bilan", autorise: session!.role === "administrateur" },
  ];

  function renderScreen() {
    switch (activeScreen) {
      case "dashboard":
        return (
          <DashboardScreen
            session={{ userId: session!.userId, nom: session!.nom, role: session!.role }}
            onNaviguerVersOperation={irVersOperation}
            onNaviguerVersEcran={(ecran) => setActiveScreen(ecran)}
          />
        );
      case "produits":
        return (
          <ProduitsScreen
            session={{ userId: session!.userId }}
            cibleSurbrillance={cibleSurbrillance?.type === "produit" ? cibleSurbrillance.id : null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
          />
        );
      case "stock":
        return (
          <StockScreen
            session={{ userId: session!.userId }}
            cibleSurbrillance={cibleSurbrillance?.type === "entree" ? cibleSurbrillance.id : null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
          />
        );
      case "transferts":
        return (
          <TransfertsScreen
            session={{ userId: session!.userId }}
            cibleSurbrillance={cibleSurbrillance?.type === "transfert" ? cibleSurbrillance.id : null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
          />
        );
      case "ventes":
        return (
          <VentesScreen
            session={{ userId: session!.userId, nom: session!.nom }}
            factureAPreRemplir={factureAPreRemplir}
            onPreRemplissageConsomme={() => setFactureAPreRemplir(null)}
            demandeAPreRemplir={demandeAPreRemplir}
            onPreRemplissageDemandeConsomme={() => {
              setDemandeAPreRemplir(null);
              void rafraichirCompteurDemandes();
            }}
          />
        );
      case "factures":
        return (
          <FacturesScreen
            session={{ userId: session!.userId, role: session!.role }}
            cibleSurbrillance={cibleSurbrillance?.type === "facture" ? cibleSurbrillance.id : null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
            onNouvelleSortie={() => setActiveScreen("ventes")}
            onModifierFacture={(factureId) => {
              setFactureAPreRemplir(factureId);
              setActiveScreen("ventes");
            }}
          />
        );
      case "demandes":
        return (
          <DemandesScreen
            session={{ userId: session!.userId, nom: session!.nom }}
            cibleSurbrillance={cibleSurbrillance?.type === "demande" ? cibleSurbrillance.id : null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
            onTraiterDemande={(demandeId) => {
              setDemandeAPreRemplir(demandeId);
              setActiveScreen("ventes");
            }}
          />
        );
      case "historique":
        return (
          <HistoriqueScreen
            session={{ userId: session!.userId }}
            cibleSurbrillance={null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
            onNaviguerVersOperation={irVersOperation}
          />
        );
      case "promotions":
        if (!permissions!.canManagePromotions) return null;
        return <PromotionsScreen />;
      case "utilisateurs":
        if (!permissions!.canManageUsers) return null;
        return <UtilisateursScreen />;
      case "postes":
        if (!permissions!.canManageUsers) return null;
        return <PostesScreen />;
      case "parametres":
        if (!permissions!.canEditCompanySettings) return null;
        return <ParametresScreen />;
      case "bilan":
        if (session!.role !== "administrateur") return null;
        return <BilanScreen />;
      default:
        return null;
    }
  }

  return (
    <>
      <Shell
        session={{ nom: session.nom, role: session.role }}
        navItems={navItems}
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        onLogout={handleLogout}
        onOuvrirDemande={(demandeId) => irVersOperation({ type: "demande", id: demandeId })}
        onOuvrirEntite={ouvrirEntiteNotification}
      >
        {renderScreen()}
      </Shell>
      {nomPosteRequis && <ModalNommerPoste onSuccess={() => setNomPosteRequis(false)} />}
    </>
  );
}

/**
 * Modale "nommer ce poste" — système multiposte fiable (2026-10-28).
 * Affichée une seule fois, juste après qu'un poste fraîchement
 * restauré/enregistré ait obtenu une identité technique mais pas encore
 * de nom choisi (voir l'effet ci-dessus) — jamais fermable sans
 * nommer : un poste sans nom reste identifiable seulement par son id
 * technique dans l'écran de gestion, ce qui gênerait l'administration
 * au quotidien.
 */
function ModalNommerPoste({ onSuccess }: { onSuccess: () => void }) {
  const { showSuccess, showError } = useToast();
  const [nom, setNom] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function handleSoumettre() {
    if (!nom.trim()) return;
    setEnCours(true);
    try {
      const res = await window.maxiEquip.posteDefinirNom(nom.trim());
      if (res.success) {
        showSuccess("Poste nommé", `Ce poste s'appelle désormais « ${nom.trim()} ».`);
        onSuccess();
      } else {
        showError("Impossible d'enregistrer ce nom", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
      <Card elevated style={{ width: "min(440px, 92vw)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Donnez un nom à ce poste</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
          Ce nom aide à reconnaître ce poste dans l'écran « Postes » (ex. « PCX1 - Comptoir »). Il peut être modifié plus tard, sans jamais changer
          l'identité technique de ce poste.
        </p>
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="ex : PCX1 - Comptoir"
          autoFocus
          style={{
            padding: "9px 12px",
            borderRadius: defaultTokens.radius.sm,
            border: `1px solid ${defaultTokens.colors.border}`,
            fontFamily: defaultTokens.typography.body,
            fontSize: 14,
            width: "100%",
            boxSizing: "border-box",
            background: "#fff",
            color: defaultTokens.colors.text,
            marginBottom: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSoumettre();
          }}
        />
        <Button onClick={() => void handleSoumettre()} loading={enCours} disabled={!nom.trim()} style={{ width: "100%" }}>
          Enregistrer
        </Button>
      </Card>
    </div>
  );
}
