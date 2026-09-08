import { useEffect, useMemo, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Eye, Printer, Download, User, ArrowUp, ArrowDown, ChevronsUpDown, Search, Truck, Ban, Plus, FileText, Pencil, ChevronLeft, ChevronRight, X } from "lucide-react";
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

const TAILLE_PAGE = 10;

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
  if (facture.annuleeLe) {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: defaultTokens.radius.pill,
          fontSize: 11.5,
          fontWeight: 700,
          background: defaultTokens.colors.dangerSoft,
          color: defaultTokens.colors.danger,
        }}
      >
        Annulée
      </span>
    );
  }
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
 * Modale du document interne d'approvisionnement — accessible à tous,
 * sans distinction Admin/Gérant (§9 de la correction "Facturation").
 * Chargé à la demande (pas de coût pour les factures sans complément
 * externe, qui restent la majorité).
 */
function DocumentInterneModal({
  factureNumero,
  lignes,
  onFermer,
}: {
  factureNumero: string;
  lignes: { motif: string; taille: string; quantiteTotale: number; quantiteInterne: number; quantiteExterne: number; fournisseur: string | null; prixAchat: number | null }[];
  onFermer: () => void;
}) {
  const aDuExterne = lignes.some((l) => l.quantiteExterne > 0);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <Card elevated style={{ width: "min(560px, 92vw)", boxSizing: "border-box" }}>
        <h2 style={{ margin: "0 0 4px", fontFamily: defaultTokens.typography.display, fontSize: 16.5 }}>Document interne — {factureNumero}</h2>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: defaultTokens.colors.textFaint }}>
          Trace interne MAXI EQUIP, jamais transmise au client — provenance réelle des quantités.
        </p>
        {!aDuExterne ? (
          <p style={{ fontSize: 13.5, color: defaultTokens.colors.textSoft }}>Cette vente a été entièrement couverte par le stock MAXI EQUIP — aucun complément externe.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {lignes.map((l, i) => (
              <div key={i} style={{ border: `1px solid ${defaultTokens.colors.borderSoft}`, borderRadius: defaultTokens.radius.sm, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {l.motif} — {l.taille} <span style={{ color: defaultTokens.colors.textSoft, fontWeight: 400 }}>({l.quantiteTotale} au total)</span>
                </div>
                <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>MAXI EQUIP : {l.quantiteInterne}</div>
                {l.quantiteExterne > 0 && (
                  <>
                    <div style={{ fontSize: 12.5, color: defaultTokens.colors.warning, fontWeight: 600 }}>Fournisseur externe : {l.quantiteExterne}</div>
                    <div style={{ fontSize: 12, color: defaultTokens.colors.textFaint }}>
                      {l.fournisseur} — coût d'achat unitaire : {l.prixAchat?.toLocaleString("fr-FR")} FCFA
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <Button variant="secondary" onClick={onFermer} style={{ width: "100%" }}>
          Fermer
        </Button>
      </Card>
    </div>
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
  onModifierFacture,
}: {
  session: { userId: string; role: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
  onNouvelleSortie: () => void;
  onModifierFacture: (factureId: string) => void;
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
  const [documentInterne, setDocumentInterne] = useState<{ numero: string; lignes: Awaited<ReturnType<typeof window.maxiEquip.getDocumentInterneFacture>> } | null>(null);
  const [page, setPage] = useState(1);

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
      const matchStatut = statutFiltre === "tous" || (statutFiltre === "annulee" ? !!f.annuleeLe : !f.annuleeLe && f.statutLivraison === statutFiltre);
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

  const totalPages = Math.max(1, Math.ceil(triees.length / TAILLE_PAGE));

  // Calcule automatiquement la bonne page pour une navigation cliquable
  // depuis l'Historique/le Dashboard (même logique fiable que pour les
  // Entrées/Transferts, correction "Surbrillance des Factures" §2/§4) —
  // dépend de la liste triée/filtrée complète, jamais de la page
  // actuellement affichée.
  useEffect(() => {
    if (!cibleSurbrillance) return;
    const index = triees.findIndex((f) => f.id === cibleSurbrillance);
    if (index === -1) return;
    setPage(Math.floor(index / TAILLE_PAGE) + 1);
  }, [cibleSurbrillance, triees]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageActuelle = triees.slice((page - 1) * TAILLE_PAGE, page * TAILLE_PAGE);

  // LE CŒUR DU CORRECTIF : la cible n'est transmise au hook de
  // surbrillance QUE si elle est réellement présente sur la page
  // actuellement affichée. Avant ce correctif, la cible brute était
  // transmise dès le montage du composant — avant même que `factures`
  // (chargé de façon asynchrone) ne soit rempli —, ce qui faisait
  // échouer la recherche de l'élément DOM et effaçait la cible avant
  // même l'arrivée des données. C'est exactement ce que faisait déjà
  // HistoriqueOperationsTable pour les Entrées/Transferts.
  const cibleActive = cibleSurbrillance && pageActuelle.some((f) => f.id === cibleSurbrillance) ? cibleSurbrillance : null;
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(cibleActive, onSurbrillanceAppliquee);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" };
    });
    setPage(1);
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

  async function handleVoirDocumentInterne(facture: FactureAvecVendeur) {
    const lignes = await window.maxiEquip.getDocumentInterneFacture(facture.id);
    setDocumentInterne({ numero: facture.numero, lignes });
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
              onChange={(e) => { setRecherche(e.target.value); setPage(1); }}
            />
          </div>
          <select style={inputStyle} value={statutFiltre} onChange={(e) => { setStatutFiltre(e.target.value); setPage(1); }}>
            <option value="tous">Tous les statuts</option>
            <option value="livree">Payée — Livrée</option>
            <option value="en_attente">Payée — En attente</option>
            <option value="annulee">Annulée</option>
          </select>
          <select style={inputStyle} value={vendeurFiltre} onChange={(e) => { setVendeurFiltre(e.target.value); setPage(1); }}>
            <option value="tous">Tous les vendeurs</option>
            {vendeursDisponibles.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {(recherche || statutFiltre !== "tous" || vendeurFiltre !== "tous") && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRecherche("");
                setStatutFiltre("tous");
                setVendeurFiltre("tous");
                setPage(1);
              }}
            >
              <X size={14} />
              Effacer les filtres
            </Button>
          )}
        </div>
      </Card>

      <Card padding={0}>
        {triees.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucune facture ne correspond à vos filtres.</p>
        ) : (
          <>
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
                {pageActuelle.map((f) => {
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
                        <Button variant="ghost" onClick={() => void handleVoirDocumentInterne(f)} title="Document interne (fournisseur externe éventuel)">
                          <FileText size={15} />
                        </Button>
                        {!f.annuleeLe && f.statutLivraison === "en_attente" && (
                          <Button variant="ghost" onClick={() => void handleMarquerLivree(f.id)} title="Marquer comme livrée">
                            <Truck size={15} color={defaultTokens.colors.success} />
                          </Button>
                        )}
                        {f.annuleeLe ? (
                          // Le crayon disparaît une fois cette facture
                          // déjà corrigée une fois — évite de proposer
                          // une seconde correction à partir de la même
                          // erreur déjà traitée.
                          !f.corrigeeParFactureId && (
                            <Button variant="ghost" onClick={() => onModifierFacture(f.id)} title="Modifier (corriger l'erreur dans une nouvelle vente)">
                              <Pencil size={15} color={defaultTokens.colors.accent} />
                            </Button>
                          )
                        ) : (
                          <Button variant="ghost" onClick={() => setFactureAAnnuler(f)} title="Annuler">
                            <Ban size={15} color={defaultTokens.colors.danger} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, padding: "14px 16px", borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${defaultTokens.colors.border}`, borderRadius: defaultTokens.radius.sm, padding: "6px 12px", cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1, fontSize: 12.5 }}
            >
              <ChevronLeft size={14} />
              Précédent
            </button>
            <span style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
              Page {page} sur {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${defaultTokens.colors.border}`, borderRadius: defaultTokens.radius.sm, padding: "6px 12px", cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1, fontSize: 12.5 }}
            >
              Suivant
              <ChevronRight size={14} />
            </button>
          </div>
          </>
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

      {documentInterne && <DocumentInterneModal factureNumero={documentInterne.numero} lignes={documentInterne.lignes} onFermer={() => setDocumentInterne(null)} />}
    </div>
  );
}
