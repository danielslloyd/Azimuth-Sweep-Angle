// Squad voices via browser speechSynthesis. Each soldier gets a slightly
// different pitch/rate so callsigns are distinguishable by ear. Every spoken
// line is also logged (stage SQUAD) so audio problems never hide content.

import { logEvent } from "../debug/log.js";

const VOICE_PARAMS = {
  "alpha-1": { pitch: 0.85, rate: 1.05 },
  "alpha-2": { pitch: 1.0, rate: 1.1 },
  "alpha-3": { pitch: 0.7, rate: 1.0 },
  "alpha-4": { pitch: 1.15, rate: 1.15 },
  overlord: { pitch: 0.6, rate: 0.95 },
};

export class TTS {
  constructor() {
    this.available = "speechSynthesis" in window;
    this.enabled = true;
    this.voice = null;
    if (!this.available) {
      logEvent("SQUAD", "speechSynthesis not available — squad replies will be text-only", {
        error: "speechSynthesis undefined",
      });
      return;
    }
    const pickVoice = () => {
      const voices = speechSynthesis.getVoices();
      this.voice =
        voices.find((v) => v.lang.startsWith("en") && v.localService) ??
        voices.find((v) => v.lang.startsWith("en")) ??
        voices[0] ?? null;
      if (this.voice) logEvent("SQUAD", `TTS voice: ${this.voice.name}`);
    };
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  say(speakerId, text, traceId) {
    logEvent("SQUAD", `${speakerId}: "${text}"`, { traceId, data: { speaker: speakerId, text } });
    if (!this.available || !this.enabled) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    const params = VOICE_PARAMS[speakerId] ?? { pitch: 1, rate: 1 };
    u.pitch = params.pitch;
    u.rate = params.rate;
    u.onerror = (e) => logEvent("SQUAD", `TTS playback error for ${speakerId}`, { traceId, error: e.error });
    speechSynthesis.speak(u);
  }
}
