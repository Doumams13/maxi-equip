import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Search, X, RotateCcw, Phone, ShoppingCart, ChevronDown, ChevronUp, Receipt } from "lucide-react";
import type { Demande, DemandeStatut } from "@maxi-equip/shared-types";
import { useSurbrillanceOperation } from "../highlight.js";

/**
 * Écran Demandes — correction "Workflow réel des demandes". La
 * confirmation en vente ne vit plus ici : "Traiter la demande" redirige
 * vers l'espace Vente réel (prérempli), qui reste l'unique endroit où
 * VenteService est appelé. Cet écran ne fait plus que consulter, suivre
 * (avec commentaires facultatifs et historique), refuser ou annuler.
 */

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 };

const LABELS_STATUT: Record<DemandeStatut, string> = {
  nouvelle: "Nouvelle",
  en_cours: "En traitement",
  a_contacter: "Client à contacter",
  contactee: "En traitement",
  confirmee: "Traitée",
  refusee: "Refusée",
  annulee: "Annulée",
};

function StatutBadge({ statut }: { statut: DemandeStatut }) {
  const couleurs: Record<DemandeStatut, { bg: string; fg: string }> = {
    nouvelle: { bg: defaultTokens.colors.accentSoft, fg: defaultTokens.colors.accent },
    en_cours: { bg: defaultTokens.colors.warningSoft, fg: defaultTokens.colors.warning },
    a_contacter: { bg: defaultTokens.colors.warningSoft, fg: defaultTokens.colors.warning },
    contactee: { bg: defaultTokens.colors.warningSoft, fg: defaultTokens.colors.warning },
    confirmee: { bg: defaultTokens.colors.successSoft, fg: defaultTokens.colors.success },
    refusee: { bg: defaultTokens.colors.dangerSoft, fg: defaultTokens.colors.danger },
    annulee: { bg: defaultTokens.colors.surfaceAlt, fg: defaultTokens.colors.textFaint },
  };
  const c = couleurs[statut];
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: defaultTokens.radius.pill, padding: "3px 10px", fontSize: 11.5, fontWeight: 700 }}>
      {LABELS_STATUT[statut]}
    </span>
  );
}

export function DemandesScreen({
  onTraiterDemande,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
}: {
  session: { userId: string; nom: string };
  onTraiterDemande: (demandeId: string) => void;
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}) {
  const [demandes, setDemandes] = useState<Demande[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [statutFiltre, setStatutFiltre] = useState<DemandeStatut | "toutes">("toutes");
  const [demandeOuverteId, setDemandeOuverteId] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();

  async function recharger() {
    setDemandes(await window.maxiEquip.demandesLister());
  }

  useEffect(() => {
    void recharger();
  }, []);

  useEffect(() => {
    if (cibleSurbrillance) setDemandeOuverteId(cibleSurbrillance);
  }, [cibleSurbrillance]);

  const filtrees = (demandes ?? []).filter((d) => {
    if (statutFiltre !== "toutes" && d.statut !== statutFiltre) return false;
    if (!recherche.trim()) return true;
    const r = recherche.toLowerCase();
    return d.numero.toLowerCase().includes(r) || d.clientNom.toLowerCase().includes(r) || d.clientTelephone.includes(r);
  });

  const cibleActive = cibleSurbrillance && filtrees.some((d) => d.id === cibleSurbrillance) ? cibleSurbrillance : null;
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(cibleActive, onSurbrillanceAppliquee);

  return (
    <div style={{ padding: 28 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: 0 }}>Demandes</h1>
        <p style={{ margin: "2px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
          {demandes ? `${filtrees.length} demande(s)` : "…"} — reçues depuis le site MAXI-EQUIP.
        </p>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px" }}>
            <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              style={{ ...inputStyle, paddingLeft: 34 }}
              placeholder="Rechercher par numéro, client ou téléphone…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <select style={inputStyle} value={statutFiltre} onChange={(e) => setStatutFiltre(e.target.value as DemandeStatut | "toutes")}>
            <option value="toutes">Tous les statuts</option>
            <option value="nouvelle">Nouvelle</option>
            <option value="a_contacter">Client à contacter</option>
            <option value="en_cours">En traitement</option>
            <option value="confirmee">Traitée</option>
            <option value="refusee">Refusée</option>
            <option value="annulee">Annulée</option>
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div ref={conteneurRef}>
        {!demandes ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Chargement…</p>
        ) : filtrees.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucune demande ne correspond à vos filtres.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                <th style={{ padding: "10px 16px" }}>Numéro</th>
                <th style={{ padding: "10px 16px" }}>Client</th>
                <th style={{ padding: "10px 16px" }}>Téléphone</th>
                <th style={{ padding: "10px 16px" }}>Articles</th>
                <th style={{ padding: "10px 16px" }}>Date</th>
                <th style={{ padding: "10px 16px" }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((d) => (
                <tr
                  key={d.id}
                  data-operation-id={d.id}
                  onClick={() => setDemandeOuverteId(d.id)}
                  style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, cursor: "pointer", ...styleSurbrillance(d.id) }}
                >
                  <td style={{ padding: "10px 16px", fontFamily: defaultTokens.typography.mono, fontWeight: 700, color: defaultTokens.colors.accent }}>{d.numero}</td>
                  <td style={{ padding: "10px 16px" }}>{d.clientNom}</td>
                  <td style={{ padding: "10px 16px" }}>{d.clientTelephone}</td>
                  <td style={{ padding: "10px 16px" }}>{d.lignes.reduce((s, l) => s + l.quantite, 0)}</td>
                  <td style={{ padding: "10px 16px", color: defaultTokens.colors.textSoft }}>
                    {new Date(d.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <StatutBadge statut={d.statut} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </Card>

      {demandeOuverteId && (
        <ModalDetailDemande
          demandeId={demandeOuverteId}
          onFermer={() => setDemandeOuverteId(null)}
          onChange={() => void recharger()}
          onTraiterDemande={onTraiterDemande}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}
    </div>
  );
}

function ModalDetailDemande({
  demandeId,
  onFermer,
  onChange,
  onTraiterDemande,
  showSuccess,
  showError,
}: {
  demandeId: string;
  onFermer: () => void;
  onChange: () => void;
  onTraiterDemande: (demandeId: string) => void;
  showSuccess: (titre: string, message: string) => void;
  showError: (titre: string, message: string) => void;
}) {
  const [demande, setDemande] = useState<Demande | null>(null);
  const [verification, setVerification] = useState<{ produitId: string; motif: string; taille: string; quantiteDemandee: number; quantiteDisponible: number }[] | null>(
    null
  );
  const [historique, setHistorique] = useState<{ statut: DemandeStatut; commentaire: string | null; createdAt: string }[] | null>(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [modeCommentaire, setModeCommentaire] = useState<"a_contacter" | "en_cours" | null>(null);
  const [commentaireSaisi, setCommentaireSaisi] = useState("");
  const [modeRefus, setModeRefus] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const d = await window.maxiEquip.demandesObtenir(demandeId);
    setDemande(d);
    if (d) {
      setVerification(await window.maxiEquip.demandesVerifierStock(demandeId));
      setHistorique(await window.maxiEquip.demandesListerSuivi(demandeId));
    }
  }

  useEffect(() => {
    void charger();
  }, [demandeId]);

  if (!demande) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 260 }}>
        <Card elevated style={{ width: "min(500px, 92vw)" }}>
          <p style={{ margin: 0, color: defaultTokens.colors.textSoft }}>Chargement…</p>
        </Card>
      </div>
    );
  }

  const modifiable = ["nouvelle", "en_cours", "a_contacter", "contactee"].includes(demande.statut);
  const derniereEntree = historique?.[0] ?? null;

  async function handleValiderSuivi() {
    if (!modeCommentaire) return;
    setEnCours(true);
    try {
      await window.maxiEquip.demandesMarquerSuivi(demandeId, modeCommentaire, commentaireSaisi.trim() || null);
      setModeCommentaire(null);
      setCommentaireSaisi("");
      await charger();
      onChange();
    } catch (err) {
      showError("Impossible de mettre à jour le suivi", err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  async function handleRefuser() {
    if (!motifRefus.trim()) return;
    setEnCours(true);
    try {
      await window.maxiEquip.demandesRefuser(demandeId, motifRefus.trim());
      showSuccess("Demande refusée", `${demande!.numero} a été refusée.`);
      onChange();
      onFermer();
    } catch (err) {
      showError("Impossible de refuser", err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  async function handleAnnuler() {
    setEnCours(true);
    try {
      await window.maxiEquip.demandesAnnuler(demandeId);
      showSuccess("Demande annulée", `${demande!.numero} a été annulée.`);
      onChange();
      onFermer();
    } catch (err) {
      showError("Impossible d'annuler", err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 260, padding: 20 }}>
      <Card elevated style={{ width: "min(640px, 95vw)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontFamily: defaultTokens.typography.display, fontSize: 17 }}>{demande.numero}</h2>
            <StatutBadge statut={demande.statut} />
          </div>
          <button onClick={onFermer} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color={defaultTokens.colors.textFaint} />
          </button>
        </div>

        {demande.statut === "refusee" && demande.refusMotif && (
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: defaultTokens.colors.danger }}>Motif du refus : {demande.refusMotif}</p>
        )}

        {demande.statut === "confirmee" && demande.factureId && (
          <div
            style={{
              margin: "0 0 14px",
              padding: "10px 12px",
              background: defaultTokens.colors.successSoft,
              borderRadius: defaultTokens.radius.sm,
              fontSize: 12.5,
              color: defaultTokens.colors.success,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Receipt size={14} />
            Vente validée — facture associée à cette demande.
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Client</div>
        <div style={{ fontSize: 13, marginBottom: 4 }}>{demande.clientNom}</div>
        <div style={{ fontSize: 13, color: defaultTokens.colors.textSoft, marginBottom: 4 }}>{demande.clientTelephone}</div>
        <div style={{ fontSize: 13, color: defaultTokens.colors.textSoft, marginBottom: 4 }}>{demande.clientAdresse}</div>
        {demande.clientEmail && <div style={{ fontSize: 13, color: defaultTokens.colors.textSoft, marginBottom: 4 }}>{demande.clientEmail}</div>}
        {demande.commentaire && <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft, marginTop: 6, fontStyle: "italic" }}>« {demande.commentaire} »</div>}

        <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />

        <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
          Articles demandés
        </div>
        {demande.lignes.map((l, i) => {
          const stock = verification?.find((v) => v.produitId === l.produitId);
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.motif}</div>
                <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>
                  Taille {l.taille} · Quantité {l.quantite} · {l.prixIndicatif.toLocaleString("fr-FR")} FCFA/u
                </div>
              </div>
              {stock && (
                <div style={{ fontSize: 11.5, color: stock.quantiteDisponible >= stock.quantiteDemandee ? defaultTokens.colors.success : defaultTokens.colors.danger }}>
                  {stock.quantiteDisponible} en stock
                </div>
              )}
            </div>
          );
        })}

        {modifiable && !modeRefus && (
          <>
            <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
              Suivi
            </div>

            {derniereEntree?.commentaire && (
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>{derniereEntree.commentaire}</p>
            )}

            {modeCommentaire ? (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Commentaire de suivi (facultatif)</label>
                <input
                  style={inputStyle}
                  value={commentaireSaisi}
                  onChange={(e) => setCommentaireSaisi(e.target.value)}
                  placeholder="Ex. Client absent, rappeler demain matin."
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && void handleValiderSuivi()}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <Button variant="secondary" onClick={() => setModeCommentaire(null)} style={{ flex: 1 }}>
                    Annuler
                  </Button>
                  <Button onClick={() => void handleValiderSuivi()} loading={enCours} style={{ flex: 1 }}>
                    Enregistrer
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                <StatutBadge statut={demande.statut} />
                {(demande.statut === "nouvelle" || demande.statut === "contactee") && (
                  <Button variant="secondary" onClick={() => setModeCommentaire("a_contacter")}>
                    <Phone size={14} />
                    Client à contacter
                  </Button>
                )}
                {demande.statut === "a_contacter" && (
                  <Button variant="secondary" onClick={() => setModeCommentaire("en_cours")}>
                    En traitement
                  </Button>
                )}
                {demande.statut === "en_cours" && (
                  <Button variant="secondary" onClick={() => setModeCommentaire("en_cours")}>
                    Ajouter un commentaire de suivi
                  </Button>
                )}
              </div>
            )}

            {historique && historique.length > 0 && (
              <button
                onClick={() => setHistoriqueOuvert((v) => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: defaultTokens.colors.accent, marginBottom: 8 }}
              >
                {historiqueOuvert ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {historiqueOuvert ? "Masquer l'historique" : "Voir l'historique"}
              </button>
            )}
            {historiqueOuvert && historique && (
              <div style={{ marginBottom: 12 }}>
                {historique.map((entree, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: i < historique.length - 1 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <StatutBadge statut={entree.statut} />
                      <span style={{ fontSize: 11, color: defaultTokens.colors.textFaint }}>
                        {new Date(entree.createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
                      </span>
                    </div>
                    {entree.commentaire && <p style={{ margin: "2px 0 0", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>{entree.commentaire}</p>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />

            <Button onClick={() => onTraiterDemande(demandeId)} style={{ width: "100%", justifyContent: "center" }}>
              <ShoppingCart size={14} />
              Traiter la demande
            </Button>

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => setModeRefus(true)}>
                Refuser
              </Button>
              <Button variant="secondary" onClick={() => void handleAnnuler()} disabled={enCours}>
                <RotateCcw size={14} />
                Annuler la demande
              </Button>
            </div>
          </>
        )}

        {modeRefus && (
          <div style={{ marginTop: 18 }}>
            <label style={labelStyle}>Motif du refus</label>
            <input style={inputStyle} value={motifRefus} onChange={(e) => setMotifRefus(e.target.value)} placeholder="Ex. produit indisponible, client injoignable…" autoFocus />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setModeRefus(false)} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => void handleRefuser()} disabled={!motifRefus.trim() || enCours} style={{ flex: 1 }}>
                Confirmer le refus
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
