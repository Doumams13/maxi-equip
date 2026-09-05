import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, Trash2, Pencil, CheckCircle2, X } from "lucide-react";
import type { Produit, Emplacement } from "@maxi-equip/shared-types";

interface LigneVenteForm {
  produitId: string;
  quantite: string;
  prixUnitaire: string;
  fournisseurExterne: string;
  prixAchatExterne: string;
}

function ligneVide(): LigneVenteForm {
  return { produitId: "", quantite: "1", prixUnitaire: "", fournisseurExterne: "", prixAchatExterne: "" };
}

interface LigneRecap {
  label: string;
  quantite: number;
  prixUnitaire: number;
}

/**
 * Écran de vérification avant confirmation — reproduit SaleConfirmModal de
 * la maquette originale (App.jsx ligne 2015, titre "Vérification de la
 * vente") : explicitement prévu par le cahier des charges Phase 2
 * ("sortie/vente avec écran de vérification"), absent des versions
 * précédentes de cet écran. Deux issues possibles : « Modifier » (retour
 * au formulaire, rien n'est enregistré) ou « Confirmer et générer la
 * facture » (déclenche réellement enregistrerVente).
 */
function SaleConfirmModal({
  clientNom,
  vendeur,
  lignes,
  total,
  onModifier,
  onConfirmer,
  confirming,
}: {
  clientNom: string;
  vendeur: string;
  lignes: LigneRecap[];
  total: number;
  onModifier: () => void;
  onConfirmer: () => void;
  confirming: boolean;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,20,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <Card elevated style={{ width: 560, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: 17 }}>Vérification de la vente</h2>
          <button onClick={onModifier} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label="Fermer">
            <X size={18} color={defaultTokens.colors.textFaint} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, fontSize: 13.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: defaultTokens.colors.textSoft }}>Client</span>
            <span style={{ fontWeight: 700 }}>{clientNom}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: defaultTokens.colors.textSoft }}>Vendeur</span>
            <span style={{ fontWeight: 700 }}>{vendeur}</span>
          </div>
        </div>

        <div style={{ border: `1px solid ${defaultTokens.colors.borderSoft}`, borderRadius: defaultTokens.radius.md, overflow: "hidden", marginBottom: 16 }}>
          {lignes.map((l, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 14px",
                fontSize: 13,
                borderTop: i > 0 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none",
              }}
            >
              <span>{l.label}</span>
              <span style={{ color: defaultTokens.colors.textSoft }}>
                {l.quantite} × {l.prixUnitaire.toLocaleString("fr-FR")} FCFA = {(l.quantite * l.prixUnitaire).toLocaleString("fr-FR")} FCFA
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 14px",
              fontWeight: 800,
              fontFamily: defaultTokens.typography.display,
              background: defaultTokens.colors.surfaceAlt,
            }}
          >
            <span>Total</span>
            <span>{total.toLocaleString("fr-FR")} FCFA</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={onModifier} style={{ flex: 1 }}>
            <Pencil size={15} />
            Modifier
          </Button>
          <Button onClick={onConfirmer} loading={confirming} style={{ flex: 1 }}>
            <CheckCircle2 size={15} />
            Confirmer et générer la facture
          </Button>
        </div>
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: defaultTokens.radius.sm,
  border: `1px solid ${defaultTokens.colors.border}`,
  fontFamily: defaultTokens.typography.body,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

export interface VentesScreenProps {
  session: { userId: string; nom: string };
}

/**
 * Écran de vente — Phase 2 §11. AUCUNE règle de stock ou de facturation
 * n'est réimplémentée ici : la répartition interne/externe, la fusion en
 * une seule ligne, le calcul du total viennent tous du service principal
 * (VenteService), qui appelle lui-même exclusivement packages/domain.
 * Cet écran ne fait qu'assembler la saisie et afficher le résultat.
 */
export function VentesScreen({ session }: VentesScreenProps) {
  const { showSuccess, showWarning, showError } = useToast();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [depots, setDepots] = useState<Emplacement[]>([]);
  const [depotSourceId, setDepotSourceId] = useState<string>("");
  const [stockDepot, setStockDepot] = useState<Record<string, number>>({});
  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [vendeurNomManuel, setVendeurNomManuel] = useState("");
  const [lignes, setLignes] = useState<LigneVenteForm[]>([ligneVide()]);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function chargerStock(id: string) {
    const stock = await window.maxiEquip.getStockByEmplacement(id);
    setStockDepot(Object.fromEntries(stock.map((s) => [s.produitId, s.quantite])));
  }

  useEffect(() => {
    void (async () => {
      const [prods, emps] = await Promise.all([window.maxiEquip.listProduits(), window.maxiEquip.listEmplacements()]);
      setProduits(prods);
      // Décision métier : SHOP n'a pas de stock, uniquement point de vente
      // (§3). Les seuls dépôts réels pour une sortie/vente sont Akébé et
      // Akanda — le vendeur choisit explicitement lequel, même principe
      // que pour une entrée ou un transfert.
      const seulsDepots = emps.filter((e) => !e.estPointDeVente);
      setDepots(seulsDepots);
      const premier = seulsDepots[0];
      if (premier) {
        setDepotSourceId(premier.id);
        await chargerStock(premier.id);
      }
    })();
  }, []);

  useEffect(() => {
    if (depotSourceId) void chargerStock(depotSourceId);
  }, [depotSourceId]);

  function updateLigne(index: number, patch: Partial<LigneVenteForm>) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function handleProduitChange(index: number, produitId: string) {
    const produit = produits.find((p) => p.id === produitId);
    updateLigne(index, { produitId, prixUnitaire: produit ? String(produit.prix) : "" });
  }

  function ligneNeedsExterne(ligne: LigneVenteForm): boolean {
    if (!ligne.produitId || !ligne.quantite) return false;
    const disponible = stockDepot[ligne.produitId] ?? 0;
    return Number(ligne.quantite) > disponible;
  }

  const total = lignes.reduce((sum, l) => sum + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0);

  async function handleOuvrirVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!depotSourceId) {
      showError("Dépôt introuvable", "Aucun dépôt (Akébé/Akanda) n'est configuré.");
      return;
    }
    if (!clientNom.trim()) {
      showWarning("Client requis", "Veuillez renseigner le nom du client.");
      return;
    }
    const lignesValides = lignes.filter((l) => l.produitId && Number(l.quantite) > 0);
    if (lignesValides.length === 0) {
      showWarning("Ligne requise", "Ajoutez au moins un produit à la vente.");
      return;
    }
    setShowConfirm(true);
  }

  async function handleConfirmerVente() {
    if (!depotSourceId) return;
    const lignesValides = lignes.filter((l) => l.produitId && Number(l.quantite) > 0);

    setSaving(true);
    try {
      const result = await window.maxiEquip.enregistrerVente({
        emplacementId: depotSourceId,
        clientNom: clientNom.trim(),
        clientTelephone: clientTelephone.trim() || null,
        clientAdresse: null,
        vendeurUtilisateurId: session.userId,
        vendeurCompteConnecteNom: session.nom,
        vendeurNomManuel: vendeurNomManuel.trim() || null,
        lignes: lignesValides.map((l) => ({
          produitId: l.produitId,
          quantite: Number(l.quantite),
          prixUnitaire: Number(l.prixUnitaire),
          fournisseurExterne: l.fournisseurExterne.trim() || undefined,
          prixAchatExterne: l.prixAchatExterne ? Number(l.prixAchatExterne) : undefined,
        })),
      });

      if (result.success) {
        showSuccess("Vente enregistrée", `Facture ${result.numero} créée avec succès.`);
        setClientNom("");
        setClientTelephone("");
        setVendeurNomManuel("");
        setLignes([ligneVide()]);
        setShowConfirm(false);
        await chargerStock(depotSourceId);
      } else {
        // On garde la modale ouverte : l'utilisateur voit l'erreur et peut
        // revenir modifier sans perdre sa saisie.
        showError("Opération impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ventes] enregistrement impossible :", err);
      showError("Vente impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Sortie de stock</h1>

      <form onSubmit={(e) => void handleOuvrirVerification(e)}>
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client</label>
              <input style={inputStyle} value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="Nom du client" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Téléphone (facultatif)</label>
              <input style={inputStyle} value={clientTelephone} onChange={(e) => setClientTelephone(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Dépôt source</label>
              <select style={inputStyle} value={depotSourceId} onChange={(e) => setDepotSourceId(e.target.value)}>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Vendeur (par défaut : {session.nom})
              </label>
              <input style={inputStyle} value={vendeurNomManuel} onChange={(e) => setVendeurNomManuel(e.target.value)} placeholder="Préciser si différent" />
            </div>
          </div>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Produits</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lignes.map((ligne, index) => {
              const needsExterne = ligneNeedsExterne(ligne);
              const disponible = stockDepot[ligne.produitId] ?? 0;
              return (
                <div key={index} style={{ border: `1px solid ${defaultTokens.colors.borderSoft}`, borderRadius: defaultTokens.radius.md, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Produit</label>
                      <select style={inputStyle} value={ligne.produitId} onChange={(e) => handleProduitChange(index, e.target.value)}>
                        <option value="">Sélectionner…</option>
                        {produits.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.motif} — {p.taille}
                          </option>
                        ))}
                      </select>
                      {ligne.produitId && (
                        <p style={{ fontSize: 11, color: defaultTokens.colors.textFaint, margin: "4px 0 0" }}>
                          Stock disponible : {disponible}
                        </p>
                      )}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Quantité</label>
                      <input style={inputStyle} type="number" value={ligne.quantite} onChange={(e) => updateLigne(index, { quantite: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Prix unitaire</label>
                      <input style={inputStyle} type="number" value={ligne.prixUnitaire} onChange={(e) => updateLigne(index, { prixUnitaire: e.target.value })} />
                    </div>
                    <Button type="button" variant="ghost" onClick={() => setLignes((prev) => prev.filter((_, i) => i !== index))}>
                      <Trash2 size={15} />
                    </Button>
                  </div>

                  {needsExterne && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, padding: 10, background: defaultTokens.colors.warningSoft, borderRadius: defaultTokens.radius.sm }}>
                      <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 11.5, color: defaultTokens.colors.warning, fontWeight: 700 }}>
                        Stock insuffisant ({disponible} disponible pour {ligne.quantite} demandé) — approvisionnement externe requis pour compléter :
                      </p>
                      <div>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Fournisseur</label>
                        <input style={inputStyle} value={ligne.fournisseurExterne} onChange={(e) => updateLigne(index, { fournisseurExterne: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>Coût d'achat unitaire</label>
                        <input style={inputStyle} type="number" value={ligne.prixAchatExterne} onChange={(e) => updateLigne(index, { prixAchatExterne: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button type="button" variant="secondary" onClick={() => setLignes((prev) => [...prev, ligneVide()])} style={{ marginTop: 12 }}>
            <Plus size={15} />
            Ajouter un produit
          </Button>
        </Card>

        <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: defaultTokens.typography.display }}>
            Total : {total.toLocaleString("fr-FR")} FCFA
          </div>
          <Button type="submit">Vérifier la vente</Button>
        </Card>
      </form>

      {showConfirm && (
        <SaleConfirmModal
          clientNom={clientNom.trim()}
          vendeur={vendeurNomManuel.trim() || session.nom}
          lignes={lignes
            .filter((l) => l.produitId && Number(l.quantite) > 0)
            .map((l) => ({
              label: produits.find((p) => p.id === l.produitId)?.reference ?? "",
              quantite: Number(l.quantite),
              prixUnitaire: Number(l.prixUnitaire) || 0,
            }))}
          total={total}
          onModifier={() => setShowConfirm(false)}
          onConfirmer={() => void handleConfirmerVente()}
          confirming={saving}
        />
      )}
    </div>
  );
}
