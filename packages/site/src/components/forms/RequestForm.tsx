"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart/CartContext";
import { requestRepository } from "@/services/request";
import { Button } from "@/components/ui/primitives";
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
    if (!customerName) nextFieldErrors.customerName = "Merci d'indiquer votre nom.";
    if (!phone) nextFieldErrors.phone = "Merci d'indiquer un numéro de téléphone.";
    if (!location) nextFieldErrors.location = "Merci d'indiquer une localisation.";
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
    return <ErrorState title="Votre sélection est vide" description="Ajoutez au moins un produit depuis le catalogue avant d'envoyer une demande." />;
  }

  const inputClass = "w-full rounded border border-ink/[0.14] bg-surface px-3.5 py-3 text-[14.5px] text-ink focus:border-forest";
  const labelClass = "mb-1.5 block text-[13px] font-semibold text-ink";

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && (
        <div role="alert" className="mb-5 rounded bg-status-errorBg px-4 py-3 text-sm text-clay">
          {error}
        </div>
      )}

      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden">
        <label htmlFor="website">Ne pas remplir ce champ</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mb-5">
        <label htmlFor="customerName" className={labelClass}>
          Nom complet
        </label>
        <input id="customerName" name="customerName" type="text" placeholder="Votre nom" className={inputClass} aria-invalid={Boolean(fieldErrors.customerName)} />
        {fieldErrors.customerName && <p className="mt-1.5 text-[12.5px] text-clay">{fieldErrors.customerName}</p>}
      </div>

      <div className="mb-5">
        <label htmlFor="phone" className={labelClass}>
          Téléphone
        </label>
        <input id="phone" name="phone" type="tel" placeholder="Votre numéro de téléphone" className={inputClass} aria-invalid={Boolean(fieldErrors.phone)} />
        {fieldErrors.phone && <p className="mt-1.5 text-[12.5px] text-clay">{fieldErrors.phone}</p>}
      </div>

      <div className="mb-5">
        <label htmlFor="location" className={labelClass}>
          Adresse / localisation
        </label>
        <input id="location" name="location" type="text" placeholder="Quartier, ville" className={inputClass} aria-invalid={Boolean(fieldErrors.location)} />
        {fieldErrors.location && <p className="mt-1.5 text-[12.5px] text-clay">{fieldErrors.location}</p>}
      </div>

      <div className="mb-5">
        <label htmlFor="email" className={labelClass}>
          Email <span className="font-normal text-ink-mute">(facultatif)</span>
        </label>
        <input id="email" name="email" type="email" placeholder="vous@exemple.com" className={inputClass} />
      </div>

      <div className="mb-5">
        <label htmlFor="comment" className={labelClass}>
          Commentaire <span className="font-normal text-ink-mute">(facultatif)</span>
        </label>
        <textarea id="comment" name="comment" placeholder="Précisions sur votre projet, délai souhaité..." className={`${inputClass} min-h-[90px] resize-y`} />
      </div>

      <Button type="submit" fullWidth disabled={submitting}>
        {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
