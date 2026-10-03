"use client";

import { useState } from "react";
import { buildWhatsAppUrl } from "@/config/site";

const inputCls =
  "w-full rounded border border-ink/[0.14] bg-surface px-[14px] py-3 text-[14.5px] text-ink placeholder:text-ink-mute/60 focus:border-sage focus:outline-none";

/** `whatsappNumero` : correction "L'appli gère les infos du site" — numéro réellement synchronisé, transmis par contact/page.tsx (Server Component). Optionnel — sans lui, comportement inchangé (repli sur config/site.ts). */
export function ContactForm({ whatsappNumero }: { whatsappNumero?: string }) {
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");

  function envoyer() {
    if (!nom.trim() || !tel.trim()) {
      setErreur("Merci d'indiquer au moins votre nom et votre téléphone.");
      return;
    }
    setErreur("");
    const lignes = ["Bonjour MAXI EQUIP,", `Je m'appelle ${nom.trim()} (${tel.trim()}).`];
    if (email.trim()) lignes.push(`Email : ${email.trim()}`);
    if (message.trim()) lignes.push(`Message : ${message.trim()}`);
    window.open(buildWhatsAppUrl(lignes.join("\n"), whatsappNumero), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded bg-surface-soft p-8">
      <div className="mb-[18px]">
        <label htmlFor="c-nom" className="mb-1.5 block text-[13px] font-semibold">
          Nom complet
        </label>
        <input
          id="c-nom"
          type="text"
          placeholder="Votre nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="mb-[18px]">
        <label htmlFor="c-tel" className="mb-1.5 block text-[13px] font-semibold">
          Téléphone
        </label>
        <input
          id="c-tel"
          type="tel"
          placeholder="Votre numéro"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="mb-[18px]">
        <label htmlFor="c-email" className="mb-1.5 block text-[13px] font-semibold">
          Email <span className="font-normal text-ink-mute">(facultatif)</span>
        </label>
        <input
          id="c-email"
          type="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="mb-[18px]">
        <label htmlFor="c-msg" className="mb-1.5 block text-[13px] font-semibold">
          Message
        </label>
        <textarea
          id="c-msg"
          placeholder="Votre question ou votre projet en quelques mots..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputCls} min-h-[90px] resize-y`}
        />
      </div>

      {erreur && (
        <p className="mb-3 text-[13px] text-clay" role="alert">
          {erreur}
        </p>
      )}

      <button
        type="button"
        onClick={envoyer}
        className="w-full rounded bg-forest px-4 py-[14px] text-[14.5px] font-bold text-bg transition-colors hover:bg-forest-deep"
      >
        Envoyer le message
      </button>
    </div>
  );
}
