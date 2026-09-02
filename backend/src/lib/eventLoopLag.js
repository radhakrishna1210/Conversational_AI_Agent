// backend/src/lib/eventLoopLag.js
/**
 * Event-loop delay sampler for the latency record.
 *
 * One Node process runs the API, the dialler, every media bridge and one 20ms
 * pacer clock per phone call (PHONE_VS_WEB_LATENCY_ROOT_CAUSE.md §7, B1). When
 * the loop slips, every pacer tick fires late at once and every live call's
 * queue deepens together — and nothing in logs/latency.log could see it. This
 * is the instrument that root-cause doc asked for first: "if p99 lag > 20ms
 * during a campaign, this is the bottleneck and nothing else matters yet".
 *
 * `perf_hooks.monitorEventLoopDelay` samples on its own timer thread, so the
 * cost is a histogram write per tick, not work on the loop being measured.
 * `snapshot()` reads the percentiles accumulated SINCE THE LAST SNAPSHOT and
 * resets, so each latency row describes the loop during roughly that turn.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

const NS_PER_MS = 1e6;

let histogram = null;

/** Start sampling (idempotent). 20ms resolution matches the pacer clock. */
export function startEventLoopLagMonitor(resolutionMs = 20) {
  if (histogram) return histogram;
  histogram = monitorEventLoopDelay({ resolution: resolutionMs });
  histogram.enable();
  return histogram;
}

/**
 * Percentiles of loop delay since the previous snapshot, in whole ms.
 * All fields are null until the monitor has been started and has a sample.
 *
 * @returns {{ elLagP50Ms: number|null, elLagP99Ms: number|null, elLagMaxMs: number|null, elLagSamples: number }}
 */
export function snapshotEventLoopLag() {
  if (!histogram || histogram.count === 0) {
    return { elLagP50Ms: null, elLagP99Ms: null, elLagMaxMs: null, elLagSamples: 0 };
  }
  const out = {
    elLagP50Ms: Math.round(histogram.percentile(50) / NS_PER_MS),
    elLagP99Ms: Math.round(histogram.percentile(99) / NS_PER_MS),
    elLagMaxMs: Math.round(histogram.max / NS_PER_MS),
    elLagSamples: histogram.count,
  };
  histogram.reset();
  return out;
}

/** Test seam: stop and forget the monitor. */
export function stopEventLoopLagMonitor() {
  if (!histogram) return;
  histogram.disable();
  histogram = null;
}
