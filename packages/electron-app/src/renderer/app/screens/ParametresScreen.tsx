import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Save } from "lucide-react";

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Écran Paramètres — Administrateur uniquement (canEditCompanySettings).
 * Correction "SHOP sur la facture" : le nom du magasin affiché sur les
 * documents (facture PDF, etc.) vient désormais de cette configuration
 * centralisée, jamais codé en dur ni confondu avec le nom interne de
 * l'emplacement point-de-vente. Toute nouvelle facture générée après un
 * changement ici reflète automatiquement la nouvelle valeur.
 */
export function ParametresScreen() {
  const { showSuccess, showError } = useToast();
  const [nomMagasin, setNomMagasin] = useState("");
  const [valeurEnregistree, setValeurEnregistree] = useState("");
  const [saving, setSaving] = useState(false);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    void (async () => {
      const nom = await window.maxiEquip.getNomMagasin();
      setNomMagasin(nom);
      setValeurEnregistree(nom);
      setChargement(false);
    })();
  }, []);

  async function handleEnregistrer() {
    setSaving(true);
    try {
      const result = await window.maxiEquip.setNomMagasin(nomMagasin);
      if (result.success) {
        setValeurEnregistree(nomMagasin);
        showSuccess("Configuration enregistrée", "Les nouvelles factures afficheront désormais ce nom.");
      } else {
        showError("Enregistrement impossible", result.message ?? "Une erreur inattendue s'est produite.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Paramètres</h1>
      <p style={{ marginTop: -6, marginBottom: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>Configuration centralisée de l'entreprise</p>

      <Card style={{ maxWidth: 480 }}>
        <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Identité commerciale</h2>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Nom du magasin (affiché sur les factures)</label>
        <input style={inputStyle} value={nomMagasin} onChange={(e) => setNomMagasin(e.target.value)} disabled={chargement} placeholder="Ex. MAXI-EQUIP" />
        <p style={{ margin: "8px 0 16px", fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
          Ce nom apparaît dans la section « Détails de vente » de chaque nouvelle facture générée — distinct du nom technique de l'emplacement point de vente.
        </p>
        <Button onClick={() => void handleEnregistrer()} loading={saving} disabled={chargement || nomMagasin.trim() === valeurEnregistree.trim() || !nomMagasin.trim()}>
          <Save size={15} />
          Enregistrer
        </Button>
      </Card>
    </div>
  );
}
