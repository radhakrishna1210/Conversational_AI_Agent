// backend/src/services/voice/segmentOrder.js
/**
 * Lets several TTS segments be SYNTHESIZED at once while their audio still
 * reaches the listener strictly in order.
 *
 * WHY THE TWO HAVE TO BE SEPARATED
 *
 * A reply is spoken as more than one segment: sentence one goes to synthesis
 * the moment the model has written it, and the remainder follows. Those bytes
 * must arrive in order — the browser appends them to one playback queue and a
 * phone bridge converts them into one continuous mu-law stream, so two segments
 * interleaved is not "slightly out of order", it is noise on a live call.
 *
 * The obvious way to guarantee that is to do one segment at a time, and that is
 * what this pipeline did. It is also what put a second full TTS round trip in
 * the middle of every reply: the remainder's request was not sent until
 * sentence one had finished streaming, so its time-to-first-byte (~600ms p50,
 * measured) landed as an audible gap where sentence two should have begun —
 * even though the caller was still listening to sentence one and there was
 * nothing else for the connection to do.
 *
 * Ordering the EMISSION rather than the WORK gets both: every request goes out
 * as soon as its text exists, and each segment waits for the one before it only
 * at the point where its bytes would go on the wire.
 *
 * Usage:
 *   const order = createSegmentOrder();
 *   const slot = order.claim();      // claim BEFORE any await, to fix position
 *   ...start the request...
 *   await slot.floor;                // now this segment owns the wire
 *   ...emit...
 *   slot.release();                  // always, including on failure
 */

/**
 * @returns {{ claim: () => { floor: Promise<void>, release: () => void } }}
 */
export function createSegmentOrder() {
  // Resolves once every slot claimed so far has been released.
  let tail = Promise.resolve();

  return {
    /**
     * Take the next position in the emission order.
     *
     * MUST be called synchronously, before the caller awaits anything — the
     * position is decided by call order, and a claim made after an await would
     * be ordered by how fast a provider responded rather than by which sentence
     * came first, which is precisely the bug this prevents.
     */
    claim() {
      const floor = tail;
      let release;
      const mine = new Promise((resolve) => { release = resolve; });
      // The next claimer waits for this slot however it ends. `catch`-free by
      // construction: `mine` is only ever resolved, never rejected, so one
      // segment failing can never strand the segments behind it.
      tail = tail.then(() => mine, () => mine);
      return {
        // Never rejects — a failed predecessor still yields the floor, because
        // the alternative is a reply that stops halfway through.
        floor: floor.then(() => {}, () => {}),
        release,
      };
    },
  };
}
