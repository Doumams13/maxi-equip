import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Search, Check, X, RotateCcw, Pencil, Package, Phone, Plus, Trash2 } from "lucide-react";
import type { Demande, DemandeStatut, Emplacement } from "@maxi-equip/shared-types";

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
  en_cours: "En cours",
  a_contacter: "À contacter",
  contactee: "Contactée",
  confirmee: "Confirmée",
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

export function DemandesScreen({ session }: { session: { userId: string; nom: string } }) {
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

  const filtrees = (demandes ?? []).filter((d) => {
    if (statutFiltre !== "toutes" && d.statut !== statutFiltre) return false;
    if (!recherche.trim()) return true;
    const r = recherche.toLowerCase();
    return d.numero.toLowerCase().includes(r) || d.clientNom.toLowerCase().includes(r) || d.clientTelephone.includes(r);
  });

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
            {(Object.keys(LABELS_STATUT) as DemandeStatut[]).map((s) => (
              <option key={s} value={s}>
                {LABELS_STATUT[s]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
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
                <tr key={d.id} onClick={() => setDemandeOuverteId(d.id)} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, cursor: "pointer" }}>
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
      </Card>

      {demandeOuverteId && (
        <ModalDetailDemande
          demandeId={demandeOuverteId}
          session={session}
          onFermer={() => setDemandeOuverteId(null)}
          onChange={() => {
            void recharger();
          }}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}
    </div>
  );
}

function ModalDetailDemande({
  demandeId,
  session,
  onFermer,
  onChange,
  showSuccess,
  showError,
}: {
  demandeId: string;
  session: { userId: string; nom: string };
  onFermer: () => void;
  onChange: () => void;
  showSuccess: (titre: string, message: string) => void;
  showError: (titre: string, message: string) => void;
}) {
  const [demande, setDemande] = useState<Demande | null>(null);
  const [verification, setVerification] = useState<{ produitId: string; motif: string; taille: string; quantiteDemandee: number; quantiteDisponible: number }[] | null>(
    null
  );
  const [modeConfirmation, setModeConfirmation] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [modeRefus, setModeRefus] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const d = await window.maxiEquip.demandesObtenir(demandeId);
    setDemande(d);
    if (d) setVerification(await window.maxiEquip.demandesVerifierStock(demandeId));
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

  async function handleMarquerSuivi(statut: "en_cours" | "a_contacter" | "contactee") {
    setEnCours(true);
    try {
      await window.maxiEquip.demandesMarquerSuivi(demandeId, statut);
      await charger();
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

        <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Client</div>
        <div style={{ fontSize: 13, marginBottom: 4 }}>{demande.clientNom}</div>
        <div style={{ fontSize: 13, color: defaultTokens.colors.textSoft, marginBottom: 4 }}>{demande.clientTelephone}</div>
        <div style={{ fontSize: 13, color: defaultTokens.colors.textSoft, marginBottom: 4 }}>{demande.clientAdresse}</div>
        {demande.clientEmail && <div style={{ fontSize: 13, color: defaultTokens.colors.textSoft, marginBottom: 4 }}>{demande.clientEmail}</div>}
        {demande.commentaire && <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft, marginTop: 6, fontStyle: "italic" }}>« {demande.commentaire} »</div>}

        <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />

        <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
          Produits demandés
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
                  <Package size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  {stock.quantiteDisponible} en stock
                </div>
              )}
            </div>
          );
        })}

        {modifiable && !modeConfirmation && !modeRefus && !modeEdition && (
          <>
            {/* --- Correction "Suivi et modification" : le suivi a désormais une vraie place, jamais caché derrière la confirmation (Partie 13). --- */}
            <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
              Suivi
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <StatutBadge statut={demande.statut} />
              {demande.statut === "nouvelle" && (
                <Button variant="secondary" onClick={() => void handleMarquerSuivi("a_contacter")} disabled={enCours}>
                  <Phone size={14} />
                  Marquer à contacter
                </Button>
              )}
              {demande.statut === "a_contacter" && (
                <Button variant="secondary" onClick={() => void handleMarquerSuivi("contactee")} disabled={enCours}>
                  <Phone size={14} />
                  Marquer comme contactée
                </Button>
              )}
              {demande.statut === "contactee" && (
                <Button variant="secondary" onClick={() => void handleMarquerSuivi("en_cours")} disabled={enCours}>
                  Marquer en cours de traitement
                </Button>
              )}
            </div>

            <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />

            <Button variant="secondary" onClick={() => setModeEdition(true)} style={{ width: "100%", justifyContent: "center" }}>
              <Pencil size={14} />
              Modifier la demande
            </Button>

            <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "16px 0" }} />

            <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
              Actions finales
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button onClick={() => setModeConfirmation(true)}>
                <Check size={14} />
                Confirmer
              </Button>
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

        {modeEdition && (
          <FormulaireEdition
            demande={demande}
            onAnnuler={() => setModeEdition(false)}
            onEnregistre={() => {
              setModeEdition(false);
              void charger();
              showSuccess("Demande modifiée", "Les modifications ont été enregistrées.");
            }}
            onErreur={(message) => showError("Modification impossible", message)}
          />
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

        {modeConfirmation && (
          <FormulaireConfirmation
            demande={demande}
            session={session}
            onAnnuler={() => setModeConfirmation(false)}
            onConfirme={(message) => {
              showSuccess("Demande confirmée", message);
              onChange();
              onFermer();
            }}
            onErreur={(message) => showError("Confirmation impossible", message)}
          />
        )}
      </Card>
    </div>
  );
}

/**
 * Correction "Suivi et modification des demandes", Parties 5-9 — un
 * vrai mode édition : client + lignes (quantité/taille modifiables,
 * suppression), ajout de produit depuis le VRAI catalogue (jamais un
 * catalogue parallèle). N'appelle jamais VenteService, ne touche jamais
 * le stock — uniquement `demandesModifierClient`/`demandesModifierLignes`,
 * qui ne font que ré-écrire la demande elle-même (Partie 8/9).
 */
function FormulaireEdition({
  demande,
  onAnnuler,
  onEnregistre,
  onErreur,
}: {
  demande: Demande;
  onAnnuler: () => void;
  onEnregistre: () => void;
  onErreur: (message: string) => void;
}) {
  const [clientNom, setClientNom] = useState(demande.clientNom);
  const [clientTelephone, setClientTelephone] = useState(demande.clientTelephone);
  const [clientAdresse, setClientAdresse] = useState(demande.clientAdresse);
  const [clientEmail, setClientEmail] = useState(demande.clientEmail ?? "");
  const [commentaire, setCommentaire] = useState(demande.commentaire ?? "");
  const [lignes, setLignes] = useState(demande.lignes.map((l) => ({ ...l })));
  const [catalogue, setCatalogue] = useState<{ id: string; motif: string; taille: string; prix: string | number }[] | null>(null);
  const [produitAAjouter, setProduitAAjouter] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    void window.maxiEquip.listProduits().then((liste) => setCatalogue(liste));
  }, []);

  function modifierLigne(index: number, champs: Partial<{ quantite: number; taille: string }>) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...champs } : l)));
  }

  function supprimerLigne(index: number) {
    setLignes((prev) => prev.filter((_, i) => i !== index));
  }

  function ajouterProduit() {
    const produit = (catalogue ?? []).find((p) => p.id === produitAAjouter);
    if (!produit) return;
    setLignes((prev) => [...prev, { produitId: produit.id, motif: produit.motif, taille: produit.taille, quantite: 1, prixIndicatif: Number(produit.prix) }]);
    setProduitAAjouter("");
  }

  async function handleEnregistrer() {
    if (lignes.length === 0) {
      onErreur("Une demande doit conserver au moins un produit.");
      return;
    }
    setEnCours(true);
    try {
      await window.maxiEquip.demandesModifierClient(demande.id, {
        clientNom,
        clientTelephone,
        clientAdresse,
        clientEmail: clientEmail.trim() || null,
        commentaire: commentaire.trim() || null,
      });
      await window.maxiEquip.demandesModifierLignes(
        demande.id,
        lignes.map((l) => ({ produitId: l.produitId, motif: l.motif, taille: l.taille, quantite: l.quantite, prixIndicatif: l.prixIndicatif }))
      );
      onEnregistre();
    } catch (err) {
      onErreur(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ marginTop: 18, borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, paddingTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
        Modifier la demande
      </div>

      <label style={labelStyle}>Nom du client</label>
      <input style={{ ...inputStyle, marginBottom: 8 }} value={clientNom} onChange={(e) => setClientNom(e.target.value)} />
      <label style={labelStyle}>Téléphone</label>
      <input style={{ ...inputStyle, marginBottom: 8 }} value={clientTelephone} onChange={(e) => setClientTelephone(e.target.value)} />
      <label style={labelStyle}>Adresse / localisation</label>
      <input style={{ ...inputStyle, marginBottom: 8 }} value={clientAdresse} onChange={(e) => setClientAdresse(e.target.value)} />
      <label style={labelStyle}>Email (facultatif)</label>
      <input style={{ ...inputStyle, marginBottom: 8 }} value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
      <label style={labelStyle}>Commentaire (facultatif)</label>
      <input style={{ ...inputStyle, marginBottom: 14 }} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />

      <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "14px 0" }} />

      <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>
        Produits
      </div>
      {lignes.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: "2 1 140px", fontSize: 13 }}>{l.motif}</div>
          <input
            style={{ ...inputStyle, flex: "1 1 90px" }}
            value={l.taille}
            onChange={(e) => modifierLigne(i, { taille: e.target.value })}
            aria-label="Taille"
          />
          <input
            type="number"
            min={1}
            style={{ ...inputStyle, flex: "0 1 70px" }}
            value={l.quantite}
            onChange={(e) => modifierLigne(i, { quantite: Math.max(1, Number(e.target.value) || 1) })}
            aria-label="Quantité"
          />
          <button
            onClick={() => supprimerLigne(i)}
            title="Supprimer ce produit"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}
          >
            <Trash2 size={16} color={defaultTokens.colors.danger} />
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 10, marginBottom: 16 }}>
        <select style={{ ...inputStyle, flex: 1 }} value={produitAAjouter} onChange={(e) => setProduitAAjouter(e.target.value)}>
          <option value="">Ajouter un produit du catalogue…</option>
          {(catalogue ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.motif} — {p.taille}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={ajouterProduit} disabled={!produitAAjouter}>
          <Plus size={14} />
          Ajouter
        </Button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="secondary" onClick={onAnnuler} disabled={enCours} style={{ flex: 1 }}>
          Annuler
        </Button>
        <Button onClick={() => void handleEnregistrer()} loading={enCours} style={{ flex: 1 }}>
          Enregistrer les modifications
        </Button>
      </div>
    </div>
  );
}

function FormulaireConfirmation({
  demande,
  onAnnuler,
  onConfirme,
  onErreur,
}: {
  demande: Demande;
  session: { userId: string; nom: string };
  onAnnuler: () => void;
  onConfirme: (message: string) => void;
  onErreur: (message: string) => void;
}) {
  const [emplacements, setEmplacements] = useState<Emplacement[] | null>(null);
  const [pointDeVenteId, setPointDeVenteId] = useState("");
  const [modeReglement, setModeReglement] = useState("especes");
  const [depotParLigne, setDepotParLigne] = useState<Record<number, string>>({});
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    void window.maxiEquip.listEmplacements().then((liste) => {
      setEmplacements(liste);
      const shop = liste.find((e) => e.estPointDeVente);
      if (shop) setPointDeVenteId(shop.id);
    });
  }, []);

  const depots = (emplacements ?? []).filter((e) => !e.estPointDeVente && e.actif !== false);

  async function handleConfirmer() {
    setEnCours(true);
    try {
      const resultat = await window.maxiEquip.demandesConfirmer(demande.id, {
        pointDeVenteId,
        vendeurNomManuel: null,
        modeReglement: modeReglement || null,
        lignes: demande.lignes.map((l, i) => {
          const depotId = depotParLigne[i];
          return {
            produitId: l.produitId,
            quantite: l.quantite,
            prixUnitaire: l.prixIndicatif,
            allocationsDepots: depotId ? [{ emplacementId: depotId, quantite: l.quantite }] : [],
          };
        }),
      });
      onConfirme(`Facture ${resultat.numero} créée — ${resultat.total.toLocaleString("fr-FR")} FCFA.`);
    } catch (err) {
      onErreur(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={{ marginTop: 18, borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, paddingTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
        Confirmer en vente
      </div>

      <label style={labelStyle}>Point de vente</label>
      <select style={{ ...inputStyle, marginBottom: 10 }} value={pointDeVenteId} onChange={(e) => setPointDeVenteId(e.target.value)}>
        {(emplacements ?? [])
          .filter((e) => e.estPointDeVente)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
            </option>
          ))}
      </select>

      {demande.lignes.map((l, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            Dépôt pour « {l.motif} » (x{l.quantite})
          </label>
          <select style={inputStyle} value={depotParLigne[i] ?? ""} onChange={(e) => setDepotParLigne((prev) => ({ ...prev, [i]: e.target.value }))}>
            <option value="">Approvisionnement externe</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
        </div>
      ))}

      <label style={labelStyle}>Mode de règlement</label>
      <select style={{ ...inputStyle, marginBottom: 14 }} value={modeReglement} onChange={(e) => setModeReglement(e.target.value)}>
        <option value="especes">Espèces</option>
        <option value="mobile_money">Mobile Money</option>
        <option value="virement">Virement</option>
        <option value="cheque">Chèque</option>
      </select>

      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="secondary" onClick={onAnnuler} disabled={enCours} style={{ flex: 1 }}>
          Retour
        </Button>
        <Button onClick={() => void handleConfirmer()} loading={enCours} disabled={!pointDeVenteId} style={{ flex: 1 }}>
          <Pencil size={14} />
          Confirmer la vente
        </Button>
      </div>
    </div>
  );
}
