// AudioWorklet processor for the Conversational Agent web call.
// Converts the mic's Float32 samples to little-endian PCM16 and posts them to
// the main thread, which forwards each block as a binary WebSocket frame
// (see modularCallSocket.ts and xaiCallSocket.ts).
//
// WHY THIS BATCHES
//
// `process()` is called once per render quantum — 128 samples, which at the
// browser's usual 48kHz is every 2.67ms. Posting each quantum meant 375
// messages a second per call, and every one of them became its own WebSocket
// frame to the server, its own 'message' event on the server's single event
// loop, and its own re-send to the speech recogniser: about 1,125 discrete
// events per second, per call, each carrying 256 bytes of audio inside a TLS
// record with ~29 bytes of framing of its own.
//
// At 45 concurrent calls on one Node process that is roughly 50,000 events a
// second, which is the shape of the "bulk campaigns are slower than a single
// call" problem — the work is not the audio, it is the per-frame overhead
// around it.
//
// Batching to 20ms cuts that by 7.5x and costs NOTHING in latency, because
// nothing downstream resolves finer than 20ms: the recogniser's own endpointing
// window is measured in hundreds of milliseconds, and the telephony side of
// this product is built on 20ms frames throughout. 20ms is also the floor the
// speech APIs ask for — sending smaller chunks is explicitly discouraged.
//
// Deliberately NOT also downsampling here. 48kHz -> 16kHz would cut bandwidth
// by two thirds, but decimating without a proper anti-aliasing filter folds
// high-frequency energy back into the speech band, and a worse transcript costs
// a whole extra turn. If that saving is wanted later, the clean way is to ask
// for the rate at the source (`new AudioContext({ sampleRate: 16000 })`), where
// the browser applies a real resampler.

// One frame of audio, in milliseconds. Matches the telephony frame size used
// across the rest of the pipeline.
const FRAME_MS = 20;

class XaiMicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is a global in AudioWorkletGlobalScope and is fixed for the
    // lifetime of the context, so the frame size can be computed once.
    this._frameSamples = Math.max(128, Math.round((sampleRate * FRAME_MS) / 1000));
    this._buffer = new Int16Array(this._frameSamples);
    this._filled = 0;
  }

  process(inputs) {
    const channelData = inputs[0] && inputs[0][0];
    // No input connected yet (or a silent render). Keep the processor alive —
    // returning false would permanently remove it from the graph.
    if (!channelData || !channelData.length) return true;

    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      this._buffer[this._filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      if (this._filled === this._frameSamples) {
        // Transfer a copy: the buffer is reused for the next frame, and a
        // transferred ArrayBuffer would be detached out from under it.
        const frame = this._buffer.slice();
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this._filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('xai-mic-capture', XaiMicCaptureProcessor);
