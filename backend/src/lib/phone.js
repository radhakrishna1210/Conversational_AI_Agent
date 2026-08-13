// Phone number normalisation for contact lists.
//
// csvParser.normalisePhone only strips punctuation, which is enough to hand a
// string to Twilio and nowhere near enough to key a contact on: "9876543210",
// "+91 98765 43210" and "09876543210" are one person, and stored as three rows
// they become three calls to the same handset. Everything that reaches the
// Contact table goes through toE164() first.

// Bare 10-digit numbers have no country in them. India is the deployment's
// market (see the Plivo/Exotel routing), so that is the assumption — overridable
// per install rather than hard-coded, because the assumption is the risky part.
const DEFAULT_COUNTRY_CODE = String(process.env.DEFAULT_COUNTRY_CODE || '+91');

/** A well-formed E.164 number: '+', a non-zero country digit, 7–14 more. */
export const E164_RE = /^\+[1-9]\d{7,14}$/;

export const isE164 = (value) => typeof value === 'string' && E164_RE.test(value);

/**
 * Normalise a raw phone string to E.164, or return null if it cannot be.
 *
 * Returning null rather than a best guess is deliberate: an unparseable number
 * in a 10,000-row upload should be reported back to whoever uploaded it, not
 * quietly dialled as something else.
 */
export function toE164(raw, { defaultCountryCode = DEFAULT_COUNTRY_CODE } = {}) {
  if (raw === null || raw === undefined) return null;
  const input = String(raw).trim();
  if (!input) return null;

  // Excel turns long numbers into "9.19876E+11" on save. That is lossy — the
  // digits are gone — so it must be refused rather than parsed.
  if (/\d[eE][+-]?\d+$/.test(input.replace(/\s/g, ''))) return null;

  const international = input.startsWith('+') || input.startsWith('00');
  let digits = input.replace(/\D/g, '');
  if (input.startsWith('00')) digits = digits.slice(2);
  if (!digits) return null;

  const cc = String(defaultCountryCode).replace(/\D/g, '');

  if (!international && cc) {
    if (digits.length === 10) {
      // Bare national number.
      digits = cc + digits;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      // National trunk prefix — '0' then the subscriber number.
      digits = cc + digits.slice(1);
    }
    // Anything else already carries a country code (or is malformed, and the
    // length check below will say so).
  }

  const candidate = `+${digits}`;
  return E164_RE.test(candidate) ? candidate : null;
}

/**
 * Format for display: '+919876543210' → '+91 98765 43210'.
 * Cosmetic only — never store the result.
 */
export function formatE164(value) {
  if (!isE164(value)) return value ?? '';
  const digits = value.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return value;
}
