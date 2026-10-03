import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Card, Button, Logo, defaultTokens, useToast } from "@maxi-equip/design-system";
import { User, Lock, Contact, Eye, EyeOff, ShieldCheck, CheckCircle2, CloudDownload } from "lucide-react";
import { DecorativeBackground } from "./DecorativeBackground.js";
import logoUrl from "./assets/maxi-equip-logo.png";

/**
 * Récupération d'installation (PC Shop volé/remplacé) — voir
 * ipc/installationRecuperation.ts et installationRecuperationService.ts
 * côté Main pour l'orchestration complète (vérification du mot de passe
 * de récupération auprès du serveur, téléchargement + restauration de la
 * dernière sauvegarde cloud). Nécessite d'être en ligne — accepté
 * explicitement (décision utilisateur) : une installation fraîche ne
 * peut de toute façon pas prouver son identité autrement.
 */
function EcranRecuperation({ onRetourNouvelleInstallation }: { onRetourNouvelleInstallation: () => void }) {
  const { showError, showWarning } = useToast();
  const [motDePasse, setMotDePasse] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState(false);
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
      setLoading(false);
    }
  }

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: "clamp(10px, 2.5vh, 20px)" }}>
        <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontWeight: 800, fontSize: 21, color: defaultTokens.colors.text }}>
          Restaurer une installation existante
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
          Saisissez le mot de passe du compte Administrateur — vos données (ventes, stock, catalogue, comptes) seront restaurées automatiquement.
        </p>
      </div>

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
          {loading ? "Vérification et restauration en cours…" : "Restaurer"}
        </Button>
        <button
          type="button"
          onClick={onRetourNouvelleInstallation}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: defaultTokens.colors.textSoft, textDecoration: "underline", padding: 4 }}
        >
          C'est une toute nouvelle installation
        </button>
      </form>
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
                  PC remplacé ? Restaurer une installation existante
                </button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
