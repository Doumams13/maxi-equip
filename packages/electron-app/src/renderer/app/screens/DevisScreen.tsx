import { useEffect, useMemo, useState } from "react";
import { Card, Button, useToast, defaultTokens } from "@maxi-equip/design-system";
import { Plus, Trash2, X, ShoppingCart, Ban, Eye, Download, Pencil, Copy } from "lucide-react";
import type { Produit } from "@maxi-equip/shared-types";
import { uniteVenteEffective, LIBELLE_UNITE_VENTE } from "@maxi-equip/shared-types";
import { pricing as domainPricing, devis as domainDevis } from "@maxi-equip/domain";
import { ProduitSelector } from "../components/ProduitSelector.js";
import { PdfPreviewModal } from "../components/PdfPreviewModal.js";

interface LigneDevisIpc {
  produitId: string | null;
  motif: string;
  reference: string | null;
  taille: string;
  quantite: number;
  prixUnitaire: number;
  espace?: string | null;
  surfaceM2?: number | null;
  remisePourcent?: number;
  uniteVente?: string | null;
  surfaceCartonM2?: number | null;
}
interface DevisIpc {
  id: string;
  numero: string;
  date: string;
  clientNom: string;
  clientTelephone: string | null;
  clientAdresse: string | null;
  modeReglement: string | null;
  objet: string | null;
  notes: string | null;
  total: number;
  remise: number;
  remiseGlobale: number;
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
const labelStyle: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 600, marginBottom: 4 };

/**
 * Devis proforma (point 6, 2026-11-24) — une ligne se saisit comme une
 * ligne de vente (surface souhaitée → cartons arrondis au supérieur,
 * prix au carton ↔ prix au m²), avec en plus un libellé "Espace /
 * application" et une remise en % propre à la ligne (modèle de proforma
 * fourni : 5 % / 10 % selon le format, 0 sur le ciment).
 */
interface LigneForm {
  espace: string;
  produitId: string;
  surfaceSouhaitee: string;
  quantite: string;
  prixUnitaire: string;
  remisePourcent: string;
}
function ligneVide(): LigneForm {
  return { espace: "", produitId: "", surfaceSouhaitee: "", quantite: "1", prixUnitaire: "", remisePourcent: "0" };
}

/** Même règle que VentesScreen : surface d'un carton connue seulement si largeur, hauteur et carreaux/carton le sont. */
function surfaceCartonProduit(p: Produit | undefined): number | null {
  if (!p || !p.carreauxParCarton || !p.largeur || !p.hauteur) return null;
  return domainPricing.calculerSurfaceCartonM2(p.carreauxParCarton, p.largeur, p.hauteur);
}

function montant(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

function StatutBadge({ statut }: { statut: DevisIpc["statut"] }) {
  const config = {
    brouillon: { bg: defaultTokens.colors.accentSoft, fg: defaultTokens.colors.accent, label: "Brouillon" },
    convertie: { bg: defaultTokens.colors.successSoft, fg: defaultTokens.colors.success, label: "Converti en vente" },
    annulee: { bg: defaultTokens.colors.surfaceAlt, fg: defaultTokens.colors.textFaint, label: "Annulé" },
  } as const;
  const c = config[statut];
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
 *
 * Étendu le 2026-11-24 (point 6) : saisie ligne par ligne comme une vente,
 * remises par ligne, objet, notes, remise supplémentaire, modification
 * d'un devis en cours, PDF "FACTURE PROFORMA" (voir/télécharger/imprimer).
 */
export function DevisScreen({ onConvertirEnVente }: { onConvertirEnVente: (devisId: string) => void }) {
  const { showSuccess, showError } = useToast();
  const [devis, setDevis] = useState<DevisIpc[] | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [devisEnModificationId, setDevisEnModificationId] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ chemin: string; nomSuggere: string; titre: string } | null>(null);

  const [clientNom, setClientNom] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [clientAdresse, setClientAdresse] = useState("");
  const [modeReglement, setModeReglement] = useState("Espèces");
  const [objet, setObjet] = useState("");
  const [notes, setNotes] = useState("");
  const [remiseGlobale, setRemiseGlobale] = useState("0");
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
    setObjet("");
    setNotes("");
    setRemiseGlobale("0");
    setLignes([ligneVide()]);
    setDevisEnModificationId(null);
  }

  function ouvrirModification(d: DevisIpc) {
    setClientNom(d.clientNom);
    setClientTelephone(d.clientTelephone ?? "");
    setClientAdresse(d.clientAdresse ?? "");
    setModeReglement(d.modeReglement ?? "");
    setObjet(d.objet ?? "");
    setNotes(d.notes ?? "");
    setRemiseGlobale(String(d.remiseGlobale ?? 0));
    setLignes(
      d.lignes.length > 0
        ? d.lignes.map((l) => ({
            espace: l.espace ?? "",
            produitId: l.produitId ?? "",
            surfaceSouhaitee: l.surfaceM2 ? String(l.surfaceM2) : "",
            quantite: String(l.quantite),
            prixUnitaire: String(l.prixUnitaire),
            remisePourcent: String(l.remisePourcent ?? 0),
          }))
        : [ligneVide()]
    );
    setDevisEnModificationId(d.id);
    setFormulaireOuvert(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function majLigne(index: number, patch: Partial<LigneForm>) {
    setLignes((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function handleProduitChange(index: number, produitId: string) {
    const produit = produits.find((p) => p.id === produitId);
    const surface = surfaceCartonProduit(produit);
    const ligne = lignes[index]!;
    // Prix de référence d'un carreau = prix au m² → prix du carton ; sinon prix unitaire tel quel.
    const prixUnitaire = produit ? (surface !== null ? domainPricing.calculerPrixCartonDepuisPrixM2(produit.prix, surface) : produit.prix) : 0;
    const m2 = Number(ligne.surfaceSouhaitee) || 0;
    majLigne(index, {
      produitId,
      prixUnitaire: produit ? String(prixUnitaire) : ligne.prixUnitaire,
      quantite: surface !== null && m2 > 0 ? String(Math.ceil(m2 / surface)) : ligne.quantite,
      surfaceSouhaitee: surface !== null ? ligne.surfaceSouhaitee : "",
    });
  }

  const lignesCalculables = lignes.map((l) => ({
    quantite: Math.max(0, Math.trunc(Number(l.quantite) || 0)),
    prixUnitaire: Math.max(0, Number(l.prixUnitaire) || 0),
    remisePourcent: Number(l.remisePourcent) || 0,
  }));
  const totaux = domainDevis.calculerTotauxDevis(lignesCalculables, Number(remiseGlobale) || 0);

  const recapParFormat = useMemo(() => {
    const groupes = new Map<string, { libelle: string; quantite: number; unite: string; net: number }>();
    lignes.forEach((l, i) => {
      const produit = produits.find((p) => p.id === l.produitId);
      if (!produit) return;
      const unite = uniteVenteEffective(produit);
      const cle = `${produit.taille}|${unite}`;
      const g = groupes.get(cle) ?? { libelle: produit.taille, quantite: 0, unite: LIBELLE_UNITE_VENTE[unite].pluriel, net: 0 };
      g.quantite += lignesCalculables[i]!.quantite;
      g.net += domainDevis.calculerLigneDevis(lignesCalculables[i]!).net;
      groupes.set(cle, g);
    });
    return [...groupes.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes, produits]);

  async function handleEnregistrer() {
    const lignesValides = lignes.filter((l) => l.produitId && Math.trunc(Number(l.quantite)) > 0);
    if (lignesValides.length === 0) {
      showError("Aucun article", "Ajoutez au moins un article avec une quantité.");
      return;
    }
    if (lignes.some((l) => l.produitId && !(Math.trunc(Number(l.quantite)) > 0))) {
      showError("Quantité manquante", "Chaque article choisi doit avoir une quantité d'au moins 1.");
      return;
    }
    setEnCours(true);
    try {
      const lignesPayload: LigneDevisIpc[] = lignesValides.map((l) => {
        const produit = produits.find((p) => p.id === l.produitId)!;
        const surfaceCarton = surfaceCartonProduit(produit);
        return {
          produitId: produit.id,
          motif: produit.motif,
          reference: produit.reference,
          taille: produit.taille,
          quantite: Math.trunc(Number(l.quantite)),
          prixUnitaire: Math.max(0, Math.round(Number(l.prixUnitaire) || 0)),
          espace: l.espace.trim() || null,
          surfaceM2: Number(l.surfaceSouhaitee) > 0 ? Number(l.surfaceSouhaitee) : null,
          remisePourcent: Math.min(100, Math.max(0, Number(l.remisePourcent) || 0)),
          uniteVente: uniteVenteEffective(produit),
          surfaceCartonM2: surfaceCarton,
        };
      });
      const payload = {
        clientNom: clientNom.trim(),
        clientTelephone: clientTelephone.trim() || null,
        clientAdresse: clientAdresse.trim() || null,
        modeReglement: modeReglement.trim() || null,
        objet: objet.trim() || null,
        notes: notes.trim() || null,
        remiseGlobale: Math.max(0, Math.round(Number(remiseGlobale) || 0)),
        lignes: lignesPayload,
      };
      if (devisEnModificationId) {
        await window.maxiEquip.devisModifier(devisEnModificationId, payload);
        showSuccess("Devis modifié", "Les modifications du devis ont été enregistrées.");
      } else {
        await window.maxiEquip.devisCreer(payload);
        showSuccess("Devis créé", "Le devis proforma a été enregistré.");
      }
      reinitialiserFormulaire();
      setFormulaireOuvert(false);
      await recharger();
    } catch (err) {
      showError("Enregistrement impossible", err instanceof Error ? err.message : "Une erreur inattendue s'est produite.");
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

  async function genererPdf(d: DevisIpc) {
    setActionEnCours(d.id);
    try {
      const genere = await window.maxiEquip.devisGenererPdf(d.id);
      if (!genere.success || !genere.chemin) {
        showError("Document indisponible", genere.message ?? "Impossible de générer le devis proforma.");
        return null;
      }
      return { chemin: genere.chemin, nomSuggere: genere.nomSuggere ?? `Proforma-${d.numero}.pdf` };
    } finally {
      setActionEnCours(null);
    }
  }

  async function handleVoir(d: DevisIpc) {
    const pdf = await genererPdf(d);
    if (pdf) setApercu({ ...pdf, titre: `Facture proforma ${d.numero}` });
  }

  async function handleTelecharger(d: DevisIpc) {
    const pdf = await genererPdf(d);
    if (!pdf) return;
    const result = await window.maxiEquip.telechargerDocument(pdf.chemin, pdf.nomSuggere);
    if (result.success) showSuccess("Devis enregistré", `Enregistré sous ${result.chemin}`);
    else if (!result.canceled) showError("Enregistrement impossible", result.message ?? "Une erreur inattendue s'est produite.");
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
        <Button
          onClick={() => {
            if (formulaireOuvert) reinitialiserFormulaire();
            setFormulaireOuvert((v) => !v);
          }}
        >
          {formulaireOuvert ? <X size={15} /> : <Plus size={15} />}
          {formulaireOuvert ? "Fermer" : "Nouveau devis"}
        </Button>
      </div>

      {formulaireOuvert && (
        <Card style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: defaultTokens.typography.display, fontSize: 15, marginTop: 0 }}>
            {devisEnModificationId ? `Modifier le devis ${devis?.find((d) => d.id === devisEnModificationId)?.numero ?? ""}` : "Nouveau devis"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Client</label>
              <input style={inputStyle} value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="À renseigner" />
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
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Objet</label>
            <input style={inputStyle} value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. Fourniture de carrelage sols, murs et décors" />
          </div>

          <h3 style={{ fontSize: 13.5, margin: "0 0 8px" }}>Détail des espaces et fournitures</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
            {lignes.map((ligne, index) => {
              const produit = produits.find((p) => p.id === ligne.produitId);
              const surfaceCarton = surfaceCartonProduit(produit);
              const unite = produit ? uniteVenteEffective(produit) : "carton";
              const estCarton = unite === "carton";
              const calc = domainDevis.calculerLigneDevis(lignesCalculables[index]!);
              const prixM2 = surfaceCarton !== null && ligne.prixUnitaire ? domainPricing.calculerPrixM2DepuisPrixCarton(Number(ligne.prixUnitaire) || 0, surfaceCarton) : null;
              return (
                <div key={index} style={{ border: `1px solid ${defaultTokens.colors.borderSoft}`, borderRadius: defaultTokens.radius.md, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 2fr", gap: 10, marginBottom: 8 }}>
                    <div>
                      <label style={labelStyle}>Espace (optionnel)</label>
                      <input style={inputStyle} value={ligne.espace} onChange={(e) => majLigne(index, { espace: e.target.value })} placeholder="Ex. Salon, Cuisine - murs…" />
                    </div>
                    <div>
                      <label style={labelStyle}>Produit</label>
                      <ProduitSelector produits={produits} value={ligne.produitId} onChange={(id) => handleProduitChange(index, id)} />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: estCarton ? "1fr 1fr 1fr 1fr 0.8fr 1.2fr auto" : "1fr 1fr 0.8fr 1.2fr auto", gap: 10, alignItems: "end" }}>
                    {estCarton && (
                      <div>
                        <label style={labelStyle}>Surface souhaitée (m²)</label>
                        <input
                          style={{ ...inputStyle, opacity: surfaceCarton === null ? 0.5 : 1 }}
                          type="number"
                          min={0}
                          step="0.01"
                          disabled={surfaceCarton === null}
                          title={surfaceCarton === null ? "Carreaux/carton ou dimensions non renseignés pour ce produit" : undefined}
                          value={ligne.surfaceSouhaitee}
                          onChange={(e) => {
                            if (surfaceCarton === null) return;
                            const m2 = Number(e.target.value) || 0;
                            const cartons = m2 > 0 ? Math.ceil(m2 / surfaceCarton) : 0;
                            majLigne(index, { surfaceSouhaitee: e.target.value, quantite: cartons > 0 ? String(cartons) : ligne.quantite });
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <label style={labelStyle}>{estCarton ? "Quantité (cartons)" : `Quantité (${LIBELLE_UNITE_VENTE[unite].pluriel})`}</label>
                      <input
                        style={inputStyle}
                        type="number"
                        min={1}
                        value={ligne.quantite}
                        onChange={(e) => {
                          const brut = e.target.value;
                          majLigne(index, { quantite: brut === "" ? "" : String(Math.max(1, Math.trunc(Number(brut)))) });
                        }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{estCarton ? "Prix / carton" : `Prix / ${LIBELLE_UNITE_VENTE[unite].singulier}`}</label>
                      <input style={inputStyle} type="number" min={0} value={ligne.prixUnitaire} onChange={(e) => majLigne(index, { prixUnitaire: e.target.value })} />
                    </div>
                    {estCarton && (
                      <div>
                        <label style={labelStyle}>Prix / m²</label>
                        <input
                          style={{ ...inputStyle, opacity: surfaceCarton === null ? 0.5 : 1 }}
                          type="number"
                          min={0}
                          disabled={surfaceCarton === null}
                          value={prixM2 !== null ? String(prixM2) : ""}
                          onChange={(e) => {
                            if (surfaceCarton === null) return;
                            const valeur = Number(e.target.value) || 0;
                            majLigne(index, { prixUnitaire: valeur ? String(domainPricing.calculerPrixCartonDepuisPrixM2(valeur, surfaceCarton)) : "" });
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <label style={labelStyle}>Remise (%)</label>
                      <input style={inputStyle} type="number" min={0} max={100} step="0.5" value={ligne.remisePourcent} onChange={(e) => majLigne(index, { remisePourcent: e.target.value })} />
                    </div>
                    <div style={{ textAlign: "right", paddingBottom: 6 }}>
                      <div style={{ fontSize: 11, color: defaultTokens.colors.textSoft }}>
                        {calc.remise > 0 ? `${montant(calc.brut)} − ${montant(calc.remise)}` : "Net"}
                      </div>
                      <div style={{ fontWeight: 800 }}>{montant(calc.net)}</div>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <Button variant="ghost" title="Dupliquer la ligne (même produit, autre espace)" onClick={() => setLignes((prev) => [...prev.slice(0, index + 1), { ...ligne, espace: "", surfaceSouhaitee: "" }, ...prev.slice(index + 1)])}>
                        <Copy size={14} />
                      </Button>
                      <Button variant="ghost" title="Supprimer la ligne" onClick={() => setLignes((prev) => prev.filter((_, i) => i !== index))} disabled={lignes.length === 1}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div>
              <Button variant="secondary" onClick={() => setLignes((prev) => [...prev, ligneVide()])}>
                <Plus size={14} />
                Ajouter une ligne
              </Button>
            </div>
          </div>

          {recapParFormat.length > 0 && (
            <div style={{ marginBottom: 12, fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
              <strong style={{ color: defaultTokens.colors.text }}>Récapitulatif par format : </strong>
              {recapParFormat.map((g) => `${g.libelle} : ${g.quantite} ${g.unite} (${montant(g.net)})`).join(" · ")}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Hypothèses de calcul, conditions, points à confirmer (imprimés sur le devis)</label>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. Conditionnements : 60 × 60 = 1,44 m²/carton… Remises : 10 % sur les 40 × 40, 5 % sur les autres carreaux, aucune sur le ciment-colle. À confirmer : relevés de surfaces réels, livraison, validité du devis."
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, alignItems: "flex-end", borderTop: `1px solid ${defaultTokens.colors.borderSoft}`, paddingTop: 12, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Remise supplémentaire (FCFA)</label>
              <input style={{ ...inputStyle, width: 160 }} type="number" min={0} value={remiseGlobale} onChange={(e) => setRemiseGlobale(e.target.value)} />
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, color: defaultTokens.colors.textSoft }}>
              <div>Brut : {montant(totaux.brut)}</div>
              <div>Remises : {montant(totaux.remiseTotale)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: defaultTokens.colors.textSoft }}>Total net estimatif</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: defaultTokens.colors.text }}>{montant(totaux.net)}</div>
            </div>
            <Button loading={enCours} onClick={() => void handleEnregistrer()}>
              {devisEnModificationId ? "Enregistrer les modifications" : "Enregistrer le devis"}
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
                  {["Numéro", "Date", "Client", "Objet", "Lignes", "Total net", "Statut", ""].map((h) => (
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
                    <td style={{ padding: "10px 16px" }}>{d.clientNom || <span style={{ color: defaultTokens.colors.textFaint }}>À renseigner</span>}</td>
                    <td style={{ padding: "10px 16px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.objet ?? "—"}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}>{d.lignes.length}</td>
                    <td style={{ padding: "10px 16px", fontWeight: 700, whiteSpace: "nowrap" }}>{montant(Math.max(d.total - d.remise, 0))}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <StatutBadge statut={d.statut} />
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button variant="ghost" loading={actionEnCours === d.id} onClick={() => void handleVoir(d)} title="Voir / imprimer la facture proforma">
                        <Eye size={15} />
                      </Button>
                      <Button variant="ghost" onClick={() => void handleTelecharger(d)} title="Télécharger la facture proforma (PDF)">
                        <Download size={15} />
                      </Button>
                      {d.statut === "brouillon" && (
                        <>
                          <Button variant="ghost" onClick={() => ouvrirModification(d)} title="Modifier ce devis">
                            <Pencil size={15} />
                          </Button>
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

      {apercu && <PdfPreviewModal chemin={apercu.chemin} nomSuggere={apercu.nomSuggere} titre={apercu.titre} onFermer={() => setApercu(null)} />}
    </div>
  );
}
