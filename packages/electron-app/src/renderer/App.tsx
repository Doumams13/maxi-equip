import { useEffect, useState } from "react";
import { LoginScreen } from "./LoginScreen.js";
import { AuthenticatedDashboard } from "./AuthenticatedDashboard.js";

/**
 * Point d'entrée de l'interface — Phase 1. Affiche l'écran de connexion
 * tant qu'aucune session n'est active, puis le tableau de bord minimal
 * une fois authentifié. Toujours pas les écrans métier définitifs
 * (prévus en Phase 2).
 *
 * La fenêtre est verrouillée (1366×768, non redimensionnable) tant que
 * l'écran de connexion est affiché, et déverrouillée une fois authentifié
 * — cette contrainte ne concerne que l'écran de connexion (finalisation
 * UI Phase 1), pas les futurs écrans.
 */
export function App() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    void (async () => {
      const session = await window.maxiEquip.getSession();
      const isAuthenticated = session !== null;
      setAuthenticated(isAuthenticated);
      if (isAuthenticated) {
        await window.maxiEquip.unlockWindowForApp();
      } else {
        await window.maxiEquip.lockWindowForLogin();
      }
      setCheckingSession(false);
    })();
  }, []);

  async function handleLoginSuccess() {
    await window.maxiEquip.unlockWindowForApp();
    setAuthenticated(true);
  }

  async function handleLoggedOut() {
    await window.maxiEquip.lockWindowForLogin();
    setAuthenticated(false);
  }

  if (checkingSession) return null;

  if (!authenticated) {
    return <LoginScreen onLoginSuccess={() => void handleLoginSuccess()} />;
  }

  return <AuthenticatedDashboard onLoggedOut={() => void handleLoggedOut()} />;
}
