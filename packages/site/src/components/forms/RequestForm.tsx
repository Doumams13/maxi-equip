"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";
import { requestRepository } from "@/services/request";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/states";

export function RequestForm() {
  const router = useRouter();
  const { state, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const formData = new FormData(event.currentTarget);
    const customerName = String(formData.get("customerName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const location = String(formData.get("location") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim();
    const websiteHoneypot = String(formData.get("website") ?? "");

    const nextFieldErrors: Record<string, string> = {};
    if (!customerName) nextFieldErrors.customerName = "Votre nom est requis.";
    if (!phone) nextFieldErrors.phone = "Un numéro de téléphone est requis.";
    if (!location) nextFieldErrors.location = "Indiquez votre localisation (quartier, ville).";
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestRepository.submit({
        customerName,
        phone,
        location,
        email: email || undefined,
        comment: comment || undefined,
        websiteHoneypot: websiteHoneypot || undefined,
        lines: state.lines.map((l) => ({
          productModelId: l.productModelId,
          productModelName: l.productModelName,
          variantId: l.variantId,
          size: l.size,
          quantity: l.quantity,
          unitPriceFcfa: l.unitPriceFcfa,
        })),
      });
      clear();
      router.push(`/confirmation?requestId=${encodeURIComponent(result.requestId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi de votre demande a échoué. Merci de réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state.lines.length === 0) {
    return <ErrorState title="Votre panier est vide" description="Ajoutez au moins un produit depuis le catalogue avant d'envoyer une demande." />;
  }

  const fieldClass = "mt-2 w-full border-0 border-b border-ink/25 bg-transparent py-2.5 text-lg focus:border-ember";
  const labelClass = "font-display text-lg italic text-ink";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-7">
      {error && (
        <div role="alert" className="border border-status-error/30 bg-status-errorBg px-4 py-3 text-sm text-status-error">
          {error}
        </div>
      )}

      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor="website">Ne pas remplir ce champ</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="customerName" className={labelClass}>
          Votre nom
        </label>
        <input
          id="customerName"
          name="customerName"
          type="text"
          required
          aria-invalid={Boolean(fieldErrors.customerName)}
          aria-describedby={fieldErrors.customerName ? "customerName-error" : undefined}
          className={fieldClass}
        />
        {fieldErrors.customerName && (
          <p id="customerName-error" className="mt-1 text-xs text-status-error">
            {fieldErrors.customerName}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Téléphone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
          className={fieldClass}
        />
        {fieldErrors.phone && (
          <p id="phone-error" className="mt-1 text-xs text-status-error">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="location" className={labelClass}>
          Localisation
        </label>
        <input
          id="location"
          name="location"
          type="text"
          required
          placeholder="Quartier, ville"
          aria-invalid={Boolean(fieldErrors.location)}
          aria-describedby={fieldErrors.location ? "location-error" : undefined}
          className={fieldClass}
        />
        {fieldErrors.location && (
          <p id="location-error" className="mt-1 text-xs text-status-error">
            {fieldErrors.location}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email <span className="text-sm not-italic text-ink/40">(facultatif)</span>
        </label>
        <input id="email" name="email" type="email" className={fieldClass} />
      </div>

      <div>
        <label htmlFor="comment" className={labelClass}>
          Un mot pour préciser votre demande <span className="text-sm not-italic text-ink/40">(facultatif)</span>
        </label>
        <textarea id="comment" name="comment" rows={3} className={fieldClass} />
      </div>

      <Button type="submit" size="lg" fullWidth disabled={submitting}>
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
