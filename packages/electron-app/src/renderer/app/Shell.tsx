import { useState } from "react";
import type { ReactNode } from "react";
import { Logo, Button, defaultTokens } from "@maxi-equip/design-system";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingCart,
  Receipt,
  History,
  LogOut,
} from "lucide-react";
import logoUrl from "../assets/maxi-equip-logo.png";

export type ScreenId = "dashboard" | "produits" | "stock" | "ventes" | "factures" | "historique";

export interface NavItem {
  id: ScreenId;
  label: string;
  /** false si l'utilisateur connecté n'a pas le droit d'accéder à cet écran — Corrections/Phase 2 §7. */
  autorise: boolean;
}

export interface ShellProps {
  session: { nom: string; role: string };
  navItems: NavItem[];
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onLogout: () => void;
  children: ReactNode;
}

const ICONS: Record<ScreenId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  produits: Package,
  stock: Boxes,
  ventes: ShoppingCart,
  factures: Receipt,
  historique: History,
};

/**
 * Coquille de l'application principale — navigation + zone de contenu
 * (Phase 2 §5/§6). Les entrées non autorisées pour le rôle connecté ne
 * sont ni affichées ni activables (§7 : « elle ne doit pas être
 * présentée comme disponible ») — la protection réelle reste néanmoins
 * assurée côté IPC/services, jamais uniquement ici.
 */
export function Shell({ session, navItems, activeScreen, onNavigate, onLogout, children }: ShellProps) {
  const [logoutLoading, setLogoutLoading] = useState(false);

  async function handleLogout() {
    setLogoutLoading(true);
    await onLogout();
  }

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", fontFamily: defaultTokens.typography.body }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: defaultTokens.colors.sidebar,
          display: "flex",
          flexDirection: "column",
          padding: "18px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 20px" }}>
          <Logo logoUrl={logoUrl} width={30} height={22} />
          <span style={{ color: "#fff", fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: 15 }}>
            MAXI EQUIP
          </span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {navItems
            .filter((item) => item.autorise)
            .map((item) => {
              const Icon = ICONS[item.id];
              const active = item.id === activeScreen;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: defaultTokens.radius.sm,
                    border: "none",
                    background: active ? defaultTokens.colors.sidebarActive : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,0.75)",
                    fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
        </nav>

        <div style={{ borderTop: `1px solid ${defaultTokens.colors.sidebarBorder}`, paddingTop: 12, marginTop: 12 }}>
          <div style={{ padding: "0 8px 10px", color: "rgba(255,255,255,0.9)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{session.nom}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textTransform: "capitalize" }}>{session.role}</div>
          </div>
          <Button variant="ghost" loading={logoutLoading} onClick={() => void handleLogout()} style={{ width: "100%", color: "rgba(255,255,255,0.75)" }}>
            <LogOut size={15} />
            Déconnexion
          </Button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", background: defaultTokens.colors.bg }}>
        {children}
      </main>
    </div>
  );
}
