import { useEffect, useState } from "react";
import type { auth } from "@maxi-equip/domain";
import { useToast } from "@maxi-equip/design-system";
import { Shell, type NavItem, type ScreenId } from "./Shell.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { ProduitsScreen } from "./screens/ProduitsScreen.js";
import { StockScreen } from "./screens/StockScreen.js";
import { VentesScreen } from "./screens/VentesScreen.js";
import { FacturesScreen } from "./screens/FacturesScreen.js";
import { HistoriqueScreen } from "./screens/HistoriqueScreen.js";

type Session = { userId: string; identifiant: string; nom: string; role: string };

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
    { id: "produits", label: "Produits", autorise: permissions.canOperateStock },
    { id: "stock", label: "Stock", autorise: permissions.canOperateStock },
    { id: "ventes", label: "Ventes", autorise: permissions.canOperateSales },
    { id: "factures", label: "Facturation", autorise: permissions.canAccessHistory },
    { id: "historique", label: "Historique", autorise: permissions.canAccessHistory },
  ];

  function renderScreen() {
    switch (activeScreen) {
      case "dashboard":
        return <DashboardScreen />;
      case "produits":
        return <ProduitsScreen session={{ userId: session!.userId }} />;
      case "stock":
        return <StockScreen />;
      case "ventes":
        return <VentesScreen session={{ userId: session!.userId, nom: session!.nom }} />;
      case "factures":
        return <FacturesScreen />;
      case "historique":
        return <HistoriqueScreen />;
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
