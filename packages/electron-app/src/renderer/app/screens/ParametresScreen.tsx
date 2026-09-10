import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Save, Plus, Trash2, Pencil, Archive, RotateCcw, Check, X } from "lucide-react";
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
