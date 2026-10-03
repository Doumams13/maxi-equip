import { useEffect, useState } from "react";
import { LoginScreen } from "./LoginScreen.js";
import { SetupInitialScreen } from "./SetupInitialScreen.js";
import { AppRoot } from "./app/AppRoot.js";

/**
 * Point d'entrée de l'interface. Affiche l'écran de configuration
 * initiale (Phase 6C) tant qu'aucun utilisateur n'existe — signal
 * déterministe exposé par `setup:estRequis` (`repository.count() ===
 * 0`) —, puis l'écran de connexion tant qu'aucune session n'est active,
 * puis l'application principale (navigation + tableau de bord + écrans
 * métier — Phase 2) une fois authentifié.
 *
 * La fenêtre est une fenêtre Windows normale, librement redimensionnable.
 */
export function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    void (async () => {
      const requis = await window.maxiEquip.setupEstRequis();
      if (requis) {
        setSetupRequired(true);
        setCheckingSession(false);
        return;
      }
      const session = await window.maxiEquip.getSession();
      setAuthenticated(session !== null);
      setCheckingSession(false);
    })();
  }, []);

  if (checkingSession) return null;

  if (setupRequired) {
    return <SetupInitialScreen onSetupComplete={() => setSetupRequired(false)} />;
  }

  if (!authenticated) {
    return <LoginScreen onLoginSuccess={() => setAuthenticated(true)} />;
  }

  return <AppRoot onLoggedOut={() => setAuthenticated(false)} />;
}
