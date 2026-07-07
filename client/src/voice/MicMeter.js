// Live microphone level meter. Exists to answer the very first debugging
// question: "is any audio reaching the browser at all?"

import { logEvent } from "../debug/log.js";

export class MicMeter {
  constructor(onLevel) {
    this.onLevel = onLevel; // (0..1) called ~30x/s
    this.stream = null;
    this.analyser = null;
    this.raf = null;
    this.available = false;
  }

  async init() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = this.stream.getAudioTracks()[0];
      logEvent("MIC", `Microphone opened: "${track.label}"`, {
        data: track.getSettings(),
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);
      this.available = true;
      this._loop();
      return true;
    } catch (e) {
      logEvent("MIC", "Microphone unavailable", { error: `${e.name}: ${e.message}` });
      return false;
    }
  }

  _loop() {
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      this.analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      this.onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
