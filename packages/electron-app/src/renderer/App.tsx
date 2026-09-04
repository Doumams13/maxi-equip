import { useEffect, useState } from "react";
import { LoginScreen } from "./LoginScreen.js";
import { AuthenticatedDashboard } from "./AuthenticatedDashboard.js";

/**
 * Point d'entrée de l'interface — Phase 1. Affiche l'écran de connexion
 * tant qu'aucune session n'est active, puis le tableau de bord minimal
 * une fois authentifié. Toujours pas les écrans métier définitifs
 * (prévus en Phase 2).
 */
export function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await window.maxiEquip.getSession();
      setAuthenticated(session !== null);
      setCheckingSession(false);
    })();
  }, []);

  if (checkingSession) return null;

  if (!authenticated) {
    return <LoginScreen onLoginSuccess={() => setAuthenticated(true)} />;
  }

  return <AuthenticatedDashboard onLoggedOut={() => setAuthenticated(false)} />;
}
