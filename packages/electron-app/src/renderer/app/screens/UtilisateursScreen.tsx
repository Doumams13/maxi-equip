import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { UserPlus, Pencil, KeyRound, PowerOff, Power, X, Eye, EyeOff } from "lucide-react";

interface UtilisateurPublic {
  id: string;
  nom: string;
  identifiant: string;
  role: string;
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}

type ModalEtat =
  | null
  | { mode: "creer" }
  | { mode: "modifier"; utilisateur: UtilisateurPublic }
  | { mode: "reinitialiser"; utilisateur: UtilisateurPublic }
  | { mode: "desactiver"; utilisateur: UtilisateurPublic };

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  color: defaultTokens.colors.text,
};

const inputErrStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: defaultTokens.colors.danger,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: defaultTokens.colors.text,
};

function BadgeRole({ role }: { role: string }) {
  const isAdmin = role === "administrateur";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 11.5,
        fontWeight: 700,
        background: isAdmin ? defaultTokens.colors.accentSoft : defaultTokens.colors.borderSoft,
        color: isAdmin ? defaultTokens.colors.accent : defaultTokens.colors.textSoft,
        textTransform: "capitalize",
      }}
    >
      {isAdmin ? "Administrateur" : "Gérant"}
    </span>
  );
}

function BadgeStatut({ actif }: { actif: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 11.5,
        fontWeight: 600,
        background: actif ? defaultTokens.colors.successSoft : defaultTokens.colors.dangerSoft,
        color: actif ? defaultTokens.colors.success : defaultTokens.colors.danger,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: actif ? defaultTokens.colors.success : defaultTokens.colors.danger,
          flexShrink: 0,
        }}
      />
      {actif ? "Actif" : "Désactivé"}
    </span>
  );
}

function ModalOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,35,20,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 250,
      }}
    >
      {children}
    </div>
  );
}

function ChampMotDePasse({
  id,
  label,
  value,
  onChange,
  erreur,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  erreur?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...(erreur ? inputErrStyle : inputStyle), paddingRight: 40 }}
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: defaultTokens.colors.textFaint,
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
          tabIndex={-1}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {erreur && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreur}</p>
      )}
    </div>
  );
}

function ModalCreer({
  onFermer,
  onSuccess,
}: {
  onFermer: () => void;
  onSuccess: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [nom, setNom] = useState("");
  const [identifiant, setIdentifiant] = useState("");
  const [role, setRole] = useState<"administrateur" | "gerant">("gerant");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  function valider() {
    const e: Record<string, string> = {};
    if (!nom.trim()) e["nom"] = "Le nom est obligatoire.";
    if (!identifiant.trim()) e["identifiant"] = "L'identifiant est obligatoire.";
    if (motDePasse.length < 8) e["motDePasse"] = "Au moins 8 caractères.";
    if (motDePasse !== confirmation) e["confirmation"] = "Les mots de passe ne correspondent pas.";
    setErreurs(e);
    return Object.keys(e).length === 0;
  }

  async function handleSoumettre() {
    if (!valider()) return;
    setEnCours(true);
    try {
      const res = await window.maxiEquip.utilisateurCreer({
        nom: nom.trim(),
        identifiant: identifiant.trim(),
        role,
        motDePasse,
        confirmation,
      });
      if (res.success) {
        showSuccess("Utilisateur créé", `Le compte « ${nom.trim()} » a été créé avec succès.`);
        onSuccess();
      } else {
        showError("Création impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(480px, 94vw)", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>
            Nouvel utilisateur
          </h2>
          <button
            onClick={onFermer}
            style={{ background: "none", border: "none", cursor: "pointer", color: defaultTokens.colors.textFaint, padding: 4 }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Nom complet</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            style={erreurs["nom"] ? inputErrStyle : inputStyle}
            placeholder="Prénom Nom"
            autoFocus
          />
          {erreurs["nom"] && <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreurs["nom"]}</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Identifiant de connexion</label>
          <input
            type="text"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value.toLowerCase().replace(/\s/g, ""))}
            style={erreurs["identifiant"] ? inputErrStyle : inputStyle}
            placeholder="ex : marie.dupont"
            autoComplete="username"
          />
          {erreurs["identifiant"] && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreurs["identifiant"]}</p>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "administrateur" | "gerant")}
            style={inputStyle}
          >
            <option value="gerant">Gérant</option>
            <option value="administrateur">Administrateur</option>
          </select>
        </div>

        <ChampMotDePasse
          id="creer-pwd"
          label="Mot de passe (min. 8 caractères)"
          value={motDePasse}
          onChange={setMotDePasse}
          erreur={erreurs["motDePasse"]}
          placeholder="Mot de passe initial"
        />
        <ChampMotDePasse
          id="creer-confirm"
          label="Confirmer le mot de passe"
          value={confirmation}
          onChange={setConfirmation}
          erreur={erreurs["confirmation"]}
          placeholder="Répétez le mot de passe"
        />

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button onClick={() => void handleSoumettre()} loading={enCours} style={{ flex: 1 }}>
            Créer l'utilisateur
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

function ModalModifier({
  utilisateur,
  onFermer,
  onSuccess,
}: {
  utilisateur: UtilisateurPublic;
  onFermer: () => void;
  onSuccess: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [nom, setNom] = useState(utilisateur.nom);
  const [identifiant, setIdentifiant] = useState(utilisateur.identifiant);
  const [role, setRole] = useState<"administrateur" | "gerant">(utilisateur.role as "administrateur" | "gerant");
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  function valider() {
    const e: Record<string, string> = {};
    if (!nom.trim()) e["nom"] = "Le nom est obligatoire.";
    if (!identifiant.trim()) e["identifiant"] = "L'identifiant est obligatoire.";
    setErreurs(e);
    return Object.keys(e).length === 0;
  }

  async function handleSoumettre() {
    if (!valider()) return;
    setEnCours(true);
    try {
      const res = await window.maxiEquip.utilisateurModifier(utilisateur.id, {
        nom: nom.trim(),
        identifiant: identifiant.trim(),
        role,
      });
      if (res.success) {
        showSuccess("Utilisateur modifié", `Les informations de « ${nom.trim()} » ont été mises à jour.`);
        onSuccess();
      } else {
        showError("Modification impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(460px, 94vw)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>
            Modifier l'utilisateur
          </h2>
          <button
            onClick={onFermer}
            style={{ background: "none", border: "none", cursor: "pointer", color: defaultTokens.colors.textFaint, padding: 4 }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Nom complet</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            style={erreurs["nom"] ? inputErrStyle : inputStyle}
            autoFocus
          />
          {erreurs["nom"] && <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreurs["nom"]}</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Identifiant de connexion</label>
          <input
            type="text"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value.toLowerCase().replace(/\s/g, ""))}
            style={erreurs["identifiant"] ? inputErrStyle : inputStyle}
          />
          {erreurs["identifiant"] && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreurs["identifiant"]}</p>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "administrateur" | "gerant")}
            style={inputStyle}
          >
            <option value="gerant">Gérant</option>
            <option value="administrateur">Administrateur</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button onClick={() => void handleSoumettre()} loading={enCours} style={{ flex: 1 }}>
            Enregistrer
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

function ModalReinitialiserMotDePasse({
  utilisateur,
  onFermer,
  onSuccess,
}: {
  utilisateur: UtilisateurPublic;
  onFermer: () => void;
  onSuccess: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  function valider() {
    const e: Record<string, string> = {};
    if (motDePasse.length < 8) e["motDePasse"] = "Au moins 8 caractères.";
    if (motDePasse !== confirmation) e["confirmation"] = "Les mots de passe ne correspondent pas.";
    setErreurs(e);
    return Object.keys(e).length === 0;
  }

  async function handleSoumettre() {
    if (!valider()) return;
    setEnCours(true);
    try {
      const res = await window.maxiEquip.utilisateurReinitialiserMotDePasse(utilisateur.id, {
        motDePasse,
        confirmation,
      });
      if (res.success) {
        showSuccess(
          "Mot de passe réinitialisé",
          `Le nouveau mot de passe de « ${utilisateur.nom} » est actif immédiatement.`
        );
        onSuccess();
      } else {
        showError("Réinitialisation impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(440px, 94vw)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>
            Réinitialiser le mot de passe
          </h2>
          <button
            onClick={onFermer}
            style={{ background: "none", border: "none", cursor: "pointer", color: defaultTokens.colors.textFaint, padding: 4 }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: defaultTokens.colors.textSoft }}>
          Compte : <strong>{utilisateur.nom}</strong> ({utilisateur.identifiant})
        </p>

        <ChampMotDePasse
          id="reset-pwd"
          label="Nouveau mot de passe (min. 8 caractères)"
          value={motDePasse}
          onChange={setMotDePasse}
          erreur={erreurs["motDePasse"]}
          placeholder="Nouveau mot de passe"
        />
        <ChampMotDePasse
          id="reset-confirm"
          label="Confirmer le nouveau mot de passe"
          value={confirmation}
          onChange={setConfirmation}
          erreur={erreurs["confirmation"]}
          placeholder="Répétez le mot de passe"
        />

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button onClick={() => void handleSoumettre()} loading={enCours} style={{ flex: 1 }}>
            Confirmer la réinitialisation
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

function ModalDesactiver({
  utilisateur,
  onFermer,
  onSuccess,
}: {
  utilisateur: UtilisateurPublic;
  onFermer: () => void;
  onSuccess: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [enCours, setEnCours] = useState(false);

  async function handleConfirmer() {
    setEnCours(true);
    try {
      const res = await window.maxiEquip.utilisateurDesactiver(utilisateur.id);
      if (res.success) {
        showSuccess(
          "Utilisateur désactivé",
          `Le compte « ${utilisateur.nom} » est désactivé. Il ne peut plus se connecter.`
        );
        onSuccess();
      } else {
        showError("Désactivation impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(420px, 94vw)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.danger }}>
            Désactiver le compte
          </h2>
          <button
            onClick={onFermer}
            style={{ background: "none", border: "none", cursor: "pointer", color: defaultTokens.colors.textFaint, padding: 4 }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 14 }}>
          Vous êtes sur le point de désactiver le compte de{" "}
          <strong>{utilisateur.nom}</strong> ({utilisateur.identifiant}).
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: defaultTokens.colors.textSoft }}>
          Cet utilisateur ne pourra plus se connecter. Son historique et ses données restent intacts.
          Vous pourrez le réactiver à tout moment.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button
            onClick={() => void handleConfirmer()}
            loading={enCours}
            style={{ flex: 1, background: defaultTokens.colors.danger, color: "#fff" }}
          >
            Désactiver
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

/**
 * Écran de gestion des utilisateurs — Administrateur uniquement.
 *
 * Accessible via "Utilisateurs" dans la navigation (canManageUsers).
 * Protection côté IPC : chaque appel vérifie session + rôle côté Main.
 * Aucun hash de mot de passe n'est jamais affiché ni transmis au Renderer.
 */
export function UtilisateursScreen() {
  const { showSuccess, showError } = useToast();
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurPublic[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modal, setModal] = useState<ModalEtat>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  async function charger() {
    try {
      const res = await window.maxiEquip.utilisateursLister();
      if (res.success && res.data) {
        setUtilisateurs(res.data);
      } else {
        showError("Chargement impossible", res.message ?? "Impossible de charger la liste des utilisateurs.");
      }
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void charger();
  }, []);

  async function handleActiver(utilisateur: UtilisateurPublic) {
    setActionEnCours(utilisateur.id);
    try {
      const res = await window.maxiEquip.utilisateurActiver(utilisateur.id);
      if (res.success) {
        showSuccess("Compte réactivé", `Le compte « ${utilisateur.nom} » est à nouveau actif.`);
        await charger();
      } else {
        showError("Réactivation impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setActionEnCours(null);
    }
  }

  function fermerModal() {
    setModal(null);
  }

  function apresSucces() {
    setModal(null);
    void charger();
  }

  if (chargement) {
    return (
      <div style={{ padding: "40px 24px", color: defaultTokens.colors.textSoft, fontSize: 14 }}>
        Chargement…
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 24px", maxWidth: 960 }}>
      {/* En-tête */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: defaultTokens.typography.display,
              fontSize: defaultTokens.fluidType.h1,
              color: defaultTokens.colors.text,
            }}
          >
            Utilisateurs
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
            {utilisateurs.length} compte{utilisateurs.length > 1 ? "s" : ""} —{" "}
            {utilisateurs.filter((u) => u.actif).length} actif{utilisateurs.filter((u) => u.actif).length > 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setModal({ mode: "creer" })}>
          <UserPlus size={16} />
          Ajouter un utilisateur
        </Button>
      </div>

      {/* Tableau */}
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13.5,
              fontFamily: defaultTokens.typography.body,
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: `2px solid ${defaultTokens.colors.border}`,
                  color: defaultTokens.colors.textSoft,
                  fontSize: 11.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Nom</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Identifiant</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Rôle</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Statut</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((u, i) => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom:
                      i < utilisateurs.length - 1 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none",
                    background: !u.actif ? defaultTokens.colors.surfaceAlt : undefined,
                    opacity: !u.actif ? 0.75 : 1,
                  }}
                >
                  <td style={{ padding: "12px 12px", fontWeight: 600, color: defaultTokens.colors.text }}>
                    {u.nom}
                  </td>
                  <td
                    style={{
                      padding: "12px 12px",
                      color: defaultTokens.colors.textSoft,
                      fontFamily: defaultTokens.typography.mono,
                      fontSize: 12.5,
                    }}
                  >
                    {u.identifiant}
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <BadgeRole role={u.role} />
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <BadgeStatut actif={u.actif} />
                  </td>
                  <td style={{ padding: "12px 12px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      <ActionButton
                        label="Modifier"
                        icon={<Pencil size={15} />}
                        onClick={() => setModal({ mode: "modifier", utilisateur: u })}
                        disabled={actionEnCours === u.id}
                      />
                      <ActionButton
                        label="Réinitialiser le mot de passe"
                        icon={<KeyRound size={15} />}
                        onClick={() => setModal({ mode: "reinitialiser", utilisateur: u })}
                        disabled={actionEnCours === u.id}
                      />
                      {u.actif ? (
                        <ActionButton
                          label="Désactiver"
                          icon={<PowerOff size={15} />}
                          onClick={() => setModal({ mode: "desactiver", utilisateur: u })}
                          disabled={actionEnCours === u.id}
                          danger
                        />
                      ) : (
                        <ActionButton
                          label="Réactiver"
                          icon={<Power size={15} />}
                          onClick={() => void handleActiver(u)}
                          disabled={actionEnCours === u.id}
                          accent
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {utilisateurs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "32px 12px",
                      textAlign: "center",
                      color: defaultTokens.colors.textFaint,
                      fontSize: 13,
                    }}
                  >
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modales */}
      {modal?.mode === "creer" && <ModalCreer onFermer={fermerModal} onSuccess={apresSucces} />}
      {modal?.mode === "modifier" && (
        <ModalModifier utilisateur={modal.utilisateur} onFermer={fermerModal} onSuccess={apresSucces} />
      )}
      {modal?.mode === "reinitialiser" && (
        <ModalReinitialiserMotDePasse
          utilisateur={modal.utilisateur}
          onFermer={fermerModal}
          onSuccess={apresSucces}
        />
      )}
      {modal?.mode === "desactiver" && (
        <ModalDesactiver utilisateur={modal.utilisateur} onFermer={fermerModal} onSuccess={apresSucces} />
      )}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: defaultTokens.radius.sm,
        border: `1px solid ${danger ? defaultTokens.colors.danger : accent ? defaultTokens.colors.accent : defaultTokens.colors.border}`,
        background: danger ? defaultTokens.colors.dangerSoft : accent ? defaultTokens.colors.accentSoft : "#fff",
        color: danger ? defaultTokens.colors.danger : accent ? defaultTokens.colors.accent : defaultTokens.colors.textSoft,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
      }}
    >
      {icon}
    </button>
  );
}
