import { defaultTokens } from "@maxi-equip/design-system";

/**
 * Formes géométriques décoratives en arrière-plan de l'écran de connexion
 * — reproduit la maquette fournie (chevrons verts discrets). Purement
 * décoratif : `pointer-events: none`, jamais interactif, jamais au-dessus
 * du contenu (z-index bas). Positionné en pourcentages (pas de pixels
 * absolus rigides) pour rester correct au redimensionnement, et contenu
 * par `overflow: hidden` sur le conteneur parent pour ne jamais provoquer
 * de barre de défilement.
 */
function Chevron({ style }: { style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        width: "26vw",
        height: "26vw",
        maxWidth: 340,
        maxHeight: 340,
        border: `2px solid ${defaultTokens.colors.decorative}`,
        borderRadius: 28,
        transform: "rotate(45deg)",
        opacity: 0.35,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

function ChevronFilled({ style }: { style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        width: "16vw",
        height: "16vw",
        maxWidth: 200,
        maxHeight: 200,
        background: defaultTokens.colors.accent,
        borderRadius: 24,
        transform: "rotate(45deg)",
        opacity: 0.9,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

export function DecorativeBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
      <ChevronFilled style={{ left: "-6vw", bottom: "8vh" }} />
      <Chevron style={{ left: "2vw", bottom: "-4vh" }} />
      <Chevron style={{ right: "-8vw", top: "10vh" }} />
      <ChevronFilled style={{ right: "-4vw", bottom: "-6vh" }} />
    </div>
  );
}
