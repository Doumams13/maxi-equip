import { useEffect, useRef, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Save, Plus, Trash2, Pencil, Archive, RotateCcw, Check, X, History, FolderOpen } from "lucide-react";
import type { Emplacement } from "@maxi-equip/shared-types";
import { ConfirmationMotDePasse } from "../components/ConfirmationMotDePasse.js";

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

/**
 * Écran Paramètres — Administrateur uniquement (canEditCompanySettings).
 *
 * Identité et coordonnées : enregistrement protégé par une double
 * validation par mot de passe (demande explicite — "ce sont des données
 * sensibles"), réutilisant la vérification de connexion existante sans
 * jamais modifier la session en cours.
 *
 * Points de vente / Emplacements : gestion dynamique (correction "Points
 * de vente dynamiques") — ajouter, renommer, archiver, réactiver. Jamais
 * de suppression physique : archiver conserve tout l'historique existant
 * (ventes, entrées, transferts, stock). SHOP reste une entité fixe et
 * unique, jamais géré depuis cet écran (la décision métier "SHOP n'a pas
 * de stock" ne change pas).
 */
export function ParametresScreen() {
  const { showSuccess, showError } = useToast();
  const [chargement, setChargement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [demandeMotDePasse, setDemandeMotDePasse] = useState(false);

  const [nomMagasin, setNomMagasin] = useState("");
  const [adresse, setAdresse] = useState("");
  const [quartier, setQuartier] = useState("");
  const [telephones, setTelephones] = useState<string[]>([""]);
  const [nomAdministrateur, setNomAdministrateur] = useState("");
  const [nomGerant, setNomGerant] = useState("");

  const [depots, setDepots] = useState<Emplacement[]>([]);
  const [suppressibles, setSuppressibles] = useState<Record<string, boolean>>({});
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [renommageId, setRenommageId] = useState<string | null>(null);
  const [renommageValeur, setRenommageValeur] = useState("");
  const [archivageCible, setArchivageCible] = useState<Emplacement | null>(null);
  const [suppressionCible, setSuppressionCible] = useState<Emplacement | null>(null);
  const [stockBloquant, setStockBloquant] = useState<{ nom: string; lignes: { motif: string; taille: string; quantite: number }[] } | null>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  async function chargerTout() {
    const [identite, emplacements] = await Promise.all([window.maxiEquip.getIdentiteEntreprise(), window.maxiEquip.listEmplacements()]);
    setNomMagasin(identite.nom);
    setAdresse(identite.adresse);
    setQuartier(identite.quartier);
    setTelephones(identite.telephones.length > 0 ? identite.telephones : [""]);
    setNomAdministrateur(identite.nomAdministrateur ?? "");
    setNomGerant(identite.nomGerant ?? "");
    const seulsDepots = emplacements.filter((e) => !e.estPointDeVente);
    setDepots(seulsDepots);
    // Correction "Suppression vs Archivage" §3 : vérifié automatiquement
    // à chaque chargement — jamais figé, une opération ultérieure (ex.
    // une entrée de stock) peut rendre un point de vente non suppressible.
    if (seulsDepots.length > 0) {
      setSuppressibles(await window.maxiEquip.verifierEmplacementsSuppressibles(seulsDepots.map((d) => d.id)));
    }
  }

  useEffect(() => {
    void (async () => {
      await chargerTout();
      setChargement(false);
    })();
  }, []);

  function modifierTelephone(index: number, valeur: string) {
    setTelephones((prev) => prev.map((t, i) => (i === index ? valeur : t)));
  }
  function ajouterTelephone() {
    setTelephones((prev) => [...prev, ""]);
  }
  function supprimerTelephone(index: number) {
    setTelephones((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleEnregistrerIdentite() {
    setSaving(true);
    try {
      const result = await window.maxiEquip.setIdentiteEntreprise({
        nom: nomMagasin,
        adresse,
        quartier,
        telephones: telephones.map((t) => t.trim()).filter((t) => t.length > 0),
        nomAdministrateur: nomAdministrateur.trim() || null,
        nomGerant: nomGerant.trim() || null,
      });
      if (result.success) {
        showSuccess("Paramètres enregistrés avec succès", "Les nouvelles valeurs sont utilisées immédiatement dans toute l'application.");
      } else {
        showError("Enregistrement impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setSaving(false);
      setDemandeMotDePasse(false);
    }
  }

  async function handleAjouterDepot() {
    if (!nouveauNom.trim()) return;
    setAjoutEnCours(true);
    try {
      const result = await window.maxiEquip.creerDepot(nouveauNom);
      if (result.success) {
        setAjoutOuvert(false);
        setNouveauNom("");
        await chargerTout();
        showSuccess("Point de vente ajouté", `« ${nouveauNom} » est immédiatement disponible dans toute l'application.`);
      } else {
        showError("Ajout impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setAjoutEnCours(false);
    }
  }

  function commencerRenommage(depot: Emplacement) {
    setRenommageId(depot.id);
    setRenommageValeur(depot.nom);
  }

  async function confirmerRenommage() {
    if (!renommageId || !renommageValeur.trim()) return;
    setActionEnCours(renommageId);
    try {
      const result = await window.maxiEquip.renommerEmplacement(renommageId, renommageValeur);
      if (result.success) {
        setRenommageId(null);
        await chargerTout();
        showSuccess("Point de vente renommé", "Le nouveau nom est utilisé partout dans l'application.");
      } else {
        showError("Renommage impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setActionEnCours(null);
    }
  }

  async function confirmerArchivage() {
    if (!archivageCible) return;
    setActionEnCours(archivageCible.id);
    try {
      const result = await window.maxiEquip.archiverEmplacement(archivageCible.id);
      if (result.success) {
        setArchivageCible(null);
        await chargerTout();
        showSuccess("Point de vente archivé", `« ${archivageCible.nom} » n'est plus disponible pour de nouvelles opérations. Son historique reste intact.`);
      } else if (result.stockRestant && result.stockRestant.length > 0) {
        setStockBloquant({ nom: archivageCible.nom, lignes: result.stockRestant });
        setArchivageCible(null);
      } else {
        showError("Archivage impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setActionEnCours(null);
    }
  }

  async function confirmerSuppression() {
    if (!suppressionCible) return;
    setActionEnCours(suppressionCible.id);
    try {
      const result = await window.maxiEquip.supprimerEmplacementDefinitivement(suppressionCible.id);
      if (result.success) {
        showSuccess("Point de vente supprimé", `« ${suppressionCible.nom} » a été définitivement supprimé.`);
        setSuppressionCible(null);
        await chargerTout();
      } else {
        // La vérification côté serveur a été refaite (défense en
        // profondeur) — une opération a pu avoir lieu entre l'affichage
        // du bouton et le clic. Message exact demandé (§3).
        showError("Suppression impossible", result.message ?? "Ce point de vente ne peut pas être supprimé car il est déjà utilisé dans des données de l'application. Vous pouvez l'archiver.");
        setSuppressionCible(null);
        await chargerTout();
      }
    } finally {
      setActionEnCours(null);
    }
  }

  async function handleReactiver(depot: Emplacement) {
    setActionEnCours(depot.id);
    try {
      const result = await window.maxiEquip.reactiverEmplacement(depot.id);
      if (result.success) {
        await chargerTout();
        showSuccess("Point de vente réactivé", `« ${depot.nom} » est de nouveau disponible pour les ventes, entrées et transferts.`);
      } else {
        showError("Réactivation impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setActionEnCours(null);
    }
  }

  const depotsActifs = depots.filter((d) => d.actif);
  const depotsArchives = depots.filter((d) => !d.actif);

  function LignePointDeVente({ depot }: { depot: Emplacement }) {
    const enRenommage = renommageId === depot.id;
    const enCours = actionEnCours === depot.id;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
        {enRenommage ? (
          <input
            style={{ ...inputStyle, marginRight: 10 }}
            value={renommageValeur}
            onChange={(e) => setRenommageValeur(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void confirmerRenommage()}
            autoFocus
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{depot.nom}</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: defaultTokens.radius.pill,
                background: depot.actif ? defaultTokens.colors.successSoft : defaultTokens.colors.dangerSoft,
                color: depot.actif ? defaultTokens.colors.success : defaultTokens.colors.danger,
              }}
            >
              {depot.actif ? "Actif" : "Archivé"}
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {enRenommage ? (
            <>
              <Button variant="ghost" onClick={() => void confirmerRenommage()} loading={enCours} title="Valider">
                <Check size={15} color={defaultTokens.colors.success} />
              </Button>
              <Button variant="ghost" onClick={() => setRenommageId(null)} title="Annuler">
                <X size={15} />
              </Button>
            </>
          ) : depot.actif ? (
            <>
              <Button variant="ghost" onClick={() => commencerRenommage(depot)} title="Renommer">
                <Pencil size={15} />
              </Button>
              {suppressibles[depot.id] ? (
                <Button variant="ghost" onClick={() => setSuppressionCible(depot)} title="Supprimer définitivement (jamais utilisé)">
                  <Trash2 size={15} color={defaultTokens.colors.danger} />
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setArchivageCible(depot)} title="Archiver">
                  <Archive size={15} color={defaultTokens.colors.warning} />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => void handleReactiver(depot)} loading={enCours} title="Réactiver">
                <RotateCcw size={15} color={defaultTokens.colors.accent} />
              </Button>
              {/* Correction "Finaliser Paramètres" §H : un point de vente
                  archivé sans aucune donnée métier associée (créé puis
                  archivé par erreur, jamais utilisé) peut aussi être
                  supprimé définitivement — jamais uniquement Restaurer. */}
              {suppressibles[depot.id] && (
                <Button variant="ghost" onClick={() => setSuppressionCible(depot)} title="Supprimer définitivement (jamais utilisé)">
                  <Trash2 size={15} color={defaultTokens.colors.danger} />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 28, maxWidth: 640 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Paramètres</h1>
      <p style={{ marginTop: -6, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Configuration centralisée de l'entreprise</p>

      <Card style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, marginBottom: 16 }}>Identité et coordonnées</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nom du magasin</label>
          <input style={inputStyle} value={nomMagasin} onChange={(e) => setNomMagasin(e.target.value)} disabled={chargement} placeholder="Ex. MAXI-EQUIP" />
        </div>

        <label style={labelStyle}>Numéros de téléphone</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {telephones.map((tel, index) => (
            <div key={index} style={{ display: "flex", gap: 8 }}>
              <input style={inputStyle} value={tel} onChange={(e) => modifierTelephone(index, e.target.value)} disabled={chargement} placeholder={`Téléphone ${index + 1}`} />
              {telephones.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => supprimerTelephone(index)} title="Supprimer ce numéro">
                  <Trash2 size={15} color={defaultTokens.colors.danger} />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" onClick={ajouterTelephone} disabled={chargement} style={{ marginBottom: 16 }}>
          <Plus size={14} />
          Ajouter un numéro
        </Button>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Adresse</label>
          <input style={inputStyle} value={adresse} onChange={(e) => setAdresse(e.target.value)} disabled={chargement} placeholder="Ex. Quartier Beaulieu (face à BATI-PLUS)" />
        </div>

        <div>
          <label style={labelStyle}>Quartier / Localisation</label>
          <input style={inputStyle} value={quartier} onChange={(e) => setQuartier(e.target.value)} disabled={chargement} placeholder="Ex. Akanda - Gabon" />
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 10 }}>
            Responsables
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nom de l'Administrateur</label>
              <input
                style={inputStyle}
                value={nomAdministrateur}
                onChange={(e) => setNomAdministrateur(e.target.value)}
                disabled={chargement}
                placeholder="Ex. Mamadou Ndiaye"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nom du Gérant</label>
              <input style={inputStyle} value={nomGerant} onChange={(e) => setNomGerant(e.target.value)} disabled={chargement} placeholder="Ex. Jean Dupont" />
            </div>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
            Facultatif — ces noms apparaissent sur les factures et documents internes générés lorsqu'ils sont renseignés.
          </p>
        </div>

        <p style={{ margin: "16px 0 16px", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
          Ces informations apparaissent automatiquement sur les factures et documents internes générés.
        </p>

        <Button onClick={() => setDemandeMotDePasse(true)} disabled={chargement || saving} loading={saving}>
          <Save size={15} />
          Enregistrer les modifications
        </Button>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, marginBottom: 4 }}>Points de vente / Emplacements</h2>
          <Button variant="secondary" onClick={() => setAjoutOuvert(true)} disabled={chargement}>
            <Plus size={14} />
            Ajouter un point de vente
          </Button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
          Le nom est utilisé automatiquement partout dans l'application (stock, ventes, transferts, historique, tableau de bord).
        </p>

        <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Actifs</div>
        {depotsActifs.length === 0 && <p style={{ fontSize: 13, color: defaultTokens.colors.textSoft }}>Aucun point de vente actif.</p>}
        {depotsActifs.map((depot) => (
          <LignePointDeVente key={depot.id} depot={depot} />
        ))}

        {depotsArchives.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em", marginTop: 20, marginBottom: 4 }}>
              Archivés
            </div>
            {depotsArchives.map((depot) => (
              <LignePointDeVente key={depot.id} depot={depot} />
            ))}
          </>
        )}
      </Card>

      <BlocSauvegarde />

      {ajoutOuvert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
          <Card elevated style={{ width: "min(400px, 92vw)", boxSizing: "border-box" }}>
            <h2 style={{ margin: "0 0 14px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Ajouter un point de vente</h2>
            <label style={labelStyle}>Nom du point de vente</label>
            <input
              style={inputStyle}
              value={nouveauNom}
              onChange={(e) => setNouveauNom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleAjouterDepot()}
              placeholder="Ex. Owendo"
              autoFocus
            />
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setAjoutOuvert(false);
                  setNouveauNom("");
                }}
                disabled={ajoutEnCours}
                style={{ flex: 1 }}
              >
                Annuler
              </Button>
              <Button onClick={() => void handleAjouterDepot()} loading={ajoutEnCours} disabled={!nouveauNom.trim()} style={{ flex: 1 }}>
                Ajouter
              </Button>
            </div>
          </Card>
        </div>
      )}

      {archivageCible && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
          <Card elevated style={{ width: "min(440px, 92vw)", boxSizing: "border-box" }}>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.warning }}>Archiver le point de vente ?</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: defaultTokens.colors.textSoft }}>
              Le point de vente « {archivageCible.nom} » ne sera plus disponible pour les nouvelles ventes, entrées et transferts.
              <br />
              Les données et l'historique existants seront conservés.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setArchivageCible(null)} disabled={actionEnCours === archivageCible.id} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => void confirmerArchivage()} loading={actionEnCours === archivageCible.id} style={{ flex: 1 }}>
                Archiver
              </Button>
            </div>
          </Card>
        </div>
      )}

      {stockBloquant && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
          <Card elevated style={{ width: "min(460px, 92vw)", boxSizing: "border-box" }}>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.danger }}>
              Impossible d'archiver ce point de vente immédiatement
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: defaultTokens.colors.textSoft }}>Le point de vente « {stockBloquant.nom} » possède encore du stock :</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {stockBloquant.lignes.map((l, i) => (
                <div
                  key={i}
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 10px", background: defaultTokens.colors.surfaceAlt, borderRadius: defaultTokens.radius.sm }}
                >
                  <span>
                    {l.motif} — {l.taille}
                  </span>
                  <span style={{ fontWeight: 700 }}>{l.quantite} ct.</span>
                </div>
              ))}
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: defaultTokens.colors.textFaint }}>Veuillez transférer ou gérer le stock restant avant l'archivage.</p>
            <Button variant="secondary" onClick={() => setStockBloquant(null)} style={{ width: "100%" }}>
              Fermer
            </Button>
          </Card>
        </div>
      )}

      {suppressionCible && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}>
          <Card elevated style={{ width: "min(440px, 92vw)", boxSizing: "border-box" }}>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.danger }}>
              Supprimer définitivement le point de vente ?
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: defaultTokens.colors.textSoft }}>
              Supprimer définitivement le point de vente « {suppressionCible.nom} » ?
              <br />
              <strong>Cette action est irréversible.</strong>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={() => setSuppressionCible(null)} disabled={actionEnCours === suppressionCible.id} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => void confirmerSuppression()} loading={actionEnCours === suppressionCible.id} style={{ flex: 1 }}>
                Supprimer
              </Button>
            </div>
          </Card>
        </div>
      )}

      {demandeMotDePasse && (
        <ConfirmationMotDePasse
          titre="Confirmer l'enregistrement"
          message="Ces informations sont sensibles et affectent les documents générés. Veuillez confirmer votre mot de passe pour enregistrer les modifications."
          onAnnuler={() => setDemandeMotDePasse(false)}
          onConfirme={() => void handleEnregistrerIdentite()}
        />
      )}
    </div>
  );
}

/**
 * Sauvegarde des données — corrigée pour distinguer clairement deux
 * usages différents (correction "Sécurité et clarté des sauvegardes",
 * Partie 10) : une sauvegarde MANUELLE, exportable et protégée par un
 * mot de passe choisi par l'utilisateur, et les sauvegardes
 * AUTOMATIQUES, une sécurité purement locale sans mot de passe. Toute
 * la logique réelle (VACUUM INTO, rekey, chiffrement du mot de passe)
 * reste côté Main — ce composant ne fait qu'appeler l'IPC et afficher
 * le résultat, jamais un accès direct au système de fichiers ni à la
 * cryptographie.
 */
function BlocSauvegarde() {
  const [statut, setStatut] = useState<{ derniereAutomatique: { createdAt: string } | null; nombreVulnerables: number } | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [dossierChoisi, setDossierChoisi] = useState<string | null>(null);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");
  const [erreurMotDePasse, setErreurMotDePasse] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();

  // --- Restauration (Phase 3.9) ---
  type EtapeRestauration = "fermee" | "analyse" | "resume" | "confirmation" | "en_cours" | "erreur";
  const [etapeRestauration, setEtapeRestauration] = useState<EtapeRestauration>("fermee");
  const [analyseRestauration, setAnalyseRestauration] = useState<Awaited<ReturnType<typeof window.maxiEquip.backupRestoreAnalyser>> | null>(null);
  const [erreurRestauration, setErreurRestauration] = useState<string | null>(null);
  const dossierRestaurationRef = useRef<string>("");
  const motDePasseRestaurationRef = useRef<string>("");

  function reinitialiserRestauration() {
    setEtapeRestauration("fermee");
    setAnalyseRestauration(null);
    setErreurRestauration(null);
    dossierRestaurationRef.current = "";
    motDePasseRestaurationRef.current = "";
  }

  async function handleDemarrerRestauration() {
    const choix = await window.maxiEquip.backupRestoreChoisirDossier();
    if (choix.canceled) return;
    dossierRestaurationRef.current = choix.dossier;
    setEtapeRestauration("analyse");
    const analyse = await window.maxiEquip.backupRestoreAnalyser(choix.dossier);
    if (analyse.compatible === "incompatible") {
      setErreurRestauration(analyse.message);
      setEtapeRestauration("erreur");
      return;
    }
    setAnalyseRestauration(analyse);
    setEtapeRestauration("resume");
  }

  async function handleExecuterRestauration() {
    setEtapeRestauration("en_cours");
    try {
      const resultat = await window.maxiEquip.backupRestoreExecuter(dossierRestaurationRef.current, motDePasseRestaurationRef.current || undefined);
      if (!resultat.success) {
        setErreurRestauration(resultat.message ?? "Une erreur est survenue.");
        setEtapeRestauration("erreur");
      }
      // En cas de succès, l'application redémarre d'elle-même (déclenché côté Main) — rien d'autre à faire ici.
    } catch (err) {
      setErreurRestauration(err instanceof Error ? err.message : "Une erreur est survenue.");
      setEtapeRestauration("erreur");
    }
  }

  useEffect(() => {
    void window.maxiEquip.backupGetStatut().then(setStatut);
  }, []);

  async function handleChoisirDossier() {
    const resultat = await window.maxiEquip.backupChoisirDossier();
    if (!resultat.canceled) {
      setDossierChoisi(resultat.dossier);
      setMotDePasse("");
      setConfirmationMotDePasse("");
      setErreurMotDePasse(null);
    }
  }

  async function handleConfirmerSauvegardeManuelle() {
    if (!dossierChoisi) return;
    if (!motDePasse || motDePasse.length < 8) {
      setErreurMotDePasse("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (motDePasse !== confirmationMotDePasse) {
      setErreurMotDePasse("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setErreurMotDePasse(null);
    setCreationEnCours(true);
    try {
      const resultat = await window.maxiEquip.backupCreerManuelle(dossierChoisi, motDePasse, confirmationMotDePasse);
      if (resultat.success) {
        showSuccess("Sauvegarde créée", `Enregistrée dans : ${resultat.chemin}`);
        setDossierChoisi(null);
        setMotDePasse("");
        setConfirmationMotDePasse("");
      } else {
        showError("Sauvegarde impossible", resultat.message ?? "Une erreur est survenue.");
      }
    } catch (err) {
      showError("Sauvegarde impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setCreationEnCours(false);
    }
  }

  async function handleOuvrirDossierAutomatique() {
    const resultat = await window.maxiEquip.backupOuvrirDossier();
    if (!resultat.success) showError("Impossible d'ouvrir le dossier", resultat.message ?? "");
  }

  const derniereDate = statut?.derniereAutomatique
    ? new Date(statut.derniereAutomatique.createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
    : null;

  return (
    <>
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Save size={16} color={defaultTokens.colors.accent} />
          <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, margin: 0 }}>Sauvegarde des données</h2>
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>Protégez et restaurez les données de MAXI-EQUIP.</p>

        <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "0 0 18px" }} />

        {/* --- Sauvegarde manuelle — action principale, seule section pleine largeur --- */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Save size={13} color={defaultTokens.colors.textSoft} />
          <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Sauvegarde manuelle
          </div>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
          Créez une copie complète de vos données et conservez-la à l'emplacement de votre choix.
        </p>
        <Button onClick={() => void handleChoisirDossier()} disabled={creationEnCours}>
          <Save size={15} />
          Créer une sauvegarde
        </Button>

        <div style={{ height: 1, background: defaultTokens.colors.borderSoft, margin: "20px 0 18px" }} />

        {/* --- Automatique + Restauration, côte à côte — passent en colonne sur une largeur réduite (flexWrap). --- */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <History size={13} color={defaultTokens.colors.textSoft} />
              <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Sauvegarde automatique
              </div>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: defaultTokens.colors.textSoft, lineHeight: 1.4 }}>
              Une sauvegarde est créée automatiquement toutes les 24 heures après votre connexion.
            </p>
            <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft, marginBottom: 12 }}>
              Dernière sauvegarde : <strong>{derniereDate ?? "aucune pour le moment"}</strong>
            </div>
            {statut && statut.nombreVulnerables > 0 && (
              // Correction "Clé de chiffrement en clair" — signale sans jamais supprimer automatiquement (Partie 6) une ou plusieurs anciennes sauvegardes créées avant cette correction, qui contiennent encore la clé en clair.
              <p style={{ margin: "0 0 12px", fontSize: 11.5, color: defaultTokens.colors.danger, lineHeight: 1.4 }}>
                {statut.nombreVulnerables === 1
                  ? "1 ancienne sauvegarde automatique contient encore une clé non protégée."
                  : `${statut.nombreVulnerables} anciennes sauvegardes automatiques contiennent encore une clé non protégée.`}{" "}
                Nous recommandons de la supprimer manuellement.
              </p>
            )}
            <Button variant="secondary" onClick={() => void handleOuvrirDossierAutomatique()}>
              <FolderOpen size={14} />
              Ouvrir les sauvegardes
            </Button>
          </div>

          {/* Séparateur vertical discret — devient horizontal naturellement quand les colonnes passent l'une sous l'autre (largeur 100% + hauteur 1px via le flexWrap). */}
          <div style={{ width: 1, alignSelf: "stretch", background: defaultTokens.colors.borderSoft }} />

          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <RotateCcw size={13} color={defaultTokens.colors.textSoft} />
              <div style={{ fontSize: 11, fontWeight: 700, color: defaultTokens.colors.textFaint, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Restauration
              </div>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: defaultTokens.colors.textSoft, lineHeight: 1.4 }}>
              Restaurez vos données à partir d'une sauvegarde précédente.
            </p>
            <Button variant="secondary" onClick={() => void handleDemarrerRestauration()}>
              <RotateCcw size={14} />
              Restaurer
            </Button>
          </div>
        </div>
      </Card>

      {etapeRestauration !== "fermee" && (
        <ModalRestauration
          etape={etapeRestauration}
          analyse={analyseRestauration}
          erreur={erreurRestauration}
          onAnnuler={reinitialiserRestauration}
          onContinuerVersConfirmation={(motDePasse) => {
            motDePasseRestaurationRef.current = motDePasse;
            setEtapeRestauration("confirmation");
          }}
          onConfirmerRestauration={() => void handleExecuterRestauration()}
        />
      )}

      {dossierChoisi && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 260 }}>
          <Card elevated style={{ width: "min(420px, 92vw)", boxSizing: "border-box" }}>
            <h2 style={{ margin: "0 0 6px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Créer une sauvegarde protégée</h2>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: defaultTokens.colors.textFaint }}>
              Votre sauvegarde contient une copie complète de vos données. Conservez votre mot de passe dans un endroit sûr : il sera nécessaire pour restaurer
              cette sauvegarde. MAXI-EQUIP ne pourra pas le récupérer si vous l'oubliez.
            </p>

            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password"
              style={inputStyle}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoFocus
              disabled={creationEnCours}
            />
            <label style={{ ...labelStyle, marginTop: 10 }}>Confirmer le mot de passe</label>
            <input
              type="password"
              style={inputStyle}
              value={confirmationMotDePasse}
              onChange={(e) => setConfirmationMotDePasse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleConfirmerSauvegardeManuelle()}
              disabled={creationEnCours}
            />
            {erreurMotDePasse && <p style={{ margin: "8px 0 0", fontSize: 12, color: defaultTokens.colors.danger }}>{erreurMotDePasse}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Button
                variant="secondary"
                onClick={() => {
                  setDossierChoisi(null);
                  setMotDePasse("");
                  setConfirmationMotDePasse("");
                  setErreurMotDePasse(null);
                }}
                disabled={creationEnCours}
                style={{ flex: 1 }}
              >
                Annuler
              </Button>
              <Button onClick={() => void handleConfirmerSauvegardeManuelle()} loading={creationEnCours} style={{ flex: 1 }}>
                Créer la sauvegarde
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

/**
 * Modal de restauration — Phase 3.9, Partie 12. Étapes volontairement
 * réduites (analyse → résumé [+ mot de passe si nécessaire] →
 * confirmation → en cours → erreur), jamais de fenêtre inutile.
 * Ne contient aucune logique de restauration elle-même — uniquement
 * l'affichage des résultats déjà calculés côté Main et la collecte du
 * mot de passe le cas échéant.
 */
function ModalRestauration({
  etape,
  analyse,
  erreur,
  onAnnuler,
  onContinuerVersConfirmation,
  onConfirmerRestauration,
}: {
  etape: "analyse" | "resume" | "confirmation" | "en_cours" | "erreur";
  analyse: Awaited<ReturnType<typeof window.maxiEquip.backupRestoreAnalyser>> | null;
  erreur: string | null;
  onAnnuler: () => void;
  onContinuerVersConfirmation: (motDePasse: string) => void;
  onConfirmerRestauration: () => void;
}) {
  const [motDePasseSaisi, setMotDePasseSaisi] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 270 }}>
      <Card elevated style={{ width: "min(440px, 92vw)", boxSizing: "border-box" }}>
        {etape === "analyse" && (
          <>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Analyse de la sauvegarde…</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: defaultTokens.colors.textSoft }}>Vérification du contenu et de la compatibilité en cours.</p>
          </>
        )}

        {etape === "resume" && analyse && (
          <>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Sauvegarde trouvée</h2>
            <p style={{ margin: "0 0 4px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
              Type : <strong>{analyse.type === "manual" ? "Manuelle" : analyse.type === "automatic" ? "Automatique" : "Sécurité"}</strong>
            </p>
            {analyse.createdAt && (
              <p style={{ margin: "0 0 12px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
                Créée le : <strong>{new Date(analyse.createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}</strong>
              </p>
            )}
            {analyse.compatible === "avertissement" && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: defaultTokens.colors.danger, lineHeight: 1.4 }}>{analyse.message}</p>
            )}
            {analyse.necessiteMotDePasse && (
              <>
                <label style={labelStyle}>Mot de passe de la sauvegarde</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={motDePasseSaisi}
                  onChange={(e) => setMotDePasseSaisi(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onContinuerVersConfirmation(motDePasseSaisi)}
                  autoFocus
                />
              </>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <Button variant="secondary" onClick={onAnnuler} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button
                onClick={() => onContinuerVersConfirmation(motDePasseSaisi)}
                disabled={analyse.necessiteMotDePasse && !motDePasseSaisi}
                style={{ flex: 1 }}
              >
                Continuer
              </Button>
            </div>
          </>
        )}

        {etape === "confirmation" && (
          <>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16, color: defaultTokens.colors.danger }}>
              Confirmer la restauration
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: defaultTokens.colors.textSoft, lineHeight: 1.5 }}>
              Vous êtes sur le point de restaurer les données de MAXI-EQUIP. Les données actuelles seront remplacées par celles de la sauvegarde
              sélectionnée. Une sauvegarde de sécurité de vos données actuelles sera créée avant la restauration. Cette opération nécessitera le
              redémarrage de l'application.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" onClick={onAnnuler} style={{ flex: 1 }}>
                Annuler
              </Button>
              <Button variant="danger" onClick={onConfirmerRestauration} style={{ flex: 1 }}>
                Restaurer
              </Button>
            </div>
          </>
        )}

        {etape === "en_cours" && (
          <>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Restauration en cours…</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
              Sauvegarde de sécurité, puis restauration des données. L'application redémarrera automatiquement une fois terminé.
            </p>
          </>
        )}

        {etape === "erreur" && (
          <>
            <h2 style={{ margin: "0 0 10px", fontFamily: defaultTokens.typography.display, fontSize: 16 }}>Restauration impossible</h2>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>{erreur}</p>
            <p style={{ margin: "0 0 16px", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>Vos données actuelles n'ont pas été modifiées.</p>
            <Button variant="secondary" onClick={onAnnuler} style={{ width: "100%" }}>
              Fermer
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
