// Boot and wiring: debug UI first (so every later step is logged), then
// health checks, server link, game, renderer, voice, and the pipeline.

import { CONFIG } from "./config.js";
import { logEvent, newTraceId } from "./debug/log.js";
import { DebugFeed } from "./debug/DebugFeed.js";
import { Game } from "./game/Game.js";
import { MAP01 } from "./game/maps/map01.js";
import { Renderer } from "./render/Renderer.js";
import { Pipeline } from "./command/Pipeline.js";
import { ServerLink } from "./net/ServerLink.js";
import { TTS } from "./voice/TTS.js";
import { MicMeter } from "./voice/MicMeter.js";
import { BrowserSTT } from "./voice/BrowserSTT.js";
import { RecorderSTT } from "./voice/RecorderSTT.js";

const canvas = document.getElementById("game-canvas");
const renderer = new Renderer(canvas);
const tts = new TTS();

// --- game + pipeline (game is recreated on restart) -------------------------

const say = (speakerId, text, traceId) => tts.say(speakerId ?? "overlord", text, traceId);
let game = new Game(MAP01, say);
const pipeline = new Pipeline(game, say);

function restart() {
  logEvent("GAME", "Restarting mission");
  game = new Game(MAP01, say);
  pipeline.game = game;
}

// --- debug panel -------------------------------------------------------------

let sttMode = "browser";

const feed = new DebugFeed(document.getElementById("debug-pane"), {
  onTextCommand: (text) => {
    logEvent("STT", `(debug text input, STT bypassed): "${text}"`);
    pipeline.handleTranscript(text);
  },
  onRawCommand: (text) => {
    try {
      const cmd = JSON.parse(text);
      logEvent("COMMAND", "(debug raw injection, LLM bypassed)", { data: cmd });
      pipeline.dispatch(cmd);
    } catch (e) {
      logEvent("COMMAND", "Raw command is not valid JSON", { error: e.message });
    }
  },
  onSttModeChange: (mode) => {
    sttMode = mode;
    logEvent("CONFIG", `STT mode: ${mode}`);
    if (mode === "whisper" && !micMeter.stream) {
      logEvent("STT", "Whisper mode needs mic access — none granted", { error: "no mic stream" });
    }
  },
  onModelChange: async (model) => {
    try {
      const resp = await fetch(`${CONFIG.SERVER}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const cfg = await resp.json();
      logEvent("CONFIG", `Parser model set to ${cfg.model}`);
      checkHealth();
    } catch (e) {
      logEvent("CONFIG", "Failed to update model", { error: e.message });
    }
  },
  onTtsToggle: (enabled) => {
    tts.enabled = enabled;
    logEvent("CONFIG", `Squad voice ${enabled ? "enabled" : "muted"}`);
  },
  renderToggles: renderer.toggles,
});

logEvent("BOOT", "Client booted, initializing subsystems…");

// --- server link + health ------------------------------------------------------

const link = new ServerLink((connected) => feed.setStatus("server", connected));
link.connect();

async function checkHealth() {
  try {
    const resp = await fetch(`${CONFIG.SERVER}/api/health`);
    const h = await resp.json();
    feed.setStatus("ollama", h.ollama.ollama, h.ollama.error ?? "Ollama reachable");
    feed.setStatus(
      "model",
      h.ollama.modelAvailable,
      h.ollama.modelAvailable
        ? `${h.ollama.model} available`
        : `${h.ollama.model} NOT in: ${(h.ollama.installedModels ?? []).join(", ") || "n/a"}`
    );
    const wsp = h.whisper.state === "ready" ? true : h.whisper.state === "unloaded" ? "warn" : false;
    feed.setStatus("whisper", wsp, `whisper: ${h.whisper.state}${h.whisper.error ? " — " + h.whisper.error : ""}`);
    if (!h.ollama.ollama) {
      logEvent("BOOT", "Ollama is not reachable — voice commands will fail at PARSE", { error: h.ollama.error });
    } else if (!h.ollama.modelAvailable) {
      logEvent("BOOT", `Model ${h.ollama.model} not installed — run: ollama pull ${h.ollama.model}`, { error: "model missing" });
    }
  } catch (e) {
    feed.setStatus("ollama", false, "health check failed");
    feed.setStatus("model", false, "health check failed");
    logEvent("BOOT", "Health check failed — is the server running?", { error: e.message });
  }
}
checkHealth();
setInterval(checkHealth, 15000);

fetch(`${CONFIG.SERVER}/api/config`)
  .then((r) => r.json())
  .then((cfg) => {
    feed.modelInput.value = cfg.model;
    logEvent("CONFIG", `Server config: model=${cfg.model}, ollama=${cfg.ollamaUrl}`);
  })
  .catch(() => {});

// --- voice -----------------------------------------------------------------------

const micMeter = new MicMeter((level) => feed.setMicLevel(level));

const onFinalTranscript = (text, { traceId }) => {
  feed.setTranscript(text);
  pipeline.handleTranscript(text, traceId);
};

const browserSTT = new BrowserSTT({
  onInterim: (t) => feed.setTranscript(t),
  onFinal: onFinalTranscript,
});
const recorderSTT = new RecorderSTT({
  onInterim: (t) => feed.setTranscript(t),
  onFinal: onFinalTranscript,
});

micMeter.init().then((ok) => {
  feed.setStatus("mic", ok);
  recorderSTT.stream = micMeter.stream;
});

// --- push-to-talk + hotkeys -------------------------------------------------------

let ptt = false;
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.code === "Space" && !e.repeat && !ptt) {
    e.preventDefault();
    ptt = true;
    feed.setPtt(true);
    feed.setTranscript("");
    const traceId = newTraceId();
    logEvent("MIC", `Push-to-talk DOWN (mode: ${sttMode})`, { traceId });
    (sttMode === "browser" ? browserSTT : recorderSTT).start(traceId);
  } else if (e.code === "Space") {
    e.preventDefault();
  } else if (e.code === "KeyR" && game.state !== "playing") {
    restart();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && ptt) {
    e.preventDefault();
    ptt = false;
    feed.setPtt(false);
    logEvent("MIC", "Push-to-talk UP");
    (sttMode === "browser" ? browserSTT : recorderSTT).stop();
  }
});

// --- main loop (fixed-step simulation) --------------------------------------------

// Simulation runs on a timer (not rAF) so it keeps advancing when the tab is
// hidden — rAF is paused in background tabs. Rendering stays on rAF.
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(2, (now - last) / 1000); // catch up after throttling, cap 2s
  last = now;
  while (acc >= STEP) {
    game.tick(STEP);
    acc -= STEP;
  }
}, 1000 / 60);

function frame() {
  renderer.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Console handle for poking at live state while debugging
window.overwatch = {
  get game() { return game; },
  pipeline, renderer, restart,
};

logEvent("BOOT", "Ready. Hold SPACE and speak, or type a test command in the panel →");
