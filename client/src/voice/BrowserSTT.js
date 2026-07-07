// Speech-to-text via the browser's Web Speech API (Chrome/Edge).
// Push-to-talk: start() on key down, stop() on key up; interim results are
// surfaced live so the user can watch recognition happen.

import { logEvent } from "../debug/log.js";

export class BrowserSTT {
  constructor({ onInterim, onFinal }) {
    this.onInterim = onInterim; // (text) live partial transcript
    this.onFinal = onFinal;     // (text, {durationMs, confidence, traceId})
    this.recognition = null;
    this.active = false;
    this.startedAt = 0;
    this.traceId = null;
    this.available = typeof (window.SpeechRecognition ?? window.webkitSpeechRecognition) === "function";
    if (!this.available) {
      logEvent("STT", "Web Speech API not available in this browser (use Chrome/Edge, or Whisper mode)", {
        error: "SpeechRecognition undefined",
      });
    }
  }

  start(traceId) {
    if (!this.available || this.active) return;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.lang = "en-US";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.traceId = traceId;
    this.startedAt = performance.now();
    this.active = true;

    let finalText = "";
    let confidence = null;

    this.recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalText += res[0].transcript;
          confidence = res[0].confidence;
        } else {
          interim += res[0].transcript;
        }
      }
      this.onInterim(finalText + interim);
    };

    this.recognition.onerror = (event) => {
      logEvent("STT", `Browser STT error: ${event.error}`, {
        traceId: this.traceId,
        error: event.error,
        data: {
          hint: {
            "no-speech": "No speech detected while the key was held.",
            "not-allowed": "Mic permission denied for speech recognition.",
            "network": "Web Speech API needs network access on this browser.",
            "audio-capture": "No microphone found.",
          }[event.error] ?? null,
        },
      });
    };

    this.recognition.onend = () => {
      const durationMs = Math.round(performance.now() - this.startedAt);
      this.active = false;
      const text = finalText.trim();
      if (text) {
        logEvent("STT", `Browser transcript in ${durationMs}ms: "${text}"`, {
          traceId: this.traceId,
          durationMs,
          data: { text, confidence, engine: "webspeech" },
        });
        this.onFinal(text, { durationMs, confidence, traceId: this.traceId });
      } else {
        logEvent("STT", "Browser STT ended with empty transcript", {
          traceId: this.traceId, durationMs, error: "empty transcript",
        });
        this.onInterim("");
      }
    };

    this.recognition.start();
    logEvent("STT", "Browser speech recognition started", { traceId });
  }

  stop() {
    if (this.recognition && this.active) this.recognition.stop();
  }
}
