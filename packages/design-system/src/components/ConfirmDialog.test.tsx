import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog.js";

describe("ConfirmDialog (correction : double validation, protection anti-double-clic)", () => {
  it("affiche le titre et le résumé fourni", () => {
    render(
      <ConfirmDialog
        title="Confirmer l'entrée ?"
        resume={[
          { label: "Produit", value: "F-6060" },
          { label: "Quantité", value: "20 cartons" },
        ]}
        onAnnuler={() => {}}
        onConfirmer={() => {}}
      />
    );
    expect(screen.getByText("Confirmer l'entrée ?")).toBeTruthy();
    expect(screen.getByText("F-6060")).toBeTruthy();
    expect(screen.getByText("20 cartons")).toBeTruthy();
  });

  it("appelle onAnnuler au clic sur Annuler", () => {
    const onAnnuler = vi.fn();
    render(<ConfirmDialog title="Titre" resume={[]} onAnnuler={onAnnuler} onConfirmer={() => {}} />);
    screen.getByText("Annuler").click();
    expect(onAnnuler).toHaveBeenCalledOnce();
  });

  it("appelle onConfirmer au clic sur Confirmer", () => {
    const onConfirmer = vi.fn();
    render(<ConfirmDialog title="Titre" resume={[]} onAnnuler={() => {}} onConfirmer={onConfirmer} />);
    screen.getByText("Confirmer").click();
    expect(onConfirmer).toHaveBeenCalledOnce();
  });

  it("désactive le bouton de confirmation pendant le traitement (protection anti-double-soumission)", () => {
    const onConfirmer = vi.fn();
    render(<ConfirmDialog title="Titre" resume={[]} onAnnuler={() => {}} onConfirmer={onConfirmer} confirming />);
    const bouton = screen.getByRole("button", { name: /confirmer/i });
    expect(bouton.hasAttribute("disabled")).toBe(true);
    bouton.click();
    expect(onConfirmer).not.toHaveBeenCalled();
  });

  it("désactive également le bouton Annuler pendant le traitement", () => {
    render(<ConfirmDialog title="Titre" resume={[]} onAnnuler={() => {}} onConfirmer={() => {}} confirming />);
    const bouton = screen.getByText("Annuler") as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
  });

  it("utilise un label de confirmation personnalisé si fourni", () => {
    render(<ConfirmDialog title="Titre" resume={[]} onAnnuler={() => {}} onConfirmer={() => {}} confirmLabel="Confirmer la suppression" />);
    expect(screen.getByText("Confirmer la suppression")).toBeTruthy();
  });
});
