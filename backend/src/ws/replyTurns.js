// backend/src/ws/replyTurns.js
/**
 * Which reply a web call is streaming, and whether it has been told to stop.
 *
 * The modular web handler used to keep this as two call-wide booleans:
 * `turnActive` and `bargeRequested`. A barge set the flag; the NEXT turn's
 * runTurn() reset it to false before starting. But voiceTurnStream only looks
 * at shouldAbort() between awaits, so the interrupted reply can still be alive
 * when the browser's next 'end-turn' lands — and resetting the shared flag
 * un-aborted it. Both replies then streamed audio into one socket at once, and
 * the older reply's `finally` cleared `turnActive` while the newer one was
 * still speaking, so a barge during the newer reply was ignored.
 *
 * Each reply now carries its own abort flag. A barge stops the reply that is
 * streaming now; starting a new reply supersedes whatever is still streaming
 * (the caller has spoken again, so it is stale); and ending a reply only clears
 * "active" if it is still the current one.
 */

export function createReplyTurns() {
  let current = null;

  return {
    /** A reply is starting. Returns its handle; `handle.aborted` is its shouldAbort. */
    begin() {
      if (current) current.aborted = true;
      const reply = { aborted: false };
      current = reply;
      return reply;
    },

    /** The caller cut in. Stops the reply streaming now, if any. */
    barge() {
      if (!current) return false;
      current.aborted = true;
      return true;
    },

    /** A reply's stream has finished — only the current one clears `active`. */
    end(reply) {
      if (current === reply) current = null;
    },

    /** Is a reply being generated or streamed right now? */
    get active() {
      return current !== null;
    },
  };
}
