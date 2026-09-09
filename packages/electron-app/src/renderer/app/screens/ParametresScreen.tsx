import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Save, Plus, Trash2 } from "lucide-react";
import type { Emplacement } from "@maxi-equip/shared-types";

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
 * Périmètre volontairement limité (correction "Paramètres") : identité
 * et coordonnées de l'entreprise, plus le nom des deux emplacements déjà
 * existants (Akébé, Akanda). Aucune fonctionnalité de phase future
 * (logo, mentions légales, gestion des utilisateurs, site vitrine, etc.)
 * — explicitement exclue de cette correction.
 *
 * Toutes ces valeurs sont lues depuis cette configuration centralisée
 * partout où elles sont utilisées (facture PDF via factureDocumentService
 * ; noms d'emplacement via emplacementRepository, déjà lus directement
 * par Stock/Transferts/Ventes/Historique/Tableau de bord/Documents) —
 * jamais codées en dur à plusieurs endroits.
 */
export function ParametresScreen() {
  const { showSuccess, showError } = useToast();
  const [chargement, setChargement] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nomMagasin, setNomMagasin] = useState("");
  const [adresse, setAdresse] = useState("");
  const [quartier, setQuartier] = useState("");
  const [telephones, setTelephones] = useState<string[]>([""]);

  const [depots, setDepots] = useState<Emplacement[]>([]);
  const [nomsDepots, setNomsDepots] = useState<Record<string, string>>({});

  async function chargerTout() {
    const [identite, emplacements] = await Promise.all([window.maxiEquip.getIdentiteEntreprise(), window.maxiEquip.listEmplacements()]);
    setNomMagasin(identite.nom);
    setAdresse(identite.adresse);
    setQuartier(identite.quartier);
    setTelephones(identite.telephones.length > 0 ? identite.telephones : [""]);

    const seulsDepots = emplacements.filter((e) => !e.estPointDeVente);
    setDepots(seulsDepots);
    setNomsDepots(Object.fromEntries(seulsDepots.map((d) => [d.id, d.nom])));
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

  async function handleEnregistrer() {
    if (!nomMagasin.trim()) {
      showError("Nom du magasin requis", "Le nom du magasin ne peut pas être vide.");
      return;
    }
    setSaving(true);
    try {
      const resultIdentite = await window.maxiEquip.setIdentiteEntreprise({
        nom: nomMagasin,
        adresse,
        quartier,
        telephones: telephones.map((t) => t.trim()).filter((t) => t.length > 0),
      });
      if (!resultIdentite.success) {
        showError("Enregistrement impossible", resultIdentite.message ?? "Une erreur inattendue s'est produite.");
        return;
      }

      for (const depot of depots) {
        const nouveauNom = nomsDepots[depot.id]?.trim();
        if (nouveauNom && nouveauNom !== depot.nom) {
          const resultEmplacement = await window.maxiEquip.renommerEmplacement(depot.id, nouveauNom);
          if (!resultEmplacement.success) {
            showError("Enregistrement partiel", resultEmplacement.message ?? `Impossible de renommer ${depot.nom}.`);
            return;
          }
        }
      }

      await chargerTout();
      showSuccess("Paramètres enregistrés avec succès", "Les nouvelles valeurs sont utilisées immédiatement dans toute l'application.");
    } finally {
      setSaving(false);
    }
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
              <input
                style={inputStyle}
                value={tel}
                onChange={(e) => modifierTelephone(index, e.target.value)}
                disabled={chargement}
                placeholder={`Téléphone ${index + 1}`}
              />
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

        <p style={{ margin: "16px 0 0", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
          Ces informations apparaissent automatiquement sur les factures et documents internes générés.
        </p>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0, marginBottom: 4 }}>Points de vente / Emplacements</h2>
        <p style={{ margin: "0 0 16px", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
          Renommer les emplacements existants — le nouveau nom est utilisé partout dans l'application (stock, ventes, historique, tableau de bord).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {depots.map((depot, index) => (
            <div key={depot.id}>
              <label style={labelStyle}>Emplacement {index + 1}</label>
              <input
                style={inputStyle}
                value={nomsDepots[depot.id] ?? ""}
                onChange={(e) => setNomsDepots((prev) => ({ ...prev, [depot.id]: e.target.value }))}
                disabled={chargement}
              />
            </div>
          ))}
        </div>
      </Card>

      <div style={{ textAlign: "center" }}>
        <Button onClick={() => void handleEnregistrer()} loading={saving} disabled={chargement}>
          <Save size={15} />
          Enregistrer les modifications
        </Button>
      </div>
    </div>
  );
}
