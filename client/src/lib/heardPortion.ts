/**
 * Roughly the part of `text` a caller heard before cutting the agent off,
 * `heardSec` into `totalSec` of audio.
 *
 * The browser twin of backend/src/services/voice/welcomeBarge.js heardPortion(),
 * with the same rules. Weighted by characters, because speech time follows
 * length. Only whole words are kept, and always at least the first one. It is an
 * estimate, and it only has to show the model where the line stopped.
 */
export function heardPortion(text: string, heardSec: number, totalSec: number): string {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (!(totalSec > 0) || !(heardSec < totalSec)) return words.join(' ');
  const budget = (Math.max(0, heardSec) / totalSec) * words.join(' ').length;
  let used = 0;
  let n = 0;
  for (const w of words) {
    if (used + w.length > budget) break;
    used += w.length + 1;
    n += 1;
  }
  return words.slice(0, Math.max(1, n)).join(' ');
}
