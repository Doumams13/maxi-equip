import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Eye, Printer, Download, User, ArrowUp, ArrowDown, ChevronsUpDown, Search, Ban, Plus, FileText, Pencil, X } from "lucide-react";
import type { Facture } from "@maxi-equip/shared-types";
import { useSurbrillanceOperation } from "../highlight.js";
import { PdfPreviewModal } from "../components/PdfPreviewModal.js";
import { PaginationIntelligente } from "../components/PaginationIntelligente.js";
import { imprimerPdf } from "../lib/imprimerPdf.js";

type FactureAvecVendeur = Facture & { vendeurNom: string | null; vendeurRole: string | null; aAchatExterieur: boolean };

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
  if (facture.statutPaiement === "reservation") {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: defaultTokens.radius.pill,
          fontSize: 11.5,
          fontWeight: 700,
          background: defaultTokens.colors.accentSoft,
          color: defaultTokens.colors.accent,
        }}
      >
        Réservation
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
 * Menu de changement de statut — correction "Réservation / Acompte",
 * remplace l'ancien bouton unique "Marquer comme livrée" (ne couvrait
 * qu'un seul sens de transition). Les options proposées dépendent du
 * statut actuel : "Réservation" ne réapparaît jamais comme option une
 * fois la facture payée (aucun mécanisme pour rendre l'argent déjà
 * reçu) ; "Payée — non livrée" et "Payée — livrée" restent librement
 * interchangeables dans les deux sens (aucun verrou "terminus").
 */
function SelecteurStatut({
  facture,
  disabled,
  onChanger,
}: {
  facture: Facture;
  disabled: boolean;
  onChanger: (nouveauStatut: "reservation" | "payee_non_livree" | "payee_livree") => void;
}) {
  const valeurActuelle: "reservation" | "payee_non_livree" | "payee_livree" =
    facture.statutPaiement === "reservation" ? "reservation" : facture.statutLivraison === "livree" ? "payee_livree" : "payee_non_livree";

  const options: { value: "reservation" | "payee_non_livree" | "payee_livree"; label: string }[] =
    facture.statutPaiement === "reservation"
      ? [
          { value: "reservation", label: "Réservation" },
          { value: "payee_non_livree", label: "Payée — Non livrée" },
          { value: "payee_livree", label: "Payée — Livrée" },
        ]
      : [
          { value: "payee_non_livree", label: "Payée — Non livrée" },
          { value: "payee_livree", label: "Payée — Livrée" },
        ];

  return (
    <select
      value={valeurActuelle}
      disabled={disabled}
      onChange={(e) => onChanger(e.target.value as "reservation" | "payee_non_livree" | "payee_livree")}
      style={{
        padding: "4px 6px",
        borderRadius: defaultTokens.radius.sm,
        border: `1px solid ${defaultTokens.colors.border}`,
        fontFamily: defaultTokens.typography.body,
        fontSize: 12,
        color: defaultTokens.colors.textSoft,
        background: "#fff",
      }}
      title="Changer le statut"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
  const [totalResultats, setTotalResultats] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [chargementListe, setChargementListe] = useState(true);
  const [resumeMois, setResumeMois] = useState<{ nombre: number; total: number } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [rechercheDebattue, setRechercheDebattue] = useState("");
  const [statutFiltre, setStatutFiltre] = useState<"tous" | "annulee" | "en_attente" | "livree">("tous");
  const [vendeurFiltreId, setVendeurFiltreId] = useState<string | null>(null);
  const [vendeursDisponibles, setVendeursDisponibles] = useState<{ id: string; nom: string }[]>([]);
  const [tri, setTri] = useState<{ colonne: ColonneTriable | null; direction: Direction }>({ colonne: "date", direction: "desc" });
  const [chargementAction, setChargementAction] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ chemin: string; nomSuggere: string; titre: string } | null>(null);
  const [factureAAnnuler, setFactureAAnnuler] = useState<FactureAvecVendeur | null>(null);

  const [page, setPage] = useState(1);

  /**
   * Correction "Audit Phase 2 — pagination Factures" : plus de plafond
   * de 50 factures chargées en une fois. Recherche, filtre de statut,
   * filtre de vendeur et tri sont envoyés au Main, qui interroge la base
   * de données directement (LIMIT/OFFSET) — seules les 10 lignes de la
   * page demandée transitent par IPC, quel que soit le nombre total de
   * factures enregistrées.
   */
  async function chargerPage() {
    setChargementListe(true);
    try {
      const result = await window.maxiEquip.listFacturesPagine({
        recherche: rechercheDebattue,
        statutFiltre,
        vendeurUtilisateurId: vendeurFiltreId,
        colonneTri: tri.colonne,
        direction: tri.direction,
        page,
        tailleParPage: TAILLE_PAGE,
      });
      setFactures(result.resultats);
      setTotalResultats(result.totalResultats);
      setTotalPages(result.totalPages);
    } finally {
      setChargementListe(false);
    }
  }

  useEffect(() => {
    void chargerPage();
  }, [rechercheDebattue, statutFiltre, vendeurFiltreId, tri, page]);

  // Anti-rebond léger sur la recherche : évite une requête base de
  // données à chaque frappe (§ Performance de la correction) — 300ms est
  // imperceptible pour l'utilisateur, mais évite de solliciter SQLite à
  // chaque caractère tapé.
  //
  // BUG RÉEL CORRIGÉ (signalé : clic sur une ancienne facture depuis
  // l'Historique ne redirigeait ni ne mettait en évidence la bonne
  // facture) : ce minuteur de 300ms se déclenchait aussi lorsque la
  // recherche était réinitialisée PROGRAMMATIQUEMENT par la navigation
  // cliquable (ci-dessous), et retombait sur setPage(1) — écrasant la
  // bonne page que trouverPageFacture() venait de positionner quelques
  // millisecondes plus tôt (l'appel IPC résout bien avant les 300ms).
  // Correction : ne réinitialiser la page que si la recherche a
  // RÉELLEMENT changé depuis la dernière valeur déjà appliquée — jamais
  // le cas lors d'une navigation, qui vide `recherche` ET
  // `rechercheDebattue` de façon synchrone AVANT que ce minuteur ne se
  // déclenche.
  useEffect(() => {
    const timer = setTimeout(() => {
      setRechercheDebattue((precedente) => {
        if (precedente !== recherche) setPage(1);
        return recherche;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [recherche]);

  async function chargerResumeEtVendeurs() {
    const [resume, vendeurs] = await Promise.all([window.maxiEquip.getResumeFacturesMois(), window.maxiEquip.listVendeursFiltrables()]);
    setResumeMois(resume);
    setVendeursDisponibles(vendeurs);
  }

  useEffect(() => {
    void chargerResumeEtVendeurs();
  }, []);

  /**
   * Navigation cliquable depuis l'Historique/le Tableau de bord :
   * puisqu'une seule page est chargée à la fois, la bonne page est
   * désormais demandée directement à la base de données (rang réel de
   * la facture sous le tri par défaut), jamais recalculée à partir d'une
   * liste complète qui n'existe plus en mémoire côté Renderer.
   */
  useEffect(() => {
    if (!cibleSurbrillance) return;
    setRecherche("");
    setRechercheDebattue("");
    setStatutFiltre("tous");
    setVendeurFiltreId(null);
    setTri({ colonne: "date", direction: "desc" });
    void window.maxiEquip.trouverPageFacture(cibleSurbrillance, TAILLE_PAGE).then((bonnePage) => {
      if (bonnePage !== null) setPage(bonnePage);
    });
  }, [cibleSurbrillance]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // LE CŒUR DU CORRECTIF (conservé) : la cible n'est transmise au hook
  // de surbrillance QUE si elle est réellement présente dans la page
  // actuellement chargée depuis le serveur.
  const cibleActive = cibleSurbrillance && factures.some((f) => f.id === cibleSurbrillance) ? cibleSurbrillance : null;
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(cibleActive, onSurbrillanceAppliquee);

  function handleTrier(colonne: ColonneTriable) {
    setTri((prev) => {
      if (prev.colonne !== colonne) return { colonne, direction: "asc" };
      if (prev.direction === "asc") return { colonne, direction: "desc" };
      return { colonne: null, direction: "asc" };
    });
    setPage(1);
  }

  /**
   * Trois actions réellement distinctes (correction "Voir / Imprimer /
   * Télécharger") — plus jamais une seule fonction partagée. Chacune
   * régénère le PDF à partir des données actuelles (§ "cliquer plusieurs
   * fois ne doit jamais créer de doublon" — la régénération n'a aucun
   * effet de bord, seule la lecture/l'impression/l'enregistrement diffère).
   */
  async function handleVoir(factureId: string, numero: string) {
    setChargementAction(factureId);
    try {
      const genere = await window.maxiEquip.genererFacturePdf(factureId);
      if (genere.success && genere.chemin) {
        setApercu({ chemin: genere.chemin, nomSuggere: genere.nomSuggere ?? `${numero}.pdf`, titre: `Facture ${numero}` });
      } else {
        showError("Document indisponible", genere.message ?? "Impossible de générer la facture.");
      }
    } finally {
      setChargementAction(null);
    }
  }

  async function handleImprimer(factureId: string) {
    setChargementAction(factureId);
    try {
      const genere = await window.maxiEquip.genererFacturePdf(factureId);
      if (!genere.success || !genere.chemin) {
        showError("Impression impossible", genere.message ?? "Impossible de générer la facture.");
        return;
      }
      const result = await imprimerPdf(genere.chemin);
      if (!result.success && result.message) showError("Impression impossible", result.message);
    } finally {
      setChargementAction(null);
    }
  }

  async function handleTelecharger(factureId: string, numero: string) {
    setChargementAction(factureId);
    try {
      const genere = await window.maxiEquip.genererFacturePdf(factureId);
      if (!genere.success || !genere.chemin) {
        showError("Enregistrement impossible", genere.message ?? "Impossible de générer la facture.");
        return;
      }
      const result = await window.maxiEquip.telechargerDocument(genere.chemin, genere.nomSuggere ?? `${numero}.pdf`);
      if (result.success) showSuccess("Facture enregistrée", `Enregistrée sous ${result.chemin}`);
      else if (!result.canceled) showError("Enregistrement impossible", result.message ?? "Une erreur inattendue s'est produite.");
    } finally {
      setChargementAction(null);
    }
  }

  async function handleChangerStatut(factureId: string, nouveauStatut: "reservation" | "payee_non_livree" | "payee_livree") {
    setChargementAction(factureId);
    try {
      const result = await window.maxiEquip.changerStatutFacture(factureId, nouveauStatut);
      if (result.success) {
        const libelles: Record<typeof nouveauStatut, string> = {
          reservation: "Réservation",
          payee_non_livree: "Payée — Non livrée",
          payee_livree: "Payée — Livrée",
        };
        showSuccess("Facture mise à jour", `Statut changé en « ${libelles[nouveauStatut]} ».`);
        await chargerPage();
      } else {
        showError("Changement de statut impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
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
        await chargerPage();
      } else {
        showError("Annulation impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setChargementAction(null);
    }
  }

  /**
   * Document interne — mêmes principes (§4 de la correction) : "Voir"
   * ouvre le même composant d'aperçu générique (PdfPreviewModal), dont
   * les boutons Imprimer/Télécharger intégrés couvrent les deux autres
   * actions sans dupliquer la logique.
   */
  async function handleVoirDocumentInterne(facture: FactureAvecVendeur) {
    setChargementAction(facture.id);
    try {
      const genere = await window.maxiEquip.genererDocumentInternePdf(facture.id);
      if (genere.success && genere.chemin) {
        setApercu({ chemin: genere.chemin, nomSuggere: genere.nomSuggere ?? `${facture.numero}-document-interne.pdf`, titre: `Document interne — ${facture.numero}` });
      } else {
        showError("Document indisponible", genere.message ?? "Impossible de générer le document interne.");
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
              onChange={(e) => { setRecherche(e.target.value); setPage(1); }}
            />
          </div>
          <select
            style={inputStyle}
            value={statutFiltre}
            onChange={(e) => {
              setStatutFiltre(e.target.value as "tous" | "annulee" | "en_attente" | "livree");
              setPage(1);
            }}
          >
            <option value="tous">Tous les statuts</option>
            <option value="livree">Payée — Livrée</option>
            <option value="en_attente">Payée — En attente</option>
            <option value="annulee">Annulée</option>
          </select>
          <select
            style={inputStyle}
            value={vendeurFiltreId ?? "tous"}
            onChange={(e) => {
              setVendeurFiltreId(e.target.value === "tous" ? null : e.target.value);
              setPage(1);
            }}
          >
            <option value="tous">Tous les vendeurs</option>
            {vendeursDisponibles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nom}
              </option>
            ))}
          </select>
          {(recherche || statutFiltre !== "tous" || vendeurFiltreId !== null) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRecherche("");
                setRechercheDebattue("");
                setStatutFiltre("tous");
                setVendeurFiltreId(null);
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
        {chargementListe ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Chargement…</p>
        ) : factures.length === 0 ? (
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
                {factures.map((f) => {
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
                          <StatutBadge facture={f} />
                          {!f.annuleeLe && (
                            <SelecteurStatut facture={f} disabled={enTraitement} onChanger={(nouveauStatut) => void handleChangerStatut(f.id, nouveauStatut)} />
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        <Button variant="ghost" onClick={() => void handleVoir(f.id, f.numero)} loading={enTraitement} title="Voir">
                          <Eye size={15} />
                        </Button>
                        <Button variant="ghost" onClick={() => void handleImprimer(f.id)} title="Imprimer">
                          <Printer size={15} />
                        </Button>
                        <Button variant="ghost" onClick={() => void handleTelecharger(f.id, f.numero)} title="Télécharger">
                          <Download size={15} />
                        </Button>
                        {/* Correction "Document interne — réservé aux
                            achats extérieurs" §1 : n'apparaît que si
                            cette facture a réellement un relevé
                            d'approvisionnement externe associé — plus
                            jamais affiché sans condition. */}
                        {f.aAchatExterieur && (
                          <Button variant="ghost" onClick={() => void handleVoirDocumentInterne(f)} title="Document interne — Achat extérieur">
                            <FileText size={15} />
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

          <div style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
            <PaginationIntelligente page={page} totalPages={totalPages} totalResultats={totalResultats} libelleUnite="facture(s)" onChangerPage={setPage} />
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

      {apercu && <PdfPreviewModal chemin={apercu.chemin} nomSuggere={apercu.nomSuggere} titre={apercu.titre} onFermer={() => setApercu(null)} />}
    </div>
  );
}
