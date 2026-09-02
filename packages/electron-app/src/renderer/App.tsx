import { useEffect, useState } from "react";
import { Card, Button, Logo, defaultTokens } from "@maxi-equip/design-system";

type Status = { ping: string; db: string };

/**
 * Écran de vérification du socle — PAS un écran métier. Il prouve que la
 * chaîne complète fonctionne : Renderer → preload → IPC → base SQLite
 * chiffrée → retour à l'écran. Sera remplacé par les vrais écrans en
 * Phase 2.
 */
export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runChecks() {
    setError(null);
    try {
      const ping = await window.maxiEquip.ping();
      const db = await window.maxiEquip.dbHealthCheck();
      setStatus({
        ping: ping.message,
        db: `${db.tableCount} tables créées (${db.tables.slice(0, 3).join(", ")}…)`,
      });
      // eslint-disable-next-line no-console
      console.log("PHASE0_VERIFICATION_OK", ping.message, db.tableCount, "tables");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void runChecks();
  }, []);

  return (
    <div
      style={{
        fontFamily: defaultTokens.typography.body,
        background: defaultTokens.colors.bg,
        minHeight: "100vh",
        padding: 32,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Logo />
        <h1
          style={{
            fontFamily: defaultTokens.typography.display,
            fontSize: 20,
            color: defaultTokens.colors.text,
          }}
        >
          MAXI EQUIP — Socle technique (Phase 0)
        </h1>
      </div>

      <Card>
        {error ? (
          <p style={{ color: defaultTokens.colors.danger }}>Erreur : {error}</p>
        ) : status ? (
          <>
            <p style={{ color: defaultTokens.colors.success }}>✅ {status.ping}</p>
            <p style={{ color: defaultTokens.colors.success }}>
              ✅ Base locale chiffrée opérationnelle — {status.db}
            </p>
          </>
        ) : (
          <p>Vérification en cours…</p>
        )}
        <Button onClick={() => void runChecks()} variant="secondary">
          Relancer la vérification
        </Button>
      </Card>
    </div>
  );
}
