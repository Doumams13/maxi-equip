import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, Trash2, Pencil, CheckCircle2, X } from "lucide-react";
import type { Produit, Emplacement } from "@maxi-equip/shared-types";

interface LigneVenteForm {
  produitId: string;
  quantite: string;
  prixUnitaire: string;
  /** Répartition explicite par dépôt — clé = emplacementId. */
  allocations: Record<string, string>;
  fournisseurExterne: string;
  prixAchatExterne: string;
}

function ligneVide(): LigneVenteForm {
  return { produitId: "", quantite: "1", prixUnitaire: "", allocations: {}, fournisseurExterne: "", prixAchatExterne: "" };
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

interface LigneRecap {
  label: string;
  quantite: number;
  prixUnitaire: number;
}

/**
 * Écran de vérification avant confirmation — reproduit SaleConfirmModal
 * de la maquette originale. Ne montre QUE ce que le client verra
 * (quantité, prix, total) — jamais la répartition interne par dépôt ou
 * l'approvisionnement externe (§10 de la correction : la facture client
 * ne révèle jamais l'organisation interne).
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
              style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontSize: 13, borderTop: i > 0 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none" }}
            >
              <span>{l.label}</span>
              <span style={{ color: defaultTokens.colors.textSoft }}>
                {l.quantite} × {l.prixUnitaire.toLocaleString("fr-FR")} FCFA = {(l.quantite * l.prixUnitaire).toLocaleString("fr-FR")} FCFA
              </span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", fontWeight: 800, fontFamily: defaultTokens.typography.display, background: defaultTokens.colors.surfaceAlt }}>
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

export interface VentesScreenProps {
  session: { userId: string; nom: string };
}

/**
 * Écran de vente — renommé "Vente" dans toute l'interface (correction
 * Phase 2 §4 : une sortie de stock est, du point de vue utilisateur, une
 * VENTE ; le type technique "sortie" reste inchangé en base). Chaque
 * ligne permet désormais une répartition explicite entre Akébé et Akanda
 * (§6/§7), le reliquat non couvert devenant automatiquement la part
 * externe (§8/§9) — AUCUNE règle de stock n'est réimplémentée ici : la
 * vérification par dépôt vient de VenteService, qui appelle lui-même
 * domain.stock.applySortie.
 */
export function VentesScreen({ session }: VentesScreenProps) {
  const { showSuccess, showWarning, showError } = useToast();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [depots, setDepots] = useState<Emplacement[]>([]);
  const [pointDeVenteId, setPointDeVenteId] = useState<string>("");
  const [stockParDepot, setStockParDepot] = useState<Record<string, Record<string, number>>>({}); // { emplacementId: { produitId: quantite } }
  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [vendeurNomManuel, setVendeurNomManuel] = useState("");
  const [lignes, setLignes] = useState<LigneVenteForm[]>([ligneVide()]);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function chargerStocks(depotsListe: Emplacement[]) {
    const entries = await Promise.all(
      depotsListe.map(async (d) => {
        const stock = await window.maxiEquip.getStockByEmplacement(d.id);
        return [d.id, Object.fromEntries(stock.map((s) => [s.produitId, s.quantite]))] as const;
      })
    );
    setStockParDepot(Object.fromEntries(entries));
  }

  useEffect(() => {
    void (async () => {
      const [prods, emps] = await Promise.all([window.maxiEquip.listProduits(), window.maxiEquip.listEmplacements()]);
      setProduits(prods);
      const seulsDepots = emps.filter((e) => !e.estPointDeVente);
      const shop = emps.find((e) => e.estPointDeVente) ?? null;
      setDepots(seulsDepots);
      if (shop) setPointDeVenteId(shop.id);
      await chargerStocks(seulsDepots);
    })();
  }, []);

  function updateLigne(index: number, patch: Partial<LigneVenteForm>) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function handleProduitChange(index: number, produitId: string) {
    const produit = produits.find((p) => p.id === produitId);
    updateLigne(index, { produitId, prixUnitaire: produit ? String(produit.prix) : "", allocations: {} });
  }

  function totalAlloue(ligne: LigneVenteForm): number {
    return depots.reduce((s, d) => s + (Number(ligne.allocations[d.id]) || 0), 0);
  }

  function quantiteExterne(ligne: LigneVenteForm): number {
    return Math.max(0, (Number(ligne.quantite) || 0) - totalAlloue(ligne));
  }

  const total = lignes.reduce((sum, l) => sum + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0);

  function validerTelephone(valeur: string): boolean {
    return /^[0-9+()\s-]{6,}$/.test(valeur.trim());
  }

  async function handleOuvrirVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!pointDeVenteId) {
      showError("Point de vente introuvable", "Aucun emplacement SHOP n'est configuré.");
      return;
    }
    if (!clientNom.trim()) {
      showWarning("Client requis", "Veuillez renseigner le nom du client.");
      return;
    }
    if (!clientTelephone.trim() || !validerTelephone(clientTelephone)) {
      showWarning("Téléphone requis", "Le numéro de téléphone du client est obligatoire et doit être valide.");
      return;
    }
    const lignesValides = lignes.filter((l) => l.produitId && Number(l.quantite) > 0);
    if (lignesValides.length === 0) {
      showWarning("Ligne requise", "Ajoutez au moins un produit à la vente.");
      return;
    }
    for (const l of lignesValides) {
      if (totalAlloue(l) > Number(l.quantite)) {
        showWarning("Répartition invalide", "La répartition entre dépôts dépasse la quantité demandée pour au moins une ligne.");
        return;
      }
    }
    setShowConfirm(true);
  }

  async function handleConfirmerVente() {
    if (!pointDeVenteId) return;
    const lignesValides = lignes.filter((l) => l.produitId && Number(l.quantite) > 0);

    setSaving(true);
    try {
      const result = await window.maxiEquip.enregistrerVente({
        pointDeVenteId,
        clientNom: clientNom.trim(),
        clientTelephone: clientTelephone.trim(),
        clientAdresse: null,
        vendeurUtilisateurId: session.userId,
        vendeurCompteConnecteNom: session.nom,
        vendeurNomManuel: vendeurNomManuel.trim() || null,
        lignes: lignesValides.map((l) => ({
          produitId: l.produitId,
          quantite: Number(l.quantite),
          prixUnitaire: Number(l.prixUnitaire),
          allocationsDepots: depots
            .map((d) => ({ emplacementId: d.id, quantite: Number(l.allocations[d.id]) || 0 }))
            .filter((a) => a.quantite > 0),
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
        await chargerStocks(depots);
      } else {
        showError("Opération impossible", result.reason.message);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[vente] enregistrement impossible :", err);
      showError("Vente impossible", "Une erreur inattendue s'est produite. Veuillez réessayer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, marginTop: 0 }}>Vente</h1>

      <form onSubmit={(e) => void handleOuvrirVerification(e)}>
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client</label>
              <input style={inputStyle} value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="Nom du client" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Téléphone <span style={{ color: defaultTokens.colors.danger }}>*</span>
              </label>
              <input
                style={{ ...inputStyle, borderColor: clientTelephone && !validerTelephone(clientTelephone) ? defaultTokens.colors.danger : defaultTokens.colors.border }}
                value={clientTelephone}
                onChange={(e) => setClientTelephone(e.target.value)}
                placeholder="Ex. 077 12 34 56"
                required
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Vendeur (par défaut : {session.nom})</label>
              <input style={inputStyle} value={vendeurNomManuel} onChange={(e) => setVendeurNomManuel(e.target.value)} placeholder="Préciser si différent" />
            </div>
          </div>
        </Card>

        <Card style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>Produits</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lignes.map((ligne, index) => {
              const externe = quantiteExterne(ligne);
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

                  {ligne.produitId && (
                    <div style={{ marginTop: 10, padding: 10, background: defaultTokens.colors.surfaceAlt, borderRadius: defaultTokens.radius.sm }}>
                      <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: defaultTokens.colors.textSoft }}>
                        Répartition par dépôt (Akébé / Akanda) :
                      </p>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {depots.map((d) => {
                          const disponible = stockParDepot[d.id]?.[ligne.produitId] ?? 0;
                          return (
                            <div key={d.id} style={{ flex: 1, minWidth: 140 }}>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                                {d.nom} <span style={{ color: defaultTokens.colors.textFaint, fontWeight: 400 }}>({disponible} dispo.)</span>
                              </label>
                              <input
                                style={inputStyle}
                                type="number"
                                min={0}
                                value={ligne.allocations[d.id] ?? ""}
                                onChange={(e) => updateLigne(index, { allocations: { ...ligne.allocations, [d.id]: e.target.value } })}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: externe > 0 ? defaultTokens.colors.warning : defaultTokens.colors.textFaint, fontWeight: externe > 0 ? 700 : 400 }}>
                        {externe > 0 ? `Complément externe requis : ${externe}` : "Entièrement couvert par les dépôts."}
                      </p>
                    </div>
                  )}

                  {externe > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, padding: 10, background: defaultTokens.colors.warningSoft, borderRadius: defaultTokens.radius.sm }}>
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
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: defaultTokens.typography.display }}>Total : {total.toLocaleString("fr-FR")} FCFA</div>
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
