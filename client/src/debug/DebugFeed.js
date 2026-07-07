// The debug panel: status lights, STT mode switch, mic meter, live
// transcript, command injection boxes, overlay toggles, and the grouped
// per-command pipeline trace feed.

import { onLog } from "./log.js";

const STAGE_COLORS = {
  MIC: "#7ac7ff", STT: "#6ee7b7", PARSE: "#fbbf24", COMMAND: "#f472b6",
  SQUAD: "#c4b5fd", ACTION: "#fb923c", GAME: "#9ca3af", SERVER: "#60a5fa",
  CONFIG: "#a3e635", BOOT: "#e5e7eb",
};

export class DebugFeed {
  constructor(container, { onTextCommand, onRawCommand, onSttModeChange, onModelChange, renderToggles, onTtsToggle }) {
    this.container = container;
    this.groups = new Map(); // traceId -> group body element
    this._build({ onTextCommand, onRawCommand, onSttModeChange, onModelChange, renderToggles, onTtsToggle });
    onLog((e) => this.append(e));
  }

  _build(handlers) {
    this.container.innerHTML = `
      <div class="dbg-section dbg-status">
        <span class="light" id="light-server" title="server">SRV</span>
        <span class="light" id="light-ollama" title="ollama">OLM</span>
        <span class="light" id="light-model" title="model">MDL</span>
        <span class="light" id="light-whisper" title="whisper">WSP</span>
        <span class="light" id="light-mic" title="microphone">MIC</span>
      </div>
      <div class="dbg-section">
        <label>STT <select id="stt-mode">
          <option value="browser">Browser (Web Speech)</option>
          <option value="whisper">Whisper (server)</option>
        </select></label>
        <label>Model <input id="model-name" size="10"></label>
        <label><input type="checkbox" id="tts-enabled" checked> voice</label>
      </div>
      <div class="dbg-section">
        <div class="vu-wrap"><div id="vu-bar"></div></div>
        <div id="ptt-state">hold SPACE to talk</div>
        <div id="live-transcript">&nbsp;</div>
      </div>
      <div class="dbg-section">
        <input id="text-cmd" placeholder='test a command: "alpha one move to charlie five"'>
        <input id="raw-cmd" placeholder='raw JSON: {"intent":"move","units":["all"],"grid":"C5"}'>
      </div>
      <div class="dbg-section dbg-toggles" id="overlay-toggles"></div>
      <div class="dbg-feed" id="dbg-feed"></div>
    `;

    this.feedEl = this.container.querySelector("#dbg-feed");
    this.vuBar = this.container.querySelector("#vu-bar");
    this.pttEl = this.container.querySelector("#ptt-state");
    this.transcriptEl = this.container.querySelector("#live-transcript");

    const textCmd = this.container.querySelector("#text-cmd");
    textCmd.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && textCmd.value.trim()) {
        handlers.onTextCommand(textCmd.value.trim());
        textCmd.value = "";
      }
    });

    const rawCmd = this.container.querySelector("#raw-cmd");
    rawCmd.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && rawCmd.value.trim()) {
        handlers.onRawCommand(rawCmd.value.trim());
        rawCmd.value = "";
      }
    });

    this.container.querySelector("#stt-mode").addEventListener("change", (e) => {
      handlers.onSttModeChange(e.target.value);
    });

    const modelInput = this.container.querySelector("#model-name");
    modelInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && modelInput.value.trim()) handlers.onModelChange(modelInput.value.trim());
    });
    this.modelInput = modelInput;

    this.container.querySelector("#tts-enabled").addEventListener("change", (e) => {
      handlers.onTtsToggle(e.target.checked);
    });

    // Overlay toggles bound directly to renderer.toggles
    const togglesEl = this.container.querySelector("#overlay-toggles");
    for (const key of Object.keys(handlers.renderToggles)) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = handlers.renderToggles[key];
      cb.addEventListener("change", () => (handlers.renderToggles[key] = cb.checked));
      label.append(cb, ` ${key}`);
      togglesEl.append(label);
    }
  }

  setStatus(key, ok, tooltip = "") {
    const el = this.container.querySelector(`#light-${key}`);
    if (!el) return;
    el.classList.toggle("ok", ok === true);
    el.classList.toggle("bad", ok === false);
    el.classList.toggle("warn", ok === "warn");
    if (tooltip) el.title = tooltip;
  }

  setMicLevel(level) {
    this.vuBar.style.width = `${Math.round(level * 100)}%`;
    this.vuBar.style.background = level > 0.02 ? "#6ee7b7" : "#444";
  }

  setPtt(active) {
    this.pttEl.textContent = active ? "● TRANSMITTING" : "hold SPACE to talk";
    this.pttEl.classList.toggle("active", active);
  }

  setTranscript(text) {
    this.transcriptEl.textContent = text || " ";
  }

  append(event) {
    const row = document.createElement("div");
    row.className = "feed-row" + (event.error ? " err" : "");
    const time = new Date(event.t).toLocaleTimeString("en-US", { hour12: false });
    const dur = event.durationMs != null ? ` <span class="dur">${Math.round(event.durationMs)}ms</span>` : "";
    const src = event.source === "server" ? `<span class="src">srv</span>` : "";
    row.innerHTML =
      `<span class="ts">${time}</span>` +
      `<span class="stage" style="color:${STAGE_COLORS[event.stage] ?? "#ddd"}">${event.stage}</span>` +
      `${src}<span class="msg"></span>${dur}`;
    row.querySelector(".msg").textContent = event.message;

    if (event.data || event.error) {
      const detail = document.createElement("pre");
      detail.className = "feed-detail";
      detail.style.display = "none";
      detail.textContent = JSON.stringify({ error: event.error, ...((typeof event.data === "object" && event.data) || {}) }, null, 2);
      row.addEventListener("click", () => {
        detail.style.display = detail.style.display === "none" ? "block" : "none";
      });
      row.classList.add("expandable");
      row.append(detail);
    }

    if (event.traceId) {
      let group = this.groups.get(event.traceId);
      if (!group) {
        group = document.createElement("div");
        group.className = "feed-group";
        group.innerHTML = `<div class="group-hdr">${event.traceId}</div>`;
        this.feedEl.append(group);
        this.groups.set(event.traceId, group);
      }
      group.append(row);
    } else {
      this.feedEl.append(row);
    }

    // Trim and autoscroll
    while (this.feedEl.children.length > 400) this.feedEl.firstChild.remove();
    this.feedEl.scrollTop = this.feedEl.scrollHeight;
  }
}
