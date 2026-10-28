import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Pencil, Ban, Power, Trash2, X } from "lucide-react";

interface PosteInfo {
  id: string;
  nom: string | null;
  role: "shop" | "pcx";
  statut: "actif" | "bloque";
  enregistreLe: string;
  dernierContactLe: string | null;
}

type ModalEtat =
  | null
  | { mode: "renommer"; poste: PosteInfo }
  | { mode: "bloquer"; poste: PosteInfo }
  | { mode: "retirer"; poste: PosteInfo };

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

function ModalOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
      {children}
    </div>
  );
}

function BadgeRole({ role }: { role: "shop" | "pcx" }) {
  const isShop = role === "shop";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 11.5,
        fontWeight: 700,
        background: isShop ? defaultTokens.colors.accentSoft : defaultTokens.colors.borderSoft,
        color: isShop ? defaultTokens.colors.accent : defaultTokens.colors.textSoft,
      }}
    >
      {isShop ? "PC Shop (référence)" : "Poste annexe"}
    </span>
  );
}

function BadgeStatut({ statut, dernierContactLe }: { statut: "actif" | "bloque"; dernierContactLe: string | null }) {
  // Trois statuts distincts (exigence explicite) : bloqué, autorisé et
  // connecté récemment, ou autorisé mais déconnecté — un poste qui ne
  // communique plus n'est JAMAIS automatiquement considéré comme bloqué.
  if (statut === "bloque") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: defaultTokens.radius.pill, fontSize: 11.5, fontWeight: 600, background: defaultTokens.colors.dangerSoft, color: defaultTokens.colors.danger }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: defaultTokens.colors.danger, flexShrink: 0 }} />
        Bloqué
      </span>
    );
  }
  const connecteRecemment = dernierContactLe !== null && Date.now() - new Date(dernierContactLe).getTime() < 15 * 60 * 1000;
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
        background: connecteRecemment ? defaultTokens.colors.successSoft : defaultTokens.colors.borderSoft,
        color: connecteRecemment ? defaultTokens.colors.success : defaultTokens.colors.textSoft,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: connecteRecemment ? defaultTokens.colors.success : defaultTokens.colors.textFaint, flexShrink: 0 }} />
      {connecteRecemment ? "Autorisé — connecté" : "Autorisé — déconnecté"}
    </span>
  );
}

function formaterDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function ModalRenommer({ poste, onFermer, onSuccess }: { poste: PosteInfo; onFermer: () => void; onSuccess: () => void }) {
  const { showSuccess, showError } = useToast();
  const [nom, setNom] = useState(poste.nom ?? "");
  const [enCours, setEnCours] = useState(false);

  async function handleSoumettre() {
    if (!nom.trim()) return;
    setEnCours(true);
    try {
      // Renommer n'est possible que pour SOI-MÊME côté serveur (voir
      // postes/definir-nom.ts) — depuis l'écran de gestion, le poste
      // Administrateur ne peut donc renommer que son propre poste
      // (toujours le premier à ouvrir cet écran après une restauration).
      const res = await window.maxiEquip.posteDefinirNom(nom.trim());
      if (res.success) {
        showSuccess("Poste renommé", `Ce poste s'appelle désormais « ${nom.trim()} ».`);
        onSuccess();
      } else {
        showError("Renommage impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(420px, 94vw)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Renommer le poste</h2>
          <button onClick={onFermer} style={{ background: "none", border: "none", cursor: "pointer", color: defaultTokens.colors.textFaint, padding: 4 }} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
          Le nom n'est qu'un repère affiché — l'identité technique de ce poste ne change jamais.
        </p>
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} style={inputStyle} placeholder="ex : PCX1 - Comptoir" autoFocus />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button onClick={() => void handleSoumettre()} loading={enCours} disabled={!nom.trim()} style={{ flex: 1 }}>
            Enregistrer
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

function ModalBloquer({ poste, onFermer, onSuccess }: { poste: PosteInfo; onFermer: () => void; onSuccess: () => void }) {
  const { showSuccess, showError } = useToast();
  const [enCours, setEnCours] = useState(false);

  async function handleConfirmer() {
    setEnCours(true);
    try {
      const res = await window.maxiEquip.posteBloquer(poste.id);
      if (res.success) {
        showSuccess("Poste bloqué", `« ${poste.nom ?? poste.id} » ne pourra plus se connecter ni synchroniser tant qu'il n'est pas réautorisé.`);
        onSuccess();
      } else {
        showError("Blocage impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(440px, 94vw)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.danger }}>
          Bloquer ce poste ?
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
          <strong>{poste.nom ?? poste.id}</strong> ne pourra plus se connecter (quel que soit le compte utilisé) ni synchroniser de données jusqu'à
          une réautorisation explicite. Son historique local reste intact.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button variant="danger" onClick={() => void handleConfirmer()} loading={enCours} style={{ flex: 1 }}>
            Bloquer
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

function ModalRetirer({ poste, onFermer, onSuccess }: { poste: PosteInfo; onFermer: () => void; onSuccess: () => void }) {
  const { showSuccess, showError } = useToast();
  const [enCours, setEnCours] = useState(false);

  async function handleConfirmer() {
    setEnCours(true);
    try {
      const res = await window.maxiEquip.posteRetirer(poste.id);
      if (res.success) {
        showSuccess("Poste retiré", "La place qu'il occupait est désormais libre pour un nouveau poste annexe.");
        onSuccess();
      } else {
        showError("Retrait impossible", res.message ?? "Erreur inattendue.");
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <ModalOverlay>
      <Card elevated style={{ width: "min(440px, 94vw)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.danger }}>
          Retirer ce poste ?
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
          <strong>{poste.nom ?? poste.id}</strong> sera définitivement retiré du registre. S'il est réinstallé plus tard, il devra être explicitement
          réautorisé — le même nom ne lui rendra jamais automatiquement l'accès.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onFermer} disabled={enCours} style={{ flex: 1 }}>
            Annuler
          </Button>
          <Button variant="danger" onClick={() => void handleConfirmer()} loading={enCours} style={{ flex: 1 }}>
            Retirer
          </Button>
        </div>
      </Card>
    </ModalOverlay>
  );
}

/**
 * Écran de gestion des postes — Administrateur uniquement, système
 * multiposte fiable (2026-10-28). Protection réelle côté IPC
 * (checkAdminGuard, voir ipc/postes.ts), jamais uniquement cet écran.
 */
export function PostesScreen() {
  const { showError } = useToast();
  const [postes, setPostes] = useState<PosteInfo[]>([]);
  const [chargement, setChargement] = useState(true);
  const [modal, setModal] = useState<ModalEtat>(null);

  async function charger() {
    try {
      const res = await window.maxiEquip.posteLister();
      if (res.success) {
        setPostes(res.postes);
      } else {
        showError("Chargement impossible", res.message ?? "Impossible de charger la liste des postes.");
      }
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void charger();
  }, []);

  function fermerModal() {
    setModal(null);
  }
  function apresSucces() {
    setModal(null);
    void charger();
  }

  if (chargement) {
    return <div style={{ padding: "40px 24px", color: defaultTokens.colors.textSoft, fontSize: 14 }}>Chargement…</div>;
  }

  const postesAnnexes = postes.filter((p) => p.role === "pcx");

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: defaultTokens.fluidType.h1, color: defaultTokens.colors.text }}>
          Postes
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
          {postesAnnexes.length} / 5 poste{postesAnnexes.length > 1 ? "s" : ""} annexe{postesAnnexes.length > 1 ? "s" : ""} enregistré
          {postesAnnexes.length > 1 ? "s" : ""}
        </p>
      </div>

      <Card>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontFamily: defaultTokens.typography.body }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${defaultTokens.colors.border}`, color: defaultTokens.colors.textSoft, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Nom</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Rôle</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Statut</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Enregistré le</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>Dernier contact</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {postes.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < postes.length - 1 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none" }}>
                  <td style={{ padding: "12px 12px", fontWeight: 600, color: defaultTokens.colors.text }}>
                    {p.nom ?? <span style={{ color: defaultTokens.colors.textFaint, fontWeight: 400, fontStyle: "italic" }}>Non nommé</span>}
                    <div style={{ fontFamily: defaultTokens.typography.mono, fontSize: 11, color: defaultTokens.colors.textFaint }}>{p.id}</div>
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <BadgeRole role={p.role} />
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <BadgeStatut statut={p.statut} dernierContactLe={p.dernierContactLe} />
                  </td>
                  <td style={{ padding: "12px 12px", color: defaultTokens.colors.textSoft }}>{formaterDate(p.enregistreLe)}</td>
                  <td style={{ padding: "12px 12px", color: defaultTokens.colors.textSoft }}>{formaterDate(p.dernierContactLe)}</td>
                  <td style={{ padding: "12px 12px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <ActionButton label="Renommer" icon={<Pencil size={15} />} onClick={() => setModal({ mode: "renommer", poste: p })} />
                      {p.role === "pcx" && p.statut === "actif" && (
                        <ActionButton label="Bloquer" icon={<Ban size={15} />} onClick={() => setModal({ mode: "bloquer", poste: p })} danger />
                      )}
                      {p.role === "pcx" && p.statut === "bloque" && (
                        <ActionButton
                          label="Réautoriser"
                          icon={<Power size={15} />}
                          onClick={() => void window.maxiEquip.posteReautoriser(p.id).then(apresSucces)}
                          accent
                        />
                      )}
                      {p.role === "pcx" && (
                        <ActionButton label="Retirer" icon={<Trash2 size={15} />} onClick={() => setModal({ mode: "retirer", poste: p })} danger />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {postes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: "32px 12px", textAlign: "center", color: defaultTokens.colors.textFaint, fontSize: 13 }}>
                    Aucun poste enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {modal?.mode === "renommer" && <ModalRenommer poste={modal.poste} onFermer={fermerModal} onSuccess={apresSucces} />}
      {modal?.mode === "bloquer" && <ModalBloquer poste={modal.poste} onFermer={fermerModal} onSuccess={apresSucces} />}
      {modal?.mode === "retirer" && <ModalRetirer poste={modal.poste} onFermer={fermerModal} onSuccess={apresSucces} />}
    </div>
  );
}

function ActionButton({ label, icon, onClick, danger, accent }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
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
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}
