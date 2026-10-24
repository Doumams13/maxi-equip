import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Card, Button, Logo, defaultTokens, useToast } from "@maxi-equip/design-system";
import { User, Lock, Contact, Eye, EyeOff, ShieldCheck, CheckCircle2, CloudDownload } from "lucide-react";
import { DecorativeBackground } from "./DecorativeBackground.js";
import logoUrl from "./assets/maxi-equip-logo.png";

/**
 * Connexion d'un poste à une installation existante — sert DEUX usages
 * (même mécanisme sous-jacent, décision utilisateur "travail à distance /
 * plusieurs machines en parallèle", 2026-10-22) : le PC Shop
 * volé/remplacé (l'historique n'existe nulle part ailleurs, ce poste en
 * devient le nouveau porteur) ET un nouveau poste supplémentaire qui
 * travaillera EN PARALLÈLE du PC Shop toujours actif (il reçoit son
 * propre miroir local complet, la configuration de synchronisation
 * partagée (même JWT d'installation) permettant ensuite la coordination
 * en temps réel du stock et de la numérotation des factures — voir
 * validationStockDistanteService.ts/loginCentralService.ts). Voir
 * ipc/installationRecuperation.ts et installationRecuperationService.ts
 * côté Main pour l'orchestration complète (vérification du mot de passe
 * de récupération auprès du serveur, téléchargement + restauration de la
 * dernière sauvegarde cloud). Nécessite d'être en ligne — accepté
 * explicitement (décision utilisateur) : une installation fraîche ne
 * peut de toute façon pas prouver son identité autrement.
 */
type EtapeProgressionRecuperation = "verification" | "telechargement" | "restauration" | "finalisation";

interface DetailTelechargementProgression {
  recuOctets: number;
  totalOctets: number | null;
}

/** Mo entiers, jamais de décimale trompeuse pour un compteur qui défile vite. */
function formaterMo(octets: number): string {
  return String(Math.max(0, Math.round(octets / (1024 * 1024))));
}

/**
 * Traduit (étape, détail octets) en une position UNIQUE sur une seule
 * barre 0→100% (2026-10-23, retour utilisateur : préfère une seule barre
 * continue à un déroulé d'étapes séparées). "Vérification" reste un
 * simple check à part (voir le rendu ci-dessous) — jamais représentée
 * sur cette barre, trop rapide pour un pourcentage utile.
 *
 * Téléchargement = un VRAI pourcentage (octets reçus / Content-Length
 * des 3 fichiers, voir installationRecuperationService.ts), mappé sur
 * 0-80%. Restauration/finalisation n'ont aucun signal de progression
 * interne mesurable (suite d'opérations SQLite synchrones, jamais
 * instrumentées finement) — plages fixes 80-95%/95-100%, jamais un
 * pourcentage inventé à l'intérieur de ces deux phases.
 */
function calculerProgression(
  etape: EtapeProgressionRecuperation | null,
  detail: DetailTelechargementProgression | null
): { pct: number; phaseLabel: string; sousLabel: string } {
  if (etape === null || etape === "verification") {
    return { pct: 0, phaseLabel: "Téléchargement de la sauvegarde", sousLabel: "" };
  }
  if (etape === "telechargement") {
    if (detail?.totalOctets) {
      const ratio = Math.min(1, detail.recuOctets / detail.totalOctets);
      return {
        pct: Math.round(ratio * 80),
        phaseLabel: "Téléchargement de la sauvegarde",
        sousLabel: `${formaterMo(detail.recuOctets)} / ${formaterMo(detail.totalOctets)} Mo`,
      };
    }
    // Taille totale inconnue (serveur sans en-tête Content-Length, cas
    // limite) — jamais un pourcentage inventé, juste le compteur reçu.
    return { pct: 10, phaseLabel: "Téléchargement de la sauvegarde", sousLabel: detail ? `${formaterMo(detail.recuOctets)} Mo téléchargés` : "" };
  }
  if (etape === "restauration") {
    return { pct: 88, phaseLabel: "Restauration de la base de données", sousLabel: "Déchiffrement et écriture de la base locale" };
  }
  return { pct: 97, phaseLabel: "Finalisation", sousLabel: "Configuration de la synchronisation sur ce poste" };
}

/**
 * Panneau de progression (2026-10-22/23, retour utilisateur visuel : "on
 * ne voit rien pendant le téléchargement", puis "une barre de
 * progression avec le téléchargement en Mo") — remplace le simple texte
 * figé du bouton ("Vérification et connexion en cours…"), alimenté par
 * `onInstallationRecuperationProgression` (canal push Main → Renderer,
 * voir preload/index.ts).
 */
function PanneauProgressionRecuperation({ etape, detail }: { etape: EtapeProgressionRecuperation | null; detail: DetailTelechargementProgression | null }) {
  const { pct, phaseLabel, sousLabel } = calculerProgression(etape, detail);
  return (
    <div style={{ padding: "6px 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
        <CheckCircle2 size={18} color={defaultTokens.colors.success} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: defaultTokens.colors.text }}>Vérification du mot de passe</span>
      </div>

      <div style={{ margin: "16px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: defaultTokens.colors.text }}>{phaseLabel}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: defaultTokens.colors.accent, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div style={{ width: "100%", height: 10, background: defaultTokens.colors.borderSoft, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: defaultTokens.colors.accent, borderRadius: 999, transition: "width 150ms linear" }} />
      </div>
      {sousLabel && <div style={{ marginTop: 6, fontSize: 11, color: defaultTokens.colors.textFaint }}>{sousLabel}</div>}
    </div>
  );
}

function EcranRecuperation({ onRetourNouvelleInstallation }: { onRetourNouvelleInstallation: () => void }) {
  const { showError, showWarning } = useToast();
  const [motDePasse, setMotDePasse] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(false);
  const [etapeActuelle, setEtapeActuelle] = useState<EtapeProgressionRecuperation | null>(null);
  const [detailTelechargement, setDetailTelechargement] = useState<DetailTelechargementProgression | null>(null);
  const motDePasseRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(false);
    if (!motDePasse) {
      showWarning("Mot de passe requis", "Saisissez le mot de passe de récupération (celui du compte Administrateur).");
      motDePasseRef.current?.focus();
      return;
    }

    setLoading(true);
    setEtapeActuelle(null);
    setDetailTelechargement(null);
    // Abonné juste avant l'appel, désabonné dans le `finally` ci-dessous —
    // jamais un abonnement qui survivrait à cet écran.
    const desabonner = window.maxiEquip.onInstallationRecuperationProgression((etape, detail) => {
      setEtapeActuelle(etape);
      if (etape === "telechargement") setDetailTelechargement(detail ?? null);
    });
    try {
      const resultat = await window.maxiEquip.installationVerifierEtRestaurer(motDePasse);
      if (resultat.success) {
        // L'application va redémarrer d'elle-même (voir ipc/installationRecuperation.ts) — rien de plus à faire ici.
        return;
      }

      if (resultat.etape === "aucune_recuperation_configuree") {
        showWarning("Aucune récupération disponible", "Aucune installation précédente n'est enregistrée sur ce serveur.");
        onRetourNouvelleInstallation();
        return;
      }
      if (resultat.etape === "aucune_sauvegarde_disponible") {
        showWarning("Mot de passe reconnu", resultat.message ?? "Aucune sauvegarde disponible — configurez un nouveau compte.");
        onRetourNouvelleInstallation();
        return;
      }

      setErreur(true);
      showError("Récupération impossible", resultat.message ?? "Une erreur inattendue s'est produite.");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[installation] Erreur technique inattendue :", err);
      showError("Récupération impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      desabonner();
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: "clamp(10px, 2.5vh, 20px)" }}>
        <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: 21, color: defaultTokens.colors.text }}>
          Connecter ce poste à une installation existante
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
          Saisissez le mot de passe du compte Administrateur — vos données (ventes, stock, catalogue, comptes) seront synchronisées automatiquement sur ce poste, que ce soit pour remplacer le PC Shop ou pour ajouter un nouveau poste qui travaillera en parallèle.
        </p>
      </div>

      {loading ? (
        <PanneauProgressionRecuperation etape={etapeActuelle} detail={detailTelechargement} />
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "clamp(8px, 1.8vh, 14px)" }}>
          <div>
            <label htmlFor="recup-mdp" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}>
              Mot de passe Administrateur
            </label>
            <div style={{ position: "relative" }}>
              <Lock size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
              <input
                id="recup-mdp"
                ref={motDePasseRef}
                type={showPassword ? "text" : "password"}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                placeholder="Mot de passe"
                autoFocus
                autoComplete="current-password"
                style={{ ...fieldStyle(erreur, false), paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
              >
                {showPassword ? <EyeOff size={16} color={defaultTokens.colors.textFaint} /> : <Eye size={16} color={defaultTokens.colors.textFaint} />}
              </button>
            </div>
          </div>

          <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 4 }}>
            Connecter ce poste
          </Button>
          <button
            type="button"
            onClick={onRetourNouvelleInstallation}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: defaultTokens.colors.textSoft, textDecoration: "underline", padding: 4 }}
          >
            C'est une toute nouvelle installation
          </button>
        </form>
      )}
    </>
  );
}

/**
 * Configuration initiale de MAXI EQUIP — Phase 6C. Remplace le mot de
 * passe Administrateur généré aléatoirement (abandonné) : c'est
 * désormais l'utilisateur qui choisit lui-même le mot de passe du
 * premier compte Administrateur, à la toute première ouverture de
 * l'application après installation. N'apparaît JAMAIS si l'installation
 * est déjà initialisée (voir App.tsx, `setupEstRequis()`).
 *
 * Volontairement présenté pour donner l'impression de faire partie du
 * processus d'installation (même identité visuelle que l'écran de
 * connexion — logo, carte, fond) plutôt qu'une page NSIS séparée, qui
 * aurait exigé de faire transiter le mot de passe de façon non
 * sécurisée entre l'installateur et l'application (cahier des charges,
 * étape 3).
 */
export interface SetupInitialScreenProps {
  onSetupComplete: (identifiant: string) => void;
}

function fieldStyle(hasError: boolean, focused: boolean): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 14px 11px 40px",
    borderRadius: defaultTokens.radius.sm,
    border: `1px solid ${hasError ? defaultTokens.colors.danger : focused ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
    boxShadow: focused ? defaultTokens.shadows.focusRing : "none",
    fontFamily: defaultTokens.typography.body,
    fontSize: 14,
    color: defaultTokens.colors.text,
    outline: "none",
    transition: "border-color 120ms ease, box-shadow 120ms ease",
  };
}

type Champ = "nom" | "identifiant" | "motDePasse" | "confirmation";

export function SetupInitialScreen({ onSetupComplete }: SetupInitialScreenProps) {
  const { showError, showWarning } = useToast();

  const [mode, setMode] = useState<"nouvelle" | "restaurer">("nouvelle");
  const [nom, setNom] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termine, setTermine] = useState(false);
  const [erreurs, setErreurs] = useState<Partial<Record<Champ, boolean>>>({});
  const [focusedField, setFocusedField] = useState<Champ | null>(null);

  const nomRef = useRef<HTMLInputElement>(null);
  const identifiantRef = useRef<HTMLInputElement>(null);
  const motDePasseRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreurs({});

    // Validation de présence côté écran — la politique réelle de mot de
    // passe (longueur minimale, confirmation identique) reste appliquée
    // côté Main par UtilisateurService.creerUtilisateur, jamais dupliquée
    // ici (§ cahier des charges : "réutiliser les services existants").
    if (!nom.trim()) {
      showWarning("Nom requis", "Veuillez indiquer le nom de l'administrateur.");
      setErreurs({ nom: true });
      nomRef.current?.focus();
      return;
    }
    if (!identifiant.trim()) {
      showWarning("Identifiant requis", "Veuillez choisir un identifiant de connexion.");
      setErreurs({ identifiant: true });
      identifiantRef.current?.focus();
      return;
    }
    if (!motDePasse) {
      showWarning("Mot de passe requis", "Veuillez choisir un mot de passe.");
      setErreurs({ motDePasse: true });
      motDePasseRef.current?.focus();
      return;
    }
    if (motDePasse !== confirmation) {
      showWarning("Confirmation incorrecte", "Les deux mots de passe saisis ne correspondent pas.");
      setErreurs({ motDePasse: true, confirmation: true });
      confirmationRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const resultat = await window.maxiEquip.setupCreerAdmin({
        nom: nom.trim(),
        identifiant: identifiant.trim(),
        motDePasse,
        confirmation,
      });
      if (resultat.success) {
        setMotDePasse("");
        setConfirmation("");
        setTermine(true);
      } else {
        showError("Configuration impossible", resultat.message ?? "Une erreur inattendue s'est produite.");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[setup] Erreur technique inattendue :", err);
      showError("Configuration impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100%",
        overflowY: "auto",
        background: defaultTokens.colors.bg,
        fontFamily: defaultTokens.typography.body,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(12px, 4vh, 28px) 24px",
        boxSizing: "border-box",
      }}
    >
      <DecorativeBackground />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 440, width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "clamp(10px, 2.5vh, 22px)" }}>
          <Logo logoUrl={logoUrl} width={96} height={70} />
          <h1
            style={{
              margin: "clamp(6px, 1.2vh, 10px) 0 2px",
              fontFamily: defaultTokens.typography.display,
              fontWeight: 800,
              fontSize: "clamp(20px, 1.6vh + 14px, 26px)",
              letterSpacing: "0.02em",
              color: defaultTokens.colors.accent,
            }}
          >
            MAXI EQUIP
          </h1>
          <p style={{ margin: 0, fontFamily: defaultTokens.typography.body, fontSize: 12.5, color: defaultTokens.colors.textSoft, textAlign: "center" }}>
            Configuration initiale
          </p>
          <div style={{ width: 46, height: 2, background: defaultTokens.colors.accent, marginTop: "clamp(4px, 1vh, 8px)", borderRadius: 2 }} />
        </div>

        <Card elevated padding={0} style={{ width: "100%", boxSizing: "border-box", padding: "clamp(16px, 3.5vh, 28px)" }}>
          {termine ? (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <CheckCircle2 size={40} color={defaultTokens.colors.success} />
              <div>
                <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: 20, color: defaultTokens.colors.text }}>
                  Configuration terminée
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: 13.5, color: defaultTokens.colors.textSoft }}>
                  Le compte administrateur a été créé. Vous pouvez maintenant vous connecter.
                </p>
              </div>
              <Button type="button" onClick={() => onSetupComplete(identifiant.trim())} style={{ width: "100%" }}>
                Se connecter
              </Button>
            </div>
          ) : mode === "restaurer" ? (
            <EcranRecuperation onRetourNouvelleInstallation={() => setMode("nouvelle")} />
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: "clamp(10px, 2.5vh, 20px)" }}>
                <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: 21, color: defaultTokens.colors.text }}>
                  Configuration initiale de MAXI EQUIP
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
                  Créez le compte Administrateur principal de cette installation.
                </p>
              </div>

              <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "clamp(8px, 1.8vh, 14px)" }}>
                <div>
                  <label htmlFor="setup-nom" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}>
                    Nom de l'administrateur
                  </label>
                  <div style={{ position: "relative" }}>
                    <User size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      id="setup-nom"
                      ref={nomRef}
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      onFocus={() => setFocusedField("nom")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Ex. Jean Dupont"
                      autoFocus
                      autoComplete="name"
                      style={fieldStyle(Boolean(erreurs.nom), focusedField === "nom")}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-identifiant" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}>
                    Identifiant / login
                  </label>
                  <div style={{ position: "relative" }}>
                    <Contact size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      id="setup-identifiant"
                      ref={identifiantRef}
                      value={identifiant}
                      onChange={(e) => setIdentifiant(e.target.value)}
                      onFocus={() => setFocusedField("identifiant")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Ex. admin"
                      autoComplete="username"
                      style={fieldStyle(Boolean(erreurs.identifiant), focusedField === "identifiant")}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-mdp" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}>
                    Mot de passe
                  </label>
                  <div style={{ position: "relative" }}>
                    <Lock size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      id="setup-mdp"
                      ref={motDePasseRef}
                      type={showPassword ? "text" : "password"}
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      onFocus={() => setFocusedField("motDePasse")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Au moins 8 caractères"
                      autoComplete="new-password"
                      style={{ ...fieldStyle(Boolean(erreurs.motDePasse), focusedField === "motDePasse"), paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
                    >
                      {showPassword ? <EyeOff size={16} color={defaultTokens.colors.textFaint} /> : <Eye size={16} color={defaultTokens.colors.textFaint} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-confirmation" style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: defaultTokens.colors.text, marginBottom: 6 }}>
                    Confirmation du mot de passe
                  </label>
                  <div style={{ position: "relative" }}>
                    <ShieldCheck size={16} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      id="setup-confirmation"
                      ref={confirmationRef}
                      type={showPassword ? "text" : "password"}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      onFocus={() => setFocusedField("confirmation")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Ressaisissez le mot de passe"
                      autoComplete="new-password"
                      style={fieldStyle(Boolean(erreurs.confirmation), focusedField === "confirmation")}
                    />
                  </div>
                </div>

                <Button type="submit" loading={loading} style={{ width: "100%", marginTop: 4 }}>
                  {loading ? "Création en cours…" : "Créer le compte administrateur"}
                </Button>
                <button
                  type="button"
                  onClick={() => setMode("restaurer")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12.5,
                    color: defaultTokens.colors.textSoft,
                    textDecoration: "underline",
                    padding: 4,
                  }}
                >
                  <CloudDownload size={14} />
                  Nouveau poste ou PC remplacé ? Se connecter à une installation existante
                </button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
