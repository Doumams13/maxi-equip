import { useEffect, useState } from "react";
import { Card, useToast, defaultTokens } from "@maxi-equip/design-system";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import type { DiagnosticDoublonsReferentiel } from "../../../preload/index.js";

/**
 * Phase 5 (référentiel commun), sous-phase 5.7 — diagnostic des
 * doublons potentiels, STRICTEMENT consultatif : aucune fusion, aucune
 * suppression, aucune modification depuis cet écran. La résolution
 * reste manuelle via les écrans de gestion existants (Catégories,
 * Produits) — voir `catalogue:diagnostiquerDoublonsReferentiel`
 * (ipc/metier.ts) pour les règles exactes de rapprochement.
 */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function LigneId({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 6, fontSize: 12, color: defaultTokens.colors.textSoft }}>
      <span style={{ fontWeight: 700, minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: defaultTokens.typography.mono, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function CarteOccurrence({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${defaultTokens.colors.borderSoft}`,
        borderRadius: defaultTokens.radius.sm,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 220,
        background: defaultTokens.colors.surface,
      }}
    >
      {children}
    </div>
  );
}

function GroupeDoublon({ nom, enfants }: { nom: string; enfants: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${defaultTokens.colors.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <AlertTriangle size={14} color={defaultTokens.colors.warning} />
        <span style={{ fontWeight: 700, fontSize: 14, color: defaultTokens.colors.text }}>« {nom} »</span>
        <span style={{ fontSize: 11.5, color: defaultTokens.colors.textFaint }}>— rapprochement potentiel, noms identiques (insensible à la casse)</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>{enfants}</div>
    </div>
  );
}

function SectionType({ titre, description, count, children }: { titre: string; description: string; count: number; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ padding: "14px 16px", borderBottom: count > 0 ? `1px solid ${defaultTokens.colors.borderSoft}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontFamily: defaultTokens.typography.display, color: defaultTokens.colors.text }}>{titre}</h2>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              padding: "2px 9px",
              borderRadius: defaultTokens.radius.pill,
              background: count > 0 ? defaultTokens.colors.warningSoft : defaultTokens.colors.successSoft,
              color: count > 0 ? defaultTokens.colors.warning : defaultTokens.colors.success,
            }}
          >
            {count} groupe{count !== 1 ? "s" : ""}
          </span>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: defaultTokens.colors.textFaint }}>{description}</p>
      </div>
      {count > 0 ? (
        children
      ) : (
        <div style={{ padding: "16px", fontSize: 12.5, color: defaultTokens.colors.textFaint, display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} color={defaultTokens.colors.success} />
          Aucun doublon potentiel détecté pour ce type.
        </div>
      )}
    </Card>
  );
}

export function DiagnosticDoublonsScreen() {
  const { showError } = useToast();
  const [diagnostic, setDiagnostic] = useState<DiagnosticDoublonsReferentiel | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    setChargement(true);
    setErreur(null);
    try {
      const resultat = await window.maxiEquip.diagnostiquerDoublonsReferentiel();
      setDiagnostic(resultat);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inattendue lors du diagnostic.";
      setErreur(message);
      showError("Diagnostic impossible", message);
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void charger();
  }, []);

  if (chargement) {
    return <div style={{ padding: "40px 24px", color: defaultTokens.colors.textSoft, fontSize: 14 }}>Analyse du référentiel en cours…</div>;
  }

  if (erreur || !diagnostic) {
    return (
      <div style={{ padding: "28px 24px", maxWidth: 760 }}>
        <Card style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: defaultTokens.colors.danger }}>
            <AlertTriangle size={16} />
            <strong>Le diagnostic n'a pas pu être réalisé.</strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: defaultTokens.colors.textSoft }}>{erreur ?? "Réponse inattendue."}</p>
          <button
            onClick={() => void charger()}
            style={{
              alignSelf: "flex-start",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: defaultTokens.radius.sm,
              border: `1px solid ${defaultTokens.colors.border}`,
              background: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <RefreshCw size={13} /> Réessayer
          </button>
        </Card>
      </div>
    );
  }

  const totalGroupes = diagnostic.categories.length + diagnostic.sousCategories.length + diagnostic.modeles.length + diagnostic.produits.length;

  return (
    <div style={{ padding: "28px 24px", maxWidth: 1040 }}>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: defaultTokens.typography.display, fontSize: defaultTokens.fluidType.h1, color: defaultTokens.colors.text }}>
            Diagnostic des doublons
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: defaultTokens.colors.textSoft, maxWidth: 640 }}>
            Outil strictement consultatif : identifie des éléments créés indépendamment sur plusieurs postes qui pourraient représenter le même
            élément métier (même nom, identifiants différents). Aucune fusion ni suppression automatique — la résolution se fait manuellement
            depuis les écrans de gestion habituels.
          </p>
        </div>
        <button
          onClick={() => void charger()}
          title="Relancer le diagnostic"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: defaultTokens.radius.sm,
            border: `1px solid ${defaultTokens.colors.border}`,
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      <div
        style={{
          marginBottom: 20,
          padding: "12px 16px",
          borderRadius: defaultTokens.radius.sm,
          background: totalGroupes > 0 ? defaultTokens.colors.warningSoft : defaultTokens.colors.successSoft,
          color: totalGroupes > 0 ? defaultTokens.colors.warning : defaultTokens.colors.success,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13.5,
          fontWeight: 700,
        }}
      >
        {totalGroupes > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        {totalGroupes > 0
          ? `${totalGroupes} groupe${totalGroupes !== 1 ? "s" : ""} de doublons potentiels détecté${totalGroupes !== 1 ? "s" : ""}.`
          : "Aucun doublon potentiel détecté sur l'ensemble du référentiel."}
      </div>

      <SectionType titre="Catégories" description="Même nom (insensible à la casse), identifiants différents." count={diagnostic.categories.length}>
        {diagnostic.categories.map((g, i) => (
          <GroupeDoublon
            key={i}
            nom={g.nom}
            enfants={g.occurrences.map((o) => (
              <CarteOccurrence key={o.id}>
                <LigneId label="Identifiant" value={o.id} />
                <LigneId label="Créée le" value={formatDate(o.createdAt)} />
                <LigneId label="Modifiée le" value={formatDate(o.updatedAt)} />
              </CarteOccurrence>
            ))}
          />
        ))}
      </SectionType>

      <SectionType
        titre="Sous-catégories"
        description="Même nom, sous une MÊME catégorie parente — jamais rapproché au-delà de cette catégorie."
        count={diagnostic.sousCategories.length}
      >
        {diagnostic.sousCategories.map((g, i) => (
          <GroupeDoublon
            key={i}
            nom={g.nom}
            enfants={g.occurrences.map((o) => (
              <CarteOccurrence key={o.id}>
                <LigneId label="Identifiant" value={o.id} />
                <LigneId label="Catégorie" value={o.categorieParenteNom ?? o.categorieParenteId} />
                <LigneId label="Créée le" value={formatDate(o.createdAt)} />
                <LigneId label="Modifiée le" value={formatDate(o.updatedAt)} />
              </CarteOccurrence>
            ))}
          />
        ))}
      </SectionType>

      <SectionType titre="Modèles" description="Même nom (motif), identifiants différents." count={diagnostic.modeles.length}>
        {diagnostic.modeles.map((g, i) => (
          <GroupeDoublon
            key={i}
            nom={g.nom}
            enfants={g.occurrences.map((o) => (
              <CarteOccurrence key={o.id}>
                <LigneId label="Identifiant" value={o.id} />
                <LigneId label="Type" value={o.type} />
                <LigneId label="Créé le" value={formatDate(o.createdAt)} />
                <LigneId label="Modifié le" value={formatDate(o.updatedAt)} />
              </CarteOccurrence>
            ))}
          />
        ))}
      </SectionType>

      <SectionType
        titre="Produits"
        description="Même nom de modèle (motif), un seul produit représentant par modèle — jamais un faux-positif entre les variantes d'un même modèle."
        count={diagnostic.produits.length}
      >
        {diagnostic.produits.map((g, i) => (
          <GroupeDoublon
            key={i}
            nom={g.nom}
            enfants={g.occurrences.map((o) => (
              <CarteOccurrence key={o.id}>
                <LigneId label="Identifiant" value={o.id} />
                <LigneId label="Modèle" value={o.modeleMotif ?? "—"} />
                <LigneId label="Taille" value={o.taille} />
                <LigneId label="Prix" value={`${o.prix.toLocaleString("fr-FR")} FCFA`} />
                <LigneId label="Créé le" value={formatDate(o.createdAt)} />
              </CarteOccurrence>
            ))}
          />
        ))}
      </SectionType>
    </div>
  );
}
