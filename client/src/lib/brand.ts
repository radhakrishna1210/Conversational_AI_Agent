/**
 * Product identity in one place.
 *
 * The app shipped as "Conversational AI Agent" and is now Spandan. The rename
 * touched marketing copy in 16 files, but everything structural — document
 * titles, the logo wordmark, support addresses, schema.org name — reads from
 * here so the next change is one edit rather than another sweep.
 *
 * `spandan` (स्पंदन) means pulse or resonance, which is where the design
 * system's name and its pulse-ring logo mark come from.
 */

export const BRAND = {
  name: 'Spandan',
  /** Used in <title> and anywhere the name needs its category alongside it. */
  tagline: 'Voice AI that answers, understands and acts',
  /** Design-language name, shown in the design system and mono micro-labels. */
  system: 'Resonance',
  domain: 'spandan.ai',
  /* Deliberately not on `domain` — sales and support mail is handled on the
     Mannmate side. Read by the landing page's sales band and the contact page. */
  supportEmail: 'info@mannmate.com',
} as const;

/** `Page — Spandan`, or just `Spandan` at the root. */
export function pageTitle(page?: string): string {
  return page ? `${page} — ${BRAND.name}` : BRAND.name;
}
