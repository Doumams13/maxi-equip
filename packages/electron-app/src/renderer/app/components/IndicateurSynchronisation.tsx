import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useToast, defaultTokens } from "@maxi-equip/design-system";
import { RefreshCw, Check, AlertTriangle, CircleSlash } from "lucide-react";

/**
 * Indicateur de synchronisation — correction "Affichage de la
 * synchronisation" (suite à la Phase 3.7). Composant purement
 * d'AFFICHAGE : appelle exactement les mêmes canaux IPC déjà exposés
 * (`synchroniser`, `syncEstEnCours`) plus une nouvelle lecture d'état
 * (`syncEstConfiguree`, en lecture seule) — ne contient et ne duplique
 * aucune logique de SyncService, jamais de PUSH/PULL/curseur ici.
 *
 * Visible dans le Header global (voir Shell.tsx) — donc identique pour
 * Administrateur et Gérant, sur tous les écrans, jamais limité à
 * DashboardScreen (correction du problème de placement précédent, qui
 * plaçait par erreur ce bloc dans DashboardVendeur uniquement).
 */
type EtatIndicateur = "verification" | "non_configuree" | "pret" | "en_cours" | "erreur";

export function IndicateurSynchronisation() {
  const [etat, setEtat] = useState<EtatIndicateur>("verification");
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    let annule = false;
    void window.maxiEquip.syncEstConfiguree().then((configuree) => {
      if (!annule) setEtat(configuree ? "pret" : "non_configuree");
    });
    return () => {
      annule = true;
    };
  }, []);

  async function handleClic() {
    if (etat === "en_cours" || etat === "non_configuree" || etat === "verification") return;
    setEtat("en_cours");
    try {
      const resultat = await window.maxiEquip.synchroniser();
      if (resultat.success) {
        setEtat("pret");
        // Confirmation explicite du résultat réel — un succès ne doit
        // jamais rester silencieux, sinon impossible de vérifier
        // concrètement qu'une synchronisation a réellement eu lieu.
        const push = resultat.push ? `${resultat.push.confirmees}/${resultat.push.envoyees} envoi(s) confirmé(s)` : "0 envoi";
        const pull = resultat.pull ? `${resultat.pull.recues} reçue(s)` : "0 reçue";
        showSuccess("Synchronisation réussie", `${push} · ${pull}`);
      } else {
        showError("Synchronisation échouée", resultat.message ?? "Une erreur est survenue.");
        setEtat("erreur");
        setTimeout(() => setEtat("pret"), 4000);
      }
    } catch (err) {
      showError("Synchronisation échouée", err instanceof Error ? err.message : "Une erreur est survenue.");
      setEtat("erreur");
      setTimeout(() => setEtat("pret"), 4000);
    }
  }

  const configs: Record<EtatIndicateur, { icone: ReactNode; texte: string; couleur: string; cliquable: boolean }> = {
    verification: { icone: <RefreshCw size={13} />, texte: "…", couleur: defaultTokens.colors.textFaint, cliquable: false },
    non_configuree: { icone: <CircleSlash size={13} />, texte: "Non configurée", couleur: defaultTokens.colors.textFaint, cliquable: false },
    pret: { icone: <Check size={13} />, texte: "Synchronisé", couleur: defaultTokens.colors.success, cliquable: true },
    en_cours: { icone: <RefreshCw size={13} className="spin" />, texte: "Synchronisation…", couleur: defaultTokens.colors.textSoft, cliquable: false },
    erreur: { icone: <AlertTriangle size={13} />, texte: "Synchronisation échouée", couleur: defaultTokens.colors.danger, cliquable: false },
  };
  const c = configs[etat];

  return (
    <button
      onClick={() => void handleClic()}
      disabled={!c.cliquable}
      title={etat === "non_configuree" ? "Synchronisation indisponible" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: defaultTokens.radius.pill,
        border: `1px solid ${defaultTokens.colors.border}`,
        background: "#fff",
        color: c.couleur,
        fontSize: 12,
        fontWeight: 600,
        cursor: c.cliquable ? "pointer" : "default",
        opacity: etat === "verification" ? 0.6 : 1,
      }}
    >
      <style>{`@keyframes spin-sync { to { transform: rotate(360deg); } } .spin { animation: spin-sync 1s linear infinite; }`}</style>
      {c.icone}
      {c.texte}
    </button>
  );
}
