import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { FileDown, ArrowLeft } from "lucide-react";

interface LigneAlerteStock {
  id: string;
  modeleId: string | null;
  motif: string;
  type: string;
  taille: string;
  reference: string;
  stock: number;
  seuilAlerte: number;
  derniereVente: string | null;
  derniereEntree: string | null;
  derniereSortie: string | null;
}

function formaterDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

/**
 * Écran "Alertes de stock" (correction TB, 2026-11-13) — atteint en
 * cliquant la section "Alertes de stock" du Tableau de bord. Même liste
 * que `ListeAlertesStock` sur le Dashboard, mais ici en tableau complet
 * (plutôt qu'une zone à défilement limitée) et exportable en CSV.
 */
export function AlertesStockScreen({ onRetour }: { onRetour?: () => void }) {
  const { showError, showSuccess } = useToast();
  const [lignes, setLignes] = useState<LigneAlerteStock[] | null>(null);
  const [chargement, setChargement] = useState(true);
  const [exportEnCours, setExportEnCours] = useState(false);

  useEffect(() => {
    void charger();
  }, []);

  async function charger() {
    setChargement(true);
    try {
      const resultat = await window.maxiEquip.listAlertesStock();
      setLignes(resultat);
    } finally {
      setChargement(false);
    }
  }

  async function exporter() {
    if (!lignes) return;
    setExportEnCours(true);
    try {
      const resultat = await window.maxiEquip.exporterAlertesStockCsv(lignes);
      if (resultat.canceled) return;
      if (!resultat.success) {
        showError("Export impossible", resultat.message ?? "Une erreur inattendue s'est produite.");
        return;
      }
      showSuccess("Export réussi", `Fichier enregistré : ${resultat.chemin}`);
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      {onRetour && (
        <Button variant="ghost" onClick={onRetour} style={{ marginBottom: 10, paddingLeft: 0 }}>
          <ArrowLeft size={14} />
          Retour au tableau de bord
        </Button>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0, marginBottom: 2 }}>
            Alertes de stock
          </h1>
          <p style={{ margin: 0, color: defaultTokens.colors.textSoft, fontSize: 13.5 }}>
            Produits dont le stock cumulé (Akébé + Akanda) est sous leur seuil d'alerte.
          </p>
        </div>
        {lignes && lignes.length > 0 && (
          <Button variant="secondary" loading={exportEnCours} onClick={() => void exporter()}>
            <FileDown size={14} />
            Exporter en CSV
          </Button>
        )}
      </div>

      <Card padding={0}>
        {chargement ? (
          <p style={{ padding: 20, color: defaultTokens.colors.textSoft, fontSize: 13.5, margin: 0 }}>Chargement…</p>
        ) : !lignes || lignes.length === 0 ? (
          <p style={{ padding: 20, color: defaultTokens.colors.success, fontSize: 13.5, margin: 0 }}>Tout est en ordre — aucun produit en alerte.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                  {["Référence", "Taille", "Type", "Stock", "Seuil", "Dernière vente", "Dernière entrée", "Dernière sortie"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 12, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                    <td style={{ padding: "10px 16px", fontWeight: 700 }}>{l.reference}</td>
                    <td style={{ padding: "10px 16px" }}>{l.taille}</td>
                    <td style={{ padding: "10px 16px", color: defaultTokens.colors.textFaint }}>{l.type}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, color: l.stock <= 0 ? defaultTokens.colors.danger : defaultTokens.colors.warning }}>
                      {l.stock} ct.
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", color: defaultTokens.colors.textFaint }}>{l.seuilAlerte}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{formaterDate(l.derniereVente)}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{formaterDate(l.derniereEntree)}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{formaterDate(l.derniereSortie)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
