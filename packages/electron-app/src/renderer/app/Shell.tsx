import { useState } from "react";
import type { ReactNode } from "react";
import { Logo, Button, defaultTokens } from "@maxi-equip/design-system";
import { IndicateurSynchronisation } from "./components/IndicateurSynchronisation.js";
import { IndicateurNotifications } from "./components/IndicateurNotifications.js";
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  ShoppingCart,
  Receipt,
  MessageSquareText,
  History,
  LogOut,
  Settings,
} from "lucide-react";
import logoUrl from "../assets/maxi-equip-logo.png";

export type ScreenId = "dashboard" | "produits" | "stock" | "transferts" | "ventes" | "factures" | "demandes" | "historique" | "parametres";

export interface NavItem {
  id: ScreenId;
  label: string;
  /** false si l'utilisateur connecté n'a pas le droit d'accéder à cet écran — Corrections/Phase 2 §7. */
  autorise: boolean;
  /** Correction "Workflow réel des demandes", Partie 18/19 : compteur réel affiché à côté du libellé, jamais purement visuel. `undefined`/0 = aucun badge affiché. */
  badge?: number;
}

export interface ShellProps {
  session: { nom: string; role: string };
  navItems: NavItem[];
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  onLogout: () => void;
  /** Correction "Workflow réel des demandes", Partie 15/16 : clic sur une notification de demande — redirige ET met en évidence la demande concernée, jamais une simple ouverture de modal isolée. */
  onOuvrirDemande: (demandeId: string) => void;
  children: ReactNode;
}

const ICONS: Record<ScreenId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  produits: Package,
  stock: Boxes,
  transferts: ArrowLeftRight,
  ventes: ShoppingCart,
  factures: Receipt,
  demandes: MessageSquareText,
  historique: History,
  parametres: Settings,
};

/**
 * Coquille de l'application principale — navigation + zone de contenu
 * (Phase 2 §5/§6). Les entrées non autorisées pour le rôle connecté ne
 * sont ni affichées ni activables (§7 : « elle ne doit pas être
 * présentée comme disponible ») — la protection réelle reste néanmoins
 * assurée côté IPC/services, jamais uniquement ici.
 */
export function Shell({ session, navItems, activeScreen, onNavigate, onLogout, onOuvrirDemande, children }: ShellProps) {
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
          <span style={{ color: "#fff", fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: defaultTokens.fluidType.h2 }}>
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
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: defaultTokens.radius.sm,
                    border: "none",
                    background: active ? defaultTokens.colors.sidebarActive : "transparent",
                    color: active ? "#fff" : "rgba(255,255,255,0.75)",
                    fontSize: defaultTokens.fluidType.bodySmall,
                    fontWeight: active ? 700 : 500,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon size={17} />
                    {item.label}
                  </span>
                  {!!item.badge && (
                    <span
                      style={{
                        background: active ? "rgba(255,255,255,0.25)" : defaultTokens.colors.danger,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: defaultTokens.radius.pill,
                        minWidth: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 5px",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>

        <div style={{ borderTop: `1px solid ${defaultTokens.colors.sidebarBorder}`, paddingTop: 12, marginTop: 12 }}>
          <div style={{ padding: "0 8px 10px", color: "rgba(255,255,255,0.9)" }}>
            <div style={{ fontSize: defaultTokens.fluidType.bodySmall, fontWeight: 700 }}>{session.nom}</div>
            <div style={{ fontSize: defaultTokens.fluidType.caption, color: "rgba(255,255,255,0.55)", textTransform: "capitalize" }}>{session.role}</div>
          </div>
          <Button variant="ghost" loading={logoutLoading} onClick={() => void handleLogout()} style={{ width: "100%", color: "rgba(255,255,255,0.75)" }}>
            <LogOut size={15} />
            Déconnexion
          </Button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", background: defaultTokens.colors.bg, display: "flex", flexDirection: "column" }}>
        {/*
          Barre supérieure globale — partagée par TOUS les écrans,
          identique pour Administrateur et Gérant. Contient désormais
          l'indicateur de notifications (Phase 4.1 — l'élément anticipé
          lors de la correction "Affichage de la synchronisation", jamais
          construit avant d'être réellement nécessaire) et l'indicateur
          de synchronisation, dans cet ordre, à droite.
        */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 10,
            padding: "10px 24px",
            borderBottom: `1px solid ${defaultTokens.colors.borderSoft}`,
            background: "#fff",
          }}
        >
          <IndicateurNotifications onOuvrirDemande={onOuvrirDemande} />
          <IndicateurSynchronisation />
        </div>

        {/*
          Conteneur de largeur maximale — correction "adaptation
          responsive" : sans lui, un écran de contenu s'étire jusqu'au
          bord de la fenêtre quel qu'en soit la largeur, ce qui produit de
          grands espaces vides inutiles et des tableaux disproportionnés
          sur un grand moniteur ou une télévision. Centré, plafonné à
          layout.contentMaxWidth — sous cette largeur (dont 1280×720, la
          résolution de référence), aucun effet, la mise en page reste
          identique à avant cette correction.
        */}
        <div style={{ maxWidth: defaultTokens.layout.contentMaxWidth, margin: "0 auto", width: "100%", flex: 1, overflowY: "auto" }}>{children}</div>
      </main>
    </div>
  );
}
