import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContext.js";
import { DEFAULT_TOAST_DURATIONS_MS } from "./constants.js";

function TestConsumer() {
  const { showSuccess, showError, showWarning, showInfo } = useToast();
  return (
    <div>
      <button onClick={() => showSuccess("Titre succès", "Message succès")}>déclencher succès</button>
      <button onClick={() => showError("Titre erreur", "Message erreur")}>déclencher erreur</button>
      <button onClick={() => showWarning("Titre avertissement", "Message avertissement")}>déclencher avertissement</button>
      <button onClick={() => showInfo("Titre info", "Message info")}>déclencher info</button>
    </div>
  );
}

describe("Système de notifications (Toast) — Phase 1", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("affiche une notification de succès avec titre et message", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("déclencher succès").click());
    expect(screen.getByText("Titre succès")).toBeTruthy();
    expect(screen.getByText("Message succès")).toBeTruthy();
  });

  it("affiche les quatre types avec le bon rôle d'accessibilité (erreur/avertissement = alert, succès/info = status)", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("déclencher erreur").click());
    expect(screen.getByRole("alert")).toBeTruthy();

    act(() => screen.getByText("déclencher succès").click());
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("empile plusieurs notifications simultanément", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => {
      screen.getByText("déclencher succès").click();
      screen.getByText("déclencher erreur").click();
      screen.getByText("déclencher avertissement").click();
    });
    expect(screen.getByText("Titre succès")).toBeTruthy();
    expect(screen.getByText("Titre erreur")).toBeTruthy();
    expect(screen.getByText("Titre avertissement")).toBeTruthy();
  });

  it("une notification disparaît automatiquement après sa durée par défaut", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("déclencher info").click());
    expect(screen.getByText("Titre info")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_DURATIONS_MS.info + 300);
    });
    expect(screen.queryByText("Titre info")).toBeNull();
  });

  it("une notification d'erreur reste affichée plus longtemps qu'une notification de succès (durées centralisées distinctes)", () => {
    expect(DEFAULT_TOAST_DURATIONS_MS.error).toBeGreaterThan(DEFAULT_TOAST_DURATIONS_MS.success);
  });

  it("peut être fermée manuellement via le bouton de fermeture", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("déclencher succès").click());
    expect(screen.getByText("Titre succès")).toBeTruthy();

    act(() => screen.getByLabelText("Fermer la notification").click());
    act(() => vi.advanceTimersByTime(300)); // délai de l'animation de sortie

    expect(screen.queryByText("Titre succès")).toBeNull();
  });

  it("useToast() lève une erreur explicite si utilisé hors d'un ToastProvider", () => {
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
  });
});
