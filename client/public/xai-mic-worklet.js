// AudioWorklet processor for the xAI Conversational Agent Web Call.
// Converts the mic's Float32 samples to little-endian PCM16 and posts each
// ~128-frame block to the main thread, which forwards it as a binary
// WebSocket frame to the xAI Voice Agent bridge (see xaiCallSocket.ts).
class XaiMicCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channelData = inputs[0] && inputs[0][0];
    if (channelData && channelData.length) {
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}

registerProcessor('xai-mic-capture', XaiMicCaptureProcessor);
