import { useEffect, useState } from "react";
import { Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { DownloadCloud, RefreshCw, CheckCircle2 } from "lucide-react";

type EtatMiseAJour = {
  disponible: boolean;
  telechargee: boolean;
  version: string | null;
  verificationEnCours: boolean;
  aJour: boolean;
  versionActuelle: string;
  progression: number | null;
};

const ETAT_INITIAL: EtatMiseAJour = {
  disponible: false,
  telechargee: false,
  version: null,
  verificationEnCours: false,
  aJour: false,
  versionActuelle: "",
  progression: null,
};

/**
 * Indicateur de mise à jour — ENTIÈREMENT MANUEL (décision explicite de
 * l'utilisateur) : la seule chose automatique est la détection d'une
 * version disponible (voir main/ipc/autoUpdate.ts) ; ni le téléchargement
 * ni l'installation ne démarrent sans un clic ici.
 *
 * Correction "bouton de mise à jour invisible/invérifiable" — affiche
 * TOUJOURS un badge (version actuelle + bouton "Vérifier"), même en
 * l'absence de mise à jour disponible, pour donner une confirmation
 * visuelle explicite à tout moment plutôt que de n'apparaître que
 * lorsqu'une vraie mise à jour existe.
 *
 * Polling toutes les 20s, même principe que `IndicateurSynchronisation`
 * (`main/ipc/autoUpdate.ts` ne pousse aucun événement vers le Renderer).
 */
export function IndicateurMiseAJour() {
  const [etat, setEtat] = useState<EtatMiseAJour>(ETAT_INITIAL);
  const [enCours, setEnCours] = useState(false);
  // Correction "attente sans savoir si ça avance" — pendant un
  // téléchargement, on interroge l'état bien plus souvent (400ms) que le
  // polling de fond (20s) pour que la barre de progression reflète en
  // temps quasi réel le `download-progress` réel d'electron-updater.
  const [telechargementActif, setTelechargementActif] = useState(false);
  const { showSuccess } = useToast();

  useEffect(() => {
    let annule = false;
    async function recharger() {
      const resultat = await window.maxiEquip.miseAJourEtat();
      if (!annule) setEtat(resultat);
    }
    void recharger();
    const intervalle = setInterval(() => void recharger(), 20000);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
  }, []);

  useEffect(() => {
    if (!telechargementActif) return;
    let annule = false;
    const intervalle = setInterval(() => {
      void window.maxiEquip.miseAJourEtat().then((resultat) => {
        if (!annule) setEtat(resultat);
      });
    }, 400);
    return () => {
      annule = true;
      clearInterval(intervalle);
    };
  }, [telechargementActif]);

  async function telecharger() {
    setEnCours(true);
    setTelechargementActif(true);
    try {
      await window.maxiEquip.miseAJourTelecharger();
    } finally {
      const resultat = await window.maxiEquip.miseAJourEtat();
      setEtat(resultat);
      setEnCours(false);
      setTelechargementActif(false);
    }
  }

  async function installerMaintenant() {
    setEnCours(true);
    await window.maxiEquip.miseAJourInstallerMaintenant();
  }

  async function verifierManuellement() {
    setEnCours(true);
    try {
      await window.maxiEquip.miseAJourVerifierManuellement();
      const resultat = await window.maxiEquip.miseAJourEtat();
      setEtat(resultat);
      if (resultat.aJour) {
        showSuccess("Vous êtes à jour", `Version ${resultat.versionActuelle} — aucune mise à jour disponible.`);
      } else if (resultat.disponible) {
        showSuccess("Mise à jour disponible", `Version ${resultat.version} prête à être téléchargée.`);
      }
    } finally {
      setEnCours(false);
    }
  }

  if (etat.disponible) {
    const enTelechargement = telechargementActif && !etat.telechargee;
    const pourcentage = etat.progression ?? 0;
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 10px",
          borderRadius: defaultTokens.radius.pill,
          background: defaultTokens.colors.accentSoft,
          color: defaultTokens.colors.accent,
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        {/* Correction "savoir où on est, pas seulement où on va" (2026-10-21) :
            la version ACTUELLE disparaissait dès qu'une mise à jour était
            disponible/en cours — seule la version CIBLE restait visible. */}
        <span style={{ color: defaultTokens.colors.textFaint, fontWeight: 400 }}>v{etat.versionActuelle}</span>
        {etat.telechargee ? (
          <>
            <RefreshCw size={14} />
            <span>Mise à jour {etat.version} prête</span>
            <Button variant="ghost" loading={enCours} onClick={() => void installerMaintenant()}>
              Redémarrer et mettre à jour
            </Button>
          </>
        ) : enTelechargement ? (
          <>
            <DownloadCloud size={14} />
            <span>Téléchargement... {pourcentage}%</span>
            <div
              style={{
                width: 90,
                height: 6,
                borderRadius: defaultTokens.radius.pill,
                background: "rgba(0,0,0,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pourcentage}%`,
                  height: "100%",
                  borderRadius: defaultTokens.radius.pill,
                  background: defaultTokens.colors.accent,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </>
        ) : (
          <>
            <DownloadCloud size={14} />
            <span>Mise à jour {etat.version} disponible</span>
            <Button variant="ghost" loading={enCours} onClick={() => void telecharger()}>
              Télécharger
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        borderRadius: defaultTokens.radius.pill,
        border: `1px solid ${defaultTokens.colors.border}`,
        background: "#fff",
        color: defaultTokens.colors.textSoft,
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      <CheckCircle2 size={14} color={defaultTokens.colors.success} />
      <span>v{etat.versionActuelle}</span>
      <Button variant="ghost" loading={enCours || etat.verificationEnCours} onClick={() => void verifierManuellement()}>
        Vérifier les mises à jour
      </Button>
    </div>
  );
}
