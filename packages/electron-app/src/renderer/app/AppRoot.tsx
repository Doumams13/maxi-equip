import { useEffect, useState } from "react";
import type { auth } from "@maxi-equip/domain";
import { useToast } from "@maxi-equip/design-system";
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

type Session = { userId: string; identifiant: string; nom: string; role: string };

/**
 * Cible d'une navigation "cliquable" depuis l'Historique ou le Dashboard
 * (Consolidation §16-§21, complétée par "Entrée de stock / Transferts"
 * §12-§17) — un type d'opération + son identifiant réel, jamais une
 * correspondance approximative par nom/date/montant.
 */
export type CibleOperation = { type: "facture"; id: string } | { type: "entree"; id: string } | { type: "transfert"; id: string };

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
  const { showSuccess } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<auth.PermissionSet | null>(null);
  const [activeScreen, setActiveScreen] = useState<ScreenId>("dashboard");
  const [loading, setLoading] = useState(true);
  const [cibleSurbrillance, setCibleSurbrillance] = useState<CibleOperation | null>(null);
  const [factureAPreRemplir, setFactureAPreRemplir] = useState<string | null>(null);

  /**
   * Navigation cliquable centralisée (§16-§23 de la consolidation) : reçoit
   * une cible fiable (type + identifiant réel), bascule vers le module
   * approprié, et transmet la cible pour que l'écran de destination
   * retrouve, fasse défiler et mette en évidence la bonne ligne — jamais
   * une correspondance approximative par texte affiché.
   */
  function irVersOperation(cible: CibleOperation) {
    const ecran = cible.type === "facture" ? "factures" : cible.type === "entree" ? "stock" : "transferts";
    setActiveScreen(ecran);
    setCibleSurbrillance(cible);
  }

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([window.maxiEquip.getSession(), window.maxiEquip.getPermissions()]);
      setSession(s);
      setPermissions(p);
      setLoading(false);
    })();
  }, []);

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
    { id: "demandes", label: "Demandes", autorise: permissions.canHandleSiteRequests },
    { id: "historique", label: "Historique", autorise: permissions.canAccessHistory },
    { id: "parametres", label: "Paramètres", autorise: permissions.canEditCompanySettings },
  ];

  function renderScreen() {
    switch (activeScreen) {
      case "dashboard":
        return (
          <DashboardScreen
            session={{ userId: session!.userId, nom: session!.nom, role: session!.role }}
            onNaviguerVersOperation={irVersOperation}
          />
        );
      case "produits":
        return <ProduitsScreen session={{ userId: session!.userId }} />;
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
        return <DemandesScreen session={{ userId: session!.userId, nom: session!.nom }} />;
      case "historique":
        return (
          <HistoriqueScreen
            session={{ userId: session!.userId }}
            cibleSurbrillance={null}
            onSurbrillanceAppliquee={() => setCibleSurbrillance(null)}
            onNaviguerVersOperation={irVersOperation}
          />
        );
      case "parametres":
        return <ParametresScreen />;
      default:
        return null;
    }
  }

  return (
    <Shell
      session={{ nom: session.nom, role: session.role }}
      navItems={navItems}
      activeScreen={activeScreen}
      onNavigate={setActiveScreen}
      onLogout={handleLogout}
    >
      {renderScreen()}
    </Shell>
  );
}
