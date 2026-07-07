// Whisper-mode STT: record the whole push-to-talk utterance with
// MediaRecorder, POST the blob to the server, get a transcript back.

import { CONFIG } from "../config.js";
import { logEvent } from "../debug/log.js";

export class RecorderSTT {
  constructor({ onFinal, onInterim }) {
    this.onFinal = onFinal;
    this.onInterim = onInterim;
    this.recorder = null;
    this.chunks = [];
    this.traceId = null;
    this.startedAt = 0;
    this.stream = null; // shared getUserMedia stream, set by main
  }

  start(traceId) {
    if (!this.stream) {
      logEvent("STT", "Whisper mode: no microphone stream available", { traceId, error: "no stream" });
      return;
    }
    if (this.recorder?.state === "recording") return;
    this.traceId = traceId;
    this.startedAt = performance.now();
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this._send();
    this.recorder.start();
    this.onInterim("[recording for Whisper…]");
    logEvent("STT", `Recording started (${mime})`, { traceId });
  }

  stop() {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  async _send() {
    const blob = new Blob(this.chunks, { type: this.recorder.mimeType });
    const recordMs = Math.round(performance.now() - this.startedAt);
    logEvent("STT", `Recorded ${blob.size} bytes in ${recordMs}ms, sending to server Whisper`, {
      traceId: this.traceId, data: { bytes: blob.size, mime: blob.type },
    });
    this.onInterim("[transcribing…]");
    try {
      const resp = await fetch(
        `${CONFIG.SERVER}/api/stt?traceId=${encodeURIComponent(this.traceId)}`,
        { method: "POST", headers: { "Content-Type": blob.type }, body: blob }
      );
      const result = await resp.json();
      if (result.ok && result.text) {
        this.onFinal(result.text, {
          durationMs: result.durationMs,
          confidence: null,
          traceId: this.traceId,
        });
      } else {
        logEvent("STT", "Whisper returned no transcript", {
          traceId: this.traceId,
          error: result.error ?? "empty transcript",
          data: result,
        });
        this.onInterim("");
      }
    } catch (e) {
      logEvent("STT", "Failed to reach server /api/stt", {
        traceId: this.traceId, error: `${e.name}: ${e.message}`,
      });
      this.onInterim("");
    }
  }
}
