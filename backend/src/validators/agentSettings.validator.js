// backend/src/validators/agentSettings.validator.js
/**
 * Validation for the call-configuration fields that ride in the agent's
 * `settings` JSON rather than in columns. The controller packs every unknown
 * key into that JSON, which is convenient and also how an unvalidated
 * `transferNumber` of "front desk" got stored and then handed to a carrier.
 *
 * Returns { ok: true, extras } with the validated (normalised) values written
 * back, or { ok: false, error } with a message the editor can show.
 */
import { e164, TRANSFER_MODES, OUT_OF_HOURS } from '../services/telephony/transfer.service.js';
import { SPECULATION_MODES } from '../services/voice/speculativeTurn.js';
import { AMBIENT_MODES, ALL_AMBIENT_PRESET_NAMES } from '../services/voice/ambience.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateAgentSettings(extras = {}) {
  const out = { ...extras };
  const has = (k) => extras[k] !== undefined && extras[k] !== null;

  if (has('transferNumber')) {
    const raw = String(extras.transferNumber).trim();
    if (raw) {
      const n = e164(raw);
      if (!n) return { ok: false, error: 'Transfer number must be a full international number, for example +91 98765 43210.' };
      out.transferNumber = n;
    } else {
      out.transferNumber = '';
    }
  }
  if (has('transferMode') && String(extras.transferMode) !== '') {
    if (!TRANSFER_MODES.includes(extras.transferMode)) return { ok: false, error: `Transfer mode must be one of ${TRANSFER_MODES.join(', ')}.` };
  }
  if (has('transferTimeoutSec') && String(extras.transferTimeoutSec) !== '') {
    const t = Number(extras.transferTimeoutSec);
    if (!Number.isFinite(t) || t < 5 || t > 60) return { ok: false, error: 'Transfer ring timeout must be between 5 and 60 seconds.' };
    out.transferTimeoutSec = Math.round(t);
  }
  if (has('transferOutOfHours') && String(extras.transferOutOfHours) !== '') {
    if (!OUT_OF_HOURS.includes(extras.transferOutOfHours)) return { ok: false, error: `Out-of-hours behaviour must be one of ${OUT_OF_HOURS.join(', ')}.` };
  }
  if (has('transferHours') && extras.transferHours && typeof extras.transferHours === 'object') {
    const h = extras.transferHours;
    if (h.enabled) {
      if (!HHMM.test(String(h.start || ''))) return { ok: false, error: 'Transfer hours start must be HH:MM.' };
      if (!HHMM.test(String(h.end || ''))) return { ok: false, error: 'Transfer hours end must be HH:MM.' };
      const days = Array.isArray(h.days) ? h.days.map(Number) : [];
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { ok: false, error: 'Transfer hours need at least one weekday (0=Sunday … 6=Saturday).' };
      const tz = String(h.timezone || 'Asia/Kolkata');
      try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return { ok: false, error: `Unknown timezone "${tz}".` }; }
      out.transferHours = { enabled: true, start: h.start, end: h.end, days: [...new Set(days)].sort(), timezone: tz };
    } else {
      out.transferHours = { enabled: false };
    }
  }
  if (has('transferLabel')) {
    const label = String(extras.transferLabel).trim().slice(0, 60);
    out.transferLabel = label;
  }
  if (has('ambientMode') && String(extras.ambientMode) !== '') {
    if (!AMBIENT_MODES.includes(extras.ambientMode)) return { ok: false, error: `Background sound mode must be one of ${AMBIENT_MODES.join(', ')}.` };
  }
  if (has('ambientSound') && String(extras.ambientSound) !== '' && extras.ambientSound !== 'None') {
    if (!ALL_AMBIENT_PRESET_NAMES.includes(extras.ambientSound)) return { ok: false, error: `Unknown background sound "${extras.ambientSound}".` };
  }
  if (has('speculation') && String(extras.speculation) !== '') {
    if (!SPECULATION_MODES.includes(extras.speculation)) return { ok: false, error: `Speculation must be one of ${SPECULATION_MODES.join(', ')}.` };
  }
  return { ok: true, extras: out };
}
