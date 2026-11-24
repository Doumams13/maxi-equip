import { useEffect, useRef, useState } from "react";
import { Button, defaultTokens } from "@maxi-equip/design-system";
import { CloudOff, CloudUpload } from "lucide-react";

type Diagnostic = {
  configuree: boolean;
  probleme: boolean;
  envoiEnCours: boolean;
  derniereReussite: string | null;
  dernierEchec: { date: string; message: string } | null;
};

function ilYa(iso: string): string {
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} jours`;
}

function dateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Alerte "sauvegarde cloud" de la barre du haut (2026-11-24) — correction
 * "les sauvegardes B2 échouaient en silence depuis un mois". N'affiche
 * RIEN tant que tout va bien (barre du haut inchangée au quotidien) ; en
 * cas de problème (échec plus récent que la dernière réussite, ou plus de
 * 3 jours sans nouvelle sauvegarde), un bouton rouge ouvre le détail.
 * Vérifié toutes les 5 minutes.
 */
export function IndicateurSauvegardeCloud() {
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [lancement, setLancement] = useState(false);
  const [retour, setRetour] = useState<string | null>(null);
  const conteneur = useRef<HTMLDivElement>(null);

  async function recharger() {
    try {
      setDiagnostic(await window.maxiEquip.backupEtatCloud());
    } catch {
      // Jamais bloquant : l'indicateur reste simplement masqué.
    }
  }

  // Toutes les 5 minutes d'habitude, toutes les 10 secondes pendant un envoi (pour voir la fin rapidement).
  const envoiEnCours = !!diagnostic?.envoiEnCours;
  useEffect(() => {
    void recharger();
    const intervalle = setInterval(() => void recharger(), envoiEnCours ? 10_000 : 5 * 60 * 1000);
    return () => clearInterval(intervalle);
  }, [envoiEnCours]);

  // Bouton "Lancer une sauvegarde maintenant" (0.12.6) — vérifie d'abord côté Main
  // qu'aucun envoi n'est en cours et qu'aucune sauvegarde de moins d'une heure n'existe.
  async function lancerMaintenant() {
    setLancement(true);
    setRetour(null);
    try {
      const r = await window.maxiEquip.backupLancerCloud();
      if (r.statut === "lancee") setRetour("Sauvegarde lancée. L'envoi se fait en arrière-plan, vous pouvez continuer à travailler.");
      else if (r.statut === "en_cours") setRetour("Un envoi est déjà en cours depuis ce poste. Patientez, l'alerte disparaîtra à la fin.");
      else if (r.statut === "recente") setRetour(`Une sauvegarde a déjà été faite récemment (${new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}). Inutile d'en refaire une.`);
      else if (r.statut === "non_configuree") setRetour("La sauvegarde cloud n'est pas configurée sur ce poste.");
      else setRetour(`Impossible de lancer la sauvegarde : ${r.message}`);
      await recharger();
    } finally {
      setLancement(false);
    }
  }

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

  if (!diagnostic || !diagnostic.configuree || !diagnostic.probleme) return null;

  return (
    <div ref={conteneur} style={{ position: "relative" }}>
      <button
        onClick={() => setOuvert((v) => !v)}
        title="La sauvegarde cloud ne fonctionne plus"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: defaultTokens.radius.pill,
          border: `1px solid ${defaultTokens.colors.danger}`,
          background: defaultTokens.colors.dangerSoft,
          color: defaultTokens.colors.danger,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: defaultTokens.typography.body,
        }}
      >
        <CloudOff size={15} />
        Sauvegarde cloud
      </button>
      {ouvert && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            zIndex: 50,
            background: "#fff",
            border: `1px solid ${defaultTokens.colors.border}`,
            borderRadius: defaultTokens.radius.md,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 14,
            fontSize: 13,
            color: defaultTokens.colors.text,
          }}
        >
          <div style={{ fontWeight: 800, color: defaultTokens.colors.danger, marginBottom: 6 }}>La sauvegarde cloud ne fonctionne plus</div>
          <p style={{ margin: "0 0 8px" }}>
            {diagnostic.derniereReussite
              ? `Dernière sauvegarde réussie : ${dateFr(diagnostic.derniereReussite)} (${ilYa(diagnostic.derniereReussite)}).`
              : "Aucune sauvegarde réussie n'est connue pour ce poste."}
          </p>
          {diagnostic.dernierEchec && (
            <p style={{ margin: "0 0 8px", color: defaultTokens.colors.textSoft }}>
              Dernière erreur ({dateFr(diagnostic.dernierEchec.date)}) : {diagnostic.dernierEchec.message}
            </p>
          )}
          <p style={{ margin: "0 0 12px", color: defaultTokens.colors.textSoft }}>
            Les ventes récentes ne sont pas protégées en cas de panne ou de vol du PC. Prévenez l'administrateur.
          </p>
          {diagnostic.envoiEnCours ? (
            <p style={{ margin: 0, fontWeight: 700, color: defaultTokens.colors.accent }}>Envoi de la sauvegarde en cours…</p>
          ) : (
            <Button loading={lancement} onClick={() => void lancerMaintenant()} style={{ width: "100%" }}>
              <CloudUpload size={15} />
              Lancer une sauvegarde maintenant
            </Button>
          )}
          {retour && <p style={{ margin: "10px 0 0", fontSize: 12.5 }}>{retour}</p>}
        </div>
      )}
    </div>
  );
}
