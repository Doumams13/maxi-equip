import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Combobox } from "./Combobox.js";

describe("Combobox (Correction Phase 2 — Type/Taille)", () => {
  it("affiche les suggestions existantes au focus", () => {
    render(<Combobox value="" onChange={() => {}} suggestions={["Faïence", "Grès cérame", "Porcelaine"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getByText("Faïence")).toBeTruthy();
    expect(screen.getByText("Grès cérame")).toBeTruthy();
    expect(screen.getByText("Porcelaine")).toBeTruthy();
  });

  it("filtre les suggestions au fur et à mesure de la saisie", () => {
    let value = "";
    const handleChange = (v: string) => {
      value = v;
    };
    const { rerender } = render(<Combobox value={value} onChange={handleChange} suggestions={["Faïence", "Grès cérame", "Porcelaine"]} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "grès" } });
    rerender(<Combobox value="grès" onChange={handleChange} suggestions={["Faïence", "Grès cérame", "Porcelaine"]} />);

    expect(screen.getByText("Grès cérame")).toBeTruthy();
    expect(screen.queryByText("Faïence")).toBeNull();
  });

  it("accepte une valeur totalement nouvelle, absente des suggestions (règle métier critique)", () => {
    const handleChange = vi.fn();
    render(<Combobox value="Travertin" onChange={handleChange} suggestions={["Faïence", "Grès cérame", "Porcelaine"]} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("Travertin");
    // Aucune erreur, aucun blocage — le champ reste un simple input contrôlé.
    fireEvent.change(input, { target: { value: "Travertin foncé" } });
    expect(handleChange).toHaveBeenCalledWith("Travertin foncé");
  });

  it("sélectionne une suggestion au clic", () => {
    const handleChange = vi.fn();
    render(<Combobox value="" onChange={handleChange} suggestions={["60x60 cm", "30x30 cm"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(screen.getByText("60x60 cm"));
    expect(handleChange).toHaveBeenCalledWith("60x60 cm");
  });

  it("fonctionne avec une liste de suggestions vide (aucune valeur existante) sans bloquer la saisie libre", () => {
    const handleChange = vi.fn();
    render(<Combobox value="" onChange={handleChange} suggestions={[]} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "90x90 cm" } });
    expect(handleChange).toHaveBeenCalledWith("90x90 cm");
  });

  it("navigation clavier : Entrée seule sélectionne la première suggestion surlignée par défaut", () => {
    const handleChange = vi.fn();
    render(<Combobox value="" onChange={handleChange} suggestions={["60x60 cm", "30x30 cm"]} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handleChange).toHaveBeenCalledWith("60x60 cm");
  });

  it("navigation clavier : la flèche bas déplace la sélection vers la suggestion suivante", () => {
    const handleChange = vi.fn();
    render(<Combobox value="" onChange={handleChange} suggestions={["60x60 cm", "30x30 cm"]} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(handleChange).toHaveBeenCalledWith("30x30 cm");
  });
});
