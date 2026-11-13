import { useEffect, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, Trash2, X, ShoppingCart, Ban } from "lucide-react";
import type { Produit } from "@maxi-equip/shared-types";
import { ProduitSelector } from "../components/ProduitSelector.js";

interface LigneDevisIpc {
  produitId: string | null;
  motif: string;
  reference: string | null;
  taille: string;
  quantite: number;
  prixUnitaire: number;
}
interface DevisIpc {
  id: string;
  numero: string;
  date: string;
  clientNom: string;
  clientTelephone: string | null;
  clientAdresse: string | null;
  modeReglement: string | null;
  total: number;
  remise: number;
  statut: "brouillon" | "convertie" | "annulee";
  factureId: string | null;
  utilisateurId: string | null;
  lignes: LigneDevisIpc[];
  createdAt: string;
  updatedAt: string;
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
const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 };

interface LigneForm {
  produitId: string;
  quantite: string;
  prixUnitaire: string;
}
function ligneVide(): LigneForm {
  return { produitId: "", quantite: "1", prixUnitaire: "" };
}

function StatutBadge({ statut }: { statut: DevisIpc["statut"] }) {
  const map = {
    brouillon: { bg: defaultTokens.colors.accentSoft, fg: defaultTokens.colors.accent, label: "Brouillon" },
    convertie: { bg: defaultTokens.colors.successSoft, fg: defaultTokens.colors.success, label: "Converti en vente" },
    annulee: { bg: defaultTokens.colors.surfaceAlt, fg: defaultTokens.colors.textFaint, label: "Annulé" },
  } as const;
  const c = map[statut];
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: defaultTokens.radius.pill, padding: "3px 10px", fontSize: 11.5, fontWeight: 700 }}>
      {c.label}
    </span>
  );
}

/**
 * Devis pro-forma (correction "ajouter les devis pro-forma", 2026-11-13)
 * — brouillon local, sans impact stock (décision de portée, voir
 * devisRepository.ts). "Convertir en vente" redirige vers l'écran Vente
 * préremplie (même mécanisme déjà utilisé pour une demande du site) :
 * c'est CET écran-là, via le circuit normal, qui applique réellement le
 * stock/la numérotation — jamais une seconde logique ici.
 */
export function DevisScreen({ onConvertirEnVente }: { onConvertirEnVente: (devisId: string) => void }) {
  const { showSuccess, showError } = useToast();
  const [devis, setDevis] = useState<DevisIpc[] | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [clientAdresse, setClientAdresse] = useState("");
  const [modeReglement, setModeReglement] = useState("Espèces");
  const [remise, setRemise] = useState("0");
  const [lignes, setLignes] = useState<LigneForm[]>([ligneVide()]);

  async function recharger() {
    setDevis(await window.maxiEquip.devisLister());
  }

  useEffect(() => {
    void recharger();
    void window.maxiEquip.listProduits().then(setProduits);
  }, []);

  function reinitialiserFormulaire() {
    setClientNom("");
    setClientTelephone("");
    setClientAdresse("");
    setModeReglement("Espèces");
    setRemise("0");
    setLignes([ligneVide()]);
  }

  function handleProduitChange(index: number, produitId: string) {
    const produit = produits.find((p) => p.id === produitId);
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, produitId, prixUnitaire: produit ? String(produit.prix) : l.prixUnitaire } : l)));
  }

  function majLigne(index: number, champ: "quantite" | "prixUnitaire", valeur: string) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  const totalCalcule = lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0), 0);
  const totalNet = Math.max(totalCalcule - (Number(remise) || 0), 0);

  async function handleCreer() {
    const lignesValides = lignes.filter((l) => l.produitId && Number(l.quantite) > 0);
    if (!clientNom.trim()) {
      showError("Client requis", "Le nom du client est obligatoire.");
      return;
    }
    if (lignesValides.length === 0) {
      showError("Aucun article", "Ajoutez au moins un article valide.");
      return;
    }
    setEnCours(true);
    try {
      const lignesPayload: LigneDevisIpc[] = lignesValides.map((l) => {
        const produit = produits.find((p) => p.id === l.produitId)!;
        return {
          produitId: produit.id,
          motif: produit.motif,
          reference: produit.reference,
          taille: produit.taille,
          quantite: Number(l.quantite),
          prixUnitaire: Number(l.prixUnitaire) || 0,
        };
      });
      await window.maxiEquip.devisCreer({
        clientNom: clientNom.trim(),
        clientTelephone: clientTelephone.trim() || null,
        clientAdresse: clientAdresse.trim() || null,
        modeReglement,
        total: totalCalcule,
        remise: Number(remise) || 0,
        lignes: lignesPayload,
      });
      showSuccess("Devis créé", "Le devis pro-forma a été enregistré.");
      reinitialiserFormulaire();
      setFormulaireOuvert(false);
      await recharger();
    } catch (err) {
      showError("Création impossible", err instanceof Error ? err.message : "Une erreur inattendue s'est produite.");
    } finally {
      setEnCours(false);
    }
  }

  async function handleAnnuler(id: string) {
    try {
      await window.maxiEquip.devisAnnuler(id);
      showSuccess("Devis annulé", "Le devis a été marqué comme annulé.");
      await recharger();
    } catch (err) {
      showError("Annulation impossible", err instanceof Error ? err.message : "Une erreur inattendue s'est produite.");
    }
  }

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: defaultTokens.typography.display, fontSize: 22, color: defaultTokens.colors.text, margin: 0 }}>Devis pro-forma</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft }}>
            {devis ? `${devis.length} devis` : "…"} — un devis n'a aucun impact sur le stock tant qu'il n'est pas converti en vente.
          </p>
        </div>
        <Button onClick={() => setFormulaireOuvert((v) => !v)}>
          {formulaireOuvert ? <X size={15} /> : <Plus size={15} />}
          {formulaireOuvert ? "Fermer" : "Nouveau devis"}
        </Button>
      </div>

      {formulaireOuvert && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Client *</label>
              <input style={inputStyle} value={clientNom} onChange={(e) => setClientNom(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Téléphone</label>
              <input style={inputStyle} value={clientTelephone} onChange={(e) => setClientTelephone(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Adresse</label>
              <input style={inputStyle} value={clientAdresse} onChange={(e) => setClientAdresse(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Mode de règlement prévu</label>
              <input style={inputStyle} value={modeReglement} onChange={(e) => setModeReglement(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            {lignes.map((ligne, index) => (
              <div key={index} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
                <div style={{ flex: 2 }}>
                  {index === 0 && <label style={labelStyle}>Article</label>}
                  <ProduitSelector produits={produits} value={ligne.produitId} onChange={(id) => handleProduitChange(index, id)} />
                </div>
                <div style={{ width: 90 }}>
                  {index === 0 && <label style={labelStyle}>Quantité</label>}
                  <input style={inputStyle} type="number" min={1} value={ligne.quantite} onChange={(e) => majLigne(index, "quantite", e.target.value)} />
                </div>
                <div style={{ width: 140 }}>
                  {index === 0 && <label style={labelStyle}>Prix indicatif (ct.)</label>}
                  <input style={inputStyle} type="number" min={0} value={ligne.prixUnitaire} onChange={(e) => majLigne(index, "prixUnitaire", e.target.value)} />
                </div>
                <Button variant="ghost" onClick={() => setLignes((prev) => prev.filter((_, i) => i !== index))} disabled={lignes.length === 1}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setLignes((prev) => [...prev, ligneVide()])}>
              <Plus size={14} />
              Ajouter un article
            </Button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, alignItems: "flex-end", borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, paddingTop: 12 }}>
            <div>
              <label style={labelStyle}>Remise (FCFA)</label>
              <input style={{ ...inputStyle, width: 140 }} type="number" min={0} value={remise} onChange={(e) => setRemise(e.target.value)} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>Total indicatif</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: defaultTokens.colors.text }}>{totalNet.toLocaleString("fr-FR")} FCFA</div>
            </div>
            <Button loading={enCours} onClick={() => void handleCreer()}>
              Enregistrer le devis
            </Button>
          </div>
        </Card>
      )}

      <Card padding={0}>
        {devis === null ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Chargement…</p>
        ) : devis.length === 0 ? (
          <p style={{ padding: 24, color: defaultTokens.colors.textSoft, margin: 0 }}>Aucun devis pour l'instant.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: defaultTokens.colors.surfaceAlt, textAlign: "left" }}>
                  {["Numéro", "Date", "Client", "Articles", "Total net", "Statut", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", fontWeight: 700, color: defaultTokens.colors.textSoft, fontSize: 11.5 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devis.map((d) => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${defaultTokens.colors.borderSoft}` }}>
                    <td style={{ padding: "10px 16px", fontFamily: defaultTokens.typography.mono, fontWeight: 700 }}>{d.numero}</td>
                    <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>{new Date(d.date).toLocaleDateString("fr-FR")}</td>
                    <td style={{ padding: "10px 16px" }}>{d.clientNom}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}>{d.lignes.length}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 700 }}>{Math.max(d.total - d.remise, 0).toLocaleString("fr-FR")} FCFA</td>
                    <td style={{ padding: "10px 16px" }}>
                      <StatutBadge statut={d.statut} />
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {d.statut === "brouillon" && (
                        <>
                          <Button variant="ghost" onClick={() => onConvertirEnVente(d.id)} title="Convertir en vente">
                            <ShoppingCart size={15} />
                          </Button>
                          <Button variant="ghost" onClick={() => void handleAnnuler(d.id)} title="Annuler ce devis">
                            <Ban size={15} />
                          </Button>
                        </>
                      )}
                    </td>
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
