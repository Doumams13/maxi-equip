import { useEffect, useState } from "react";
import { Card, defaultTokens } from "@maxi-equip/design-system";
import { User } from "lucide-react";
import type { Facture } from "@maxi-equip/shared-types";
import { useSurbrillanceOperation } from "../highlight.js";

type FactureAvecVendeur = Facture & { vendeurNom: string | null; vendeurRole: string | null };

/**
 * Écran facturation — Phase 2 §12, complété par la Consolidation
 * Administrateur/Gérant §11 : l'identité du vendeur n'est affichée que si
 * le serveur l'a transmise (Administrateur, ou la propre vente du Gérant
 * connecté — anonymisation déjà décidée côté Main, jamais ici). Aucune
 * donnée fournisseur/coût d'achat n'y figure jamais (garanti par le
 * domaine). Prise en charge de la navigation cliquable depuis
 * l'Historique/le Dashboard (§16-§21) : défilement + mise en évidence
 * temporaire de la facture ciblée.
 */
export function FacturesScreen({
  session,
  cibleSurbrillance,
  onSurbrillanceAppliquee,
}: {
  session: { userId: string; role: string };
  cibleSurbrillance: string | null;
  onSurbrillanceAppliquee: () => void;
}) {
  const [factures, setFactures] = useState<FactureAvecVendeur[]>([]);
  const { conteneurRef, styleSurbrillance } = useSurbrillanceOperation(cibleSurbrillance, onSurbrillanceAppliquee);

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
        <div ref={conteneurRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {factures.map((f) => {
            const estSaPropreVente = f.vendeurUtilisateurId === session.userId;
            // Anonymisation déjà décidée côté Main (§4/§11/§23) : si
            // vendeurNom est absent, c'est un choix serveur délibéré,
            // jamais une décision prise ici.
            const vendeurAffiche = estSaPropreVente ? "Vous" : f.vendeurNom ? `${f.vendeurNom} (${f.vendeurRole})` : null;
            return (
              <Card key={f.id} data-operation-id={f.id} style={styleSurbrillance(f.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontFamily: defaultTokens.typography.display }}>{f.numero}</div>
                    <div style={{ fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
                      {f.clientNom} · {new Date(f.date).toLocaleString("fr-FR")}
                    </div>
                    {vendeurAffiche && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, fontSize: 11.5, color: defaultTokens.colors.textFaint }}>
                        <User size={11} />
                        Vendeur : {vendeurAffiche}
                      </div>
                    )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
