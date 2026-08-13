// backend/src/workers/kbExtract.worker.js
/**
 * Runs extractText() off the main event loop. This process also serves live
 * phone-call WebSocket audio (barge-in RMS detection, 20ms-frame pacing), so a
 * multi-second synchronous PDF parse on a large KB file must not be able to
 * add jitter to a concurrent call — see kbChunking.service.js, which spawns
 * one of these per file being processed.
 *
 * One-shot: this worker does a single extraction job from `workerData`, posts
 * the result, and its caller terminates it. Not a persistent pool — KB uploads
 * are not frequent enough to justify one.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { extractText } from '../services/kb/textExtraction.service.js';

(async () => {
  try {
    const { filePath, mimeType } = workerData;
    const text = await extractText(filePath, mimeType);
    parentPort.postMessage({ ok: true, text });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err?.message || 'extraction failed' });
  }
})();
