/**
 * The WhatsApp message templates Spandan will submit to Meta on a client's behalf.
 *
 * These are PRESETS, not a composer. The client chooses one and maps their own
 * extracted variables onto its placeholders; they cannot edit the wording. That
 * restriction is the whole point:
 *
 *   Meta categorises a template as UTILITY (cheap, no marketing opt-in needed) or
 *   MARKETING (dearer, needs opt-in, different rate limits) by reading it. A body
 *   that is mostly bare placeholders — "{{1}}, {{2}}, {{3}}" — reads as unclear and
 *   gets reclassified to MARKETING, silently, after approval. The literal sentences
 *   around each {{n}} below are what keep these in UTILITY, so they are content,
 *   not decoration. Changing them is a pricing and compliance decision.
 *
 * Meta placeholders are POSITIONAL and 1-based: {{1}}, {{2}}. ChatFlow stores no
 * record of what a position means — `placeholders` here is Spandan's own record,
 * used to label the mapping UI and to build the `example.body_text` samples Meta
 * requires at submission time.
 *
 * `name` is not taken from here: it is derived per workspace at creation time,
 * because Meta template names must match /^[a-z0-9_]{1,64}$/ and be unique on the
 * WhatsApp Business Account.
 */

export const WHATSAPP_TEMPLATE_PRESETS = Object.freeze([
  {
    id: 'appointment_confirmation',
    label: 'Appointment confirmation',
    blurb: 'Sent when a call ends with an appointment booked.',
    category: 'UTILITY',
    language: 'en',
    bodyText: 'Hi {{1}}, your appointment is confirmed for {{2}}. Reply to this message if you need to reschedule.',
    placeholders: [
      { index: 1, label: 'Customer name', example: 'Priya' },
      { index: 2, label: 'Appointment date and time', example: '12 September, 4:00 PM' },
    ],
  },
  {
    id: 'booking_confirmation',
    label: 'Booking confirmation',
    blurb: 'For a room, table or resource booking rather than a timed appointment.',
    category: 'UTILITY',
    language: 'en',
    bodyText: 'Hi {{1}}, your booking for {{2}} on {{3}} is confirmed. Reply to this message if anything needs to change.',
    placeholders: [
      { index: 1, label: 'Customer name', example: 'Priya' },
      { index: 2, label: 'What was booked', example: 'Consultation Room 3' },
      { index: 3, label: 'Date and time', example: '12 September, 4:00 PM' },
    ],
  },
  {
    id: 'callback_confirmation',
    label: 'Callback confirmation',
    blurb: 'Sent when the caller asked to be called back at a particular time.',
    category: 'UTILITY',
    language: 'en',
    bodyText: 'Hi {{1}}, thanks for calling. We have noted your request and will call you back on {{2}}.',
    placeholders: [
      { index: 1, label: 'Customer name', example: 'Priya' },
      { index: 2, label: 'Callback date and time', example: '13 September, 11:00 AM' },
    ],
  },
]);

/** @param {string} id */
export const getPreset = (id) =>
  WHATSAPP_TEMPLATE_PRESETS.find((p) => p.id === id) ?? null;

/**
 * The highest {{n}} actually present in the body. ChatFlow derives the parameter
 * count the same way at send time (its templateParams.countVariables), so deriving
 * it here rather than trusting `placeholders.length` keeps the two in step if a
 * preset is ever edited without its placeholder list being updated to match.
 */
export const presetVariableCount = (preset) => {
  if (!preset?.bodyText) return 0;
  let max = 0;
  for (const m of String(preset.bodyText).matchAll(/\{\{(\d+)\}\}/g)) {
    max = Math.max(max, Number(m[1]) || 0);
  }
  return max;
};
