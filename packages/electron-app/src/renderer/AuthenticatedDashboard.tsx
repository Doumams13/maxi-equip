import { useEffect, useState } from "react";
import { Card, Button, Logo, defaultTokens } from "@maxi-equip/design-system";
import type { auth } from "@maxi-equip/domain";

type Status = { ping: string; db: string };
type Session = { userId: string; identifiant: string; nom: string; role: string; authentifieLe: string };
type Permissions = auth.PermissionSet;

export interface AuthenticatedDashboardProps {
  onLoggedOut: () => void;
}

/**
 * Tableau de bord minimal post-connexion — Phase 1. Montre que la session
 * et les permissions circulent correctement du domaine jusqu'à l'écran,
 * sans exposer aucun secret. Pas l'écran final (prévu en Phase 2) :
 * conserve volontairement la vérification du socle Phase 0 pour prouver
 * que rien n'a régressé.
 */
export function AuthenticatedDashboard({ onLoggedOut }: AuthenticatedDashboardProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setError(null);
    try {
      const [sessionResult, permissionsResult, ping, db] = await Promise.all([
        window.maxiEquip.getSession(),
        window.maxiEquip.getPermissions(),
        window.maxiEquip.ping(),
        window.maxiEquip.dbHealthCheck(),
      ]);
      setSession(sessionResult);
      setPermissions(permissionsResult);
      setStatus({
        ping: ping.message,
        db: `${db.tableCount} tables créées (${db.tables.slice(0, 3).join(", ")}…)`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleLogout() {
    await window.maxiEquip.logout();
    onLoggedOut();
  }

  return (
    <div style={{ fontFamily: defaultTokens.typography.body, background: defaultTokens.colors.bg, minHeight: "100vh", padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo />
          <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 20, color: defaultTokens.colors.text }}>
            MAXI EQUIP — Socle technique (Phase 1)
          </h1>
        </div>
        <Button variant="secondary" onClick={() => void handleLogout()}>
          Déconnexion
        </Button>
      </div>

      {error && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ color: defaultTokens.colors.danger }}>Erreur : {error}</p>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Session locale</h2>
        {session ? (
          <>
            <p style={{ color: defaultTokens.colors.success, margin: "4px 0" }}>
              ✅ Connecté en tant que <strong>{session.nom}</strong> ({session.identifiant})
            </p>
            <p style={{ margin: "4px 0" }}>
              Rôle : <strong>{session.role}</strong>
            </p>
            <p style={{ margin: "4px 0", fontSize: 12, color: defaultTokens.colors.textFaint }}>
              Authentifié le {new Date(session.authentifieLe).toLocaleString("fr-FR")}
            </p>
          </>
        ) : (
          <p>Aucune session active.</p>
        )}
      </Card>

      {permissions && (
        <Card style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Permissions (rôle {session?.role})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Object.entries(permissions as unknown as Record<string, boolean>).map(([key, value]) => (
              <div key={key} style={{ fontSize: 13, color: value ? defaultTokens.colors.success : defaultTokens.colors.textFaint }}>
                {value ? "✅" : "⛔"} {key}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Vérification du socle (Phase 0)</h2>
        {status ? (
          <>
            <p style={{ color: defaultTokens.colors.success, margin: "4px 0" }}>✅ {status.ping}</p>
            <p style={{ color: defaultTokens.colors.success, margin: "4px 0" }}>✅ Base locale chiffrée opérationnelle — {status.db}</p>
          </>
        ) : (
          <p>Vérification en cours…</p>
        )}
        <Button onClick={() => void loadAll()} variant="secondary">
          Relancer la vérification
        </Button>
      </Card>
    </div>
  );
}
