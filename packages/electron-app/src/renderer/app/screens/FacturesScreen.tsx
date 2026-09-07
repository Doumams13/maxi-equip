import { useEffect, useMemo, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Eye, Printer, Download, User, ArrowUp, ArrowDown, ChevronsUpDown, Search, Truck, Ban, Plus } from "lucide-react";
import type { Facture } from "@maxi-equip/shared-types";
import { useSurbrillanceOperation } from "../highlight.js";

type FactureAvecVendeur = Facture & { vendeurNom: string | null; vendeurRole: string | null };

type ColonneTriable = "numero" | "date" | "client" | "vendeur" | "montant" | "statut";
type Direction = "asc" | "desc";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13,
};

function EnteteTriable({
  label,
  colonne,
  tri,
  onTrier,
}: {
  label: string;
  colonne: ColonneTriable;
  tri: { colonne: ColonneTriable | null; direction: Direction };
  onTrier: (c: ColonneTriable) => void;
}) {
  const actif = tri.colonne === colonne;
  const Icone = actif ? (tri.direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      onClick={() => onTrier(colonne)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        font: "inherit",
        fontWeight: 700,
        color: actif ? defaultTokens.colors.accent : defaultTokens.colors.textFaint,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
      }}
    >
      {label}
      <Icone size={11} />
    </button>
  );
}

function StatutBadge({ facture }: { facture: Facture }) {
  const livree = facture.statutLivraison === "livree";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: defaultTokens.radius.pill,
        fontSize: 11.5,
        fontWeight: 700,
        background: livree ? defaultTokens.colors.successSoft : defaultTokens.colors.warningSoft,
        color: livree ? defaultTokens.colors.success : defaultTokens.colors.warning,
      }}
    >
      {livree ? "Payée — Livrée" : "Payée — En attente"}
    </span>
  );
}

/**
 * Modale d'annulation — n'utilise pas ConfirmDialog directement car un
 * motif obligatoire (texte libre) doit être saisi avant de pouvoir
 * confirmer (correction "Facturation" §5 : "une trace de l'erreur doit
 * être conservée").
 */
function AnnulerFactureModal({
  facture,
  onAnnuler,
  onConfirmer,
  confirming,
}: {
  facture: FactureAvecVendeur;
  onAnnuler: () => void;
  onConfirmer: (motif: string) => void;
  confirming: boolean;
}) {
  const [motif, setMotif] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <Card elevated style={{ width: "min(460px, 92vw)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 4px", fontFamily: defaultTokens.typography.display, fontSize: 16.5, color: defaultTokens.colors.danger }}>Annuler cette facture ?</h2>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
          {facture.numero} — {facture.clientNom} · {facture.total.toLocaleString("fr-FR")} FCFA
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: defaultTokens.colors.textFaint }}>
          Le stock prélevé sur les dépôts sera restauré. La vente restera consultable dans l'historique avec le statut ANNULÉE.
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Motif de l'annulation (obligatoire)</label>
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          rows={3}
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "none", marginBottom: 16, fontFamily: defaultTokens.typography.body }}
          placeholder="Ex. Erreur de saisie sur la quantité"
        />
        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onAnnuler} disabled={confirming} style={{ flex: 1 }}>
            Retour
          </Button>
          <Button variant="danger" onClick={() => onConfirmer(motif)} loading={confirming} disabled={motif.trim().length === 0} style={{ flex: 1 }}>
            Confirmer l'annulation
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Écran Factures — reconstruit selon la maquette fournie (recherche,
 * filtres statut/vendeur, tri par colonne, actions) et le modèle officiel
 * de document (généré fidèlement par factureDocumentService.ts, jamais
 * réinventé). Les informations vendeur/auteur respectent l'anonymisation
 * déjà décidée côté Main (jamais recalculée ici).
 */
export function FacturesScreen({
  session,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
  onNouvelleSortie,
}: {
  session: { userId: string; role: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
  onNouvelleSortie: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [factures, setFactures] = useState<FactureAvecVendeur[]>([]);
  const [resumeMois, setResumeMois] = useState<{ nombre: number; total: number } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [statutFiltre, setStatutFiltre] = useState("tous");
  const [vendeurFiltre, setVendeurFiltre] = useState("tous");
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: "date", direction: "desc" });
  const [chargementAction, setChargementAction] = useState<string | null>(null);
  const [factureAAnnuler, setFactureAAnnuler] = useState<FactureAvecVendeur | null>(null);
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(cibleSurbrillance, onSurbrillanceAppliquee);

  async function refresh() {
    const [liste, resume] = await Promise.all([window.maxiEquip.listFactures(), window.maxiEquip.getResumeFacturesMois()]);
    setFactures(liste);
    setResumeMois(resume);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!cibleSurbrillance) return;
    setRecherche("");
    setStatutFiltre("tous");
    setVendeurFiltre("tous");
  }, [cibleSurbrillance]);

  const vendeursDisponibles = useMemo(() => {
    const noms = new Set<string>();
    factures.forEach((f) => {
      const nom = f.vendeurUtilisateurId === session.userId ? "Vous" : f.vendeurNom;
      if (nom) noms.add(nom);
    });
    return Array.from(noms).sort();
  }, [factures, session.userId]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return factures.filter((f) => {
      const matchRecherche = !q || f.numero.toLowerCase().includes(q) || f.clientNom.toLowerCase().includes(q);
      const matchStatut = statutFiltre === "tous" || f.statutLivraison === statutFiltre;
      const nomAffiche = f.vendeurUtilisateurId === session.userId ? "Vous" : f.vendeurNom;
      const matchVendeur = vendeurFiltre === "tous" || nomAffiche === vendeurFiltre;
      return matchRecherche && matchStatut && matchVendeur;
    });
  }, [factures, recherche, statutFiltre, vendeurFiltre, session.userId]);

  const triees = useMemo(() => {
    if (!tri.colonne) return filtrees;
    const sens = tri.direction === "asc" ? 1 : -1;
    const copie = [...filtrees];
    copie.sort((a, b) => {
      switch (tri.colonne) {
        case "numero":
          return sens * a.numero.localeCompare(b.numero, "fr");
        case "date":
          return sens * (new Date(a.date).getTime() - new Date(b.date).getTime());
        case "client":
          return sens * a.clientNom.localeCompare(b.clientNom, "fr");
        case "vendeur":
          return sens * (a.vendeurNom ?? "").localeCompare(b.vendeurNom ?? "", "fr");
        case "montant":
          return sens * (a.total - b.total);
        case "statut":
          return sens * a.statutLivraison.localeCompare(b.statutLivraison, "fr");
        default:
          return 0;
      }
    });
    return copie;
  }, [filtrees, tri]);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" };
    });
  }

  async function handleOuvrir(factureId: string) {
    setChargementAction(factureId);
    try {
      const result = await window.maxiEquip.ouvrirFacturePdf(factureId);
      if (!result.success) showError("Document indisponible", result.message ?? "Impossible d'ouvrir la facture.");
    } finally {
      setChargementAction(null);
    }
  }

  async function handleMarquerLivree(factureId: string) {
    setChargementAction(factureId);
    try {
      await window.maxiEquip.marquerFactureLivree(factureId);
      showSuccess("Facture mise à jour", "Statut changé en « Payée — Livrée ».");
      await refresh();
    } finally {
      setChargementAction(null);
    }
  }

  async function handleAnnuler(motif: string) {
    if (!factureAAnnuler) return;
    setChargementAction(factureAAnnuler.id);
    try {
      const result = await window.maxiEquip.annulerFacture(factureAAnnuler.id, motif);
      if (result.success) {
        showSuccess("Facture annulée", "Le stock prélevé sur les dépôts a été restauré.");
        setFactureAAnnuler(null);
        await refresh();
      } else {
        showError("Annulation impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setChargementAction(null);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: 0 }}>Factures</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
            {resumeMois ? `${resumeMois.nombre} facture(s) · ${resumeMois.total.toLocaleString("fr-FR")} FCFA facturés ce mois-ci` : "…"}
          </p>
        </div>
        <Button onClick={onNouvelleSortie}>
          <Plus size={15} />
          Nouvelle vente
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 260px" }}>
            <Search size={15} color={defaultTokens.colors.textFaint} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 34 }}
              placeholder="Rechercher par numéro ou client…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <select style={inputStyle} value={statutFiltre} onChange={(e) => setStatutFiltre(e.target.value)}>
            <option value="tous">Tous les statuts</option>
            <option value="livree">Payée — Livrée</option>
            <option value="en_attente">Payée — En attente</option>
          </select>
          <select style={inputStyle} value={vendeurFiltre} onChange={(e) => setVendeurFiltre(e.target.value)}>
            <option value="tous">Tous les vendeurs</option>
            {vendeursDisponibles.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card padding={0}>
        {triees.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucune facture ne correspond à vos filtres.</p>
        ) : (
          <div ref={conteneurRef} style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                  <th style={{ padding: "10px 16px" }}>
                    <EnteteTriable label="Numéro" colonne="numero" tri={tri} onTrier={handleTrier} />
                  </th>
                  <th style={{ padding: "10px 16px" }}>
                    <EnteteTriable label="Date" colonne="date" tri={tri} onTrier={handleTrier} />
                  </th>
                  <th style={{ padding: "10px 16px" }}>
                    <EnteteTriable label="Client" colonne="client" tri={tri} onTrier={handleTrier} />
                  </th>
                  <th style={{ padding: "10px 16px" }}>
                    <EnteteTriable label="Vendeur" colonne="vendeur" tri={tri} onTrier={handleTrier} />
                  </th>
                  <th style={{ padding: "10px 16px", textAlign: "right" }}>
                    <EnteteTriable label="Montant" colonne="montant" tri={tri} onTrier={handleTrier} />
                  </th>
                  <th style={{ padding: "10px 16px" }}>
                    <EnteteTriable label="Statut" colonne="statut" tri={tri} onTrier={handleTrier} />
                  </th>
                  <th style={{ padding: "10px 16px" }}></th>
                </tr>
              </thead>
              <tbody>
                {triees.map((f) => {
                  const nomAffiche = f.vendeurUtilisateurId === session.userId ? "Vous" : f.vendeurNom;
                  const enTraitement = chargementAction === f.id;
                  return (
                    <tr key={f.id} data-operation-id={f.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, ...styleSurbrillance(f.id) }}>
                      <td style={{ padding: "10px 16px", fontFamily: defaultTokens.typography.mono, fontWeight: 700, color: defaultTokens.colors.accent }}>{f.numero}</td>
                      <td style={{ padding: "10px 16px", color: defaultTokens.colors.textSoft, whiteSpace: "nowrap" }}>{new Date(f.date).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 600 }}>{f.clientNom}</td>
                      <td style={{ padding: "10px 16px" }}>
                        {nomAffiche ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: defaultTokens.colors.textSoft }}>
                            <User size={12} />
                            {nomAffiche}
                          </span>
                        ) : (
                          <span style={{ color: defaultTokens.colors.textFaint }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>{f.total.toLocaleString("fr-FR")} FCFA</td>
                      <td style={{ padding: "10px 16px" }}>
                        <StatutBadge facture={f} />
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <Button variant="ghost" onClick={() => void handleOuvrir(f.id)} loading={enTraitement} title="Voir">
                          <Eye size={15} />
                        </Button>
                        <Button variant="ghost" onClick={() => void handleOuvrir(f.id)} title="Imprimer">
                          <Printer size={15} />
                        </Button>
                        <Button variant="ghost" onClick={() => void handleOuvrir(f.id)} title="Télécharger">
                          <Download size={15} />
                        </Button>
                        {f.statutLivraison === "en_attente" && (
                          <Button variant="ghost" onClick={() => void handleMarquerLivree(f.id)} title="Marquer comme livrée">
                            <Truck size={15} color={defaultTokens.colors.success} />
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => setFactureAAnnuler(f)} title="Annuler">
                          <Ban size={15} color={defaultTokens.colors.danger} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {factureAAnnuler && (
        <AnnulerFactureModal
          facture={factureAAnnuler}
          onAnnuler={() => setFactureAAnnuler(null)}
          onConfirmer={(motif) => void handleAnnuler(motif)}
          confirming={chargementAction === factureAAnnuler.id}
        />
      )}
    </div>
  );
}
