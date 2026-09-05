import { useEffect, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import type { Facture } from "@maxi-equip/shared-types";

/**
 * Écran facturation — Phase 2 §12. Liste en lecture seule des factures
 * déjà créées via l'écran de vente. N'affiche que ce que le type Facture
 * contient structurellement — aucune donnée fournisseur/coût d'achat n'y
 * figure jamais (Corrections §7/§11, garanti par le domaine).
 */
export function FacturesScreen() {
  const [factures, setFactures] = useState<Facture[]>([]);

  useEffect(() => {
    void window.maxiEquip.listFactures().then(setFactures);
  }, []);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Factures</h1>

      {factures.length === 0 ? (
        <Card>
          <p style={{ color: defaultTokens.colors.textSoft, margin: 0 }}>Aucune facture émise pour l'instant.</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {factures.map((f) => (
            <Card key={f.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontFamily: defaultTokens.typography.display }}>{f.numero}</div>
                  <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
                    {f.clientNom} · {new Date(f.date).toLocaleString("fr-FR")}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: defaultTokens.colors.accent }}>{f.total.toLocaleString("fr-FR")} FCFA</div>
              </div>
              <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                <tbody>
                  {f.lignes.map((l, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                      <td style={{ padding: "6px 4px" }}>
                        {l.motif} — {l.taille}
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        {l.quantite} × {l.prixUnitaire.toLocaleString("fr-FR")} FCFA
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
