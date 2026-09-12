import { useEffect, useRef, useState } from "react";
import { defaultTokens } from "@maxi-equip/design-system";
import { Bell } from "lucide-react";
import type { Notification } from "@maxi-equip/shared-types";

/**
 * Phase 4.1, Partie 5/6 — indicateur de notifications dans le Header
 * global (l'élément "futur" anticipé lors de la correction de
 * l'affichage de la synchronisation, jamais inventé avant d'être
 * réellement nécessaire). Positionné AVANT l'indicateur de
 * synchronisation, comme la maquette de cette correction l'annonçait
 * déjà.
 *
 * Au clic sur une notification liée à une demande : marque la
 * notification comme lue et navigue directement vers l'écran Demandes
 * (Partie 5 : "clic -> ouverture directe de la demande concernée").
 */
export function IndicateurNotifications({ onOuvrirDemandes }: { onOuvrirDemandes: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const conteneurRef = useRef<HTMLDivElement>(null);

  async function recharger() {
    const [liste, compte] = await Promise.all([window.maxiEquip.notificationsLister(), window.maxiEquip.notificationsCompterNonLues()]);
    setNotifications(liste);
    setNonLues(compte);
  }

  useEffect(() => {
    void recharger();
    const intervalle = setInterval(() => void recharger(), 15000);
    return () => clearInterval(intervalle);
  }, []);

  useEffect(() => {
    function fermerSiExterieur(e: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("mousedown", fermerSiExterieur);
    return () => document.removeEventListener("mousedown", fermerSiExterieur);
  }, []);

  async function handleClicNotification(n: Notification) {
    if (!n.lue) {
      await window.maxiEquip.notificationsMarquerLue(n.id);
      void recharger();
    }
    setOuvert(false);
    if (n.demandeId) onOuvrirDemandes();
  }

  return (
    <div ref={conteneurRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOuvert((v) => !v)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: defaultTokens.radius.pill,
          border: `1px solid ${defaultTokens.colors.border}`,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        <Bell size={15} color={defaultTokens.colors.textSoft} />
        {nonLues > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: defaultTokens.colors.danger,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              borderRadius: defaultTokens.radius.pill,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxHeight: 360,
            overflowY: "auto",
            background: "#fff",
            border: `1px solid ${defaultTokens.colors.border}`,
            borderRadius: defaultTokens.radius.md,
            boxShadow: "0 8px 24px rgba(20,35,20,0.12)",
            zIndex: 280,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 700,
              color: defaultTokens.colors.textFaint,
              borderBottom: `1px solid ${defaultTokens.colors.borderSoft}`,
            }}
          >
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Aucune notification pour le moment.</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => void handleClicNotification(n)}
                style={{
                  padding: "10px 14px",
                  borderBottom: `1px solid ${defaultTokens.colors.borderSoft}`,
                  cursor: n.demandeId ? "pointer" : "default",
                  background: n.lue ? "transparent" : defaultTokens.colors.accentSoft,
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: n.lue ? 500 : 700, color: defaultTokens.colors.text }}>{n.titre}</div>
                <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft, marginTop: 2 }}>{n.message}</div>
                <div style={{ fontSize: 10.5, color: defaultTokens.colors.textFaint, marginTop: 4 }}>
                  {new Date(n.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
