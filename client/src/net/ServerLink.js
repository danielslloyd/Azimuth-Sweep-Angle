// WebSocket link to the server's log bus: server-side pipeline events (PARSE,
// STT, CONFIG…) stream into the same debug feed as client events. Also used
// as the "server up" status signal. Reconnects automatically.

import { logEvent } from "../debug/log.js";

export class ServerLink {
  constructor(onStatusChange) {
    this.onStatusChange = onStatusChange; // (connected: bool)
    this.ws = null;
    this.connected = false;
    this._reconnectDelay = 1000;
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      this._reconnectDelay = 1000;
      this.onStatusChange(true);
      logEvent("SERVER", "Connected to server log bus");
    };

    this.ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        if (payload.type === "log") {
          const e = payload.event;
          logEvent(e.stage, e.message, {
            source: "server",
            traceId: e.traceId,
            durationMs: e.durationMs,
            data: e.data,
            error: e.error,
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      if (this.connected) logEvent("SERVER", "Lost connection to server log bus", { error: "ws closed" });
      this.connected = false;
      this.onStatusChange(false);
      setTimeout(() => this.connect(), this._reconnectDelay);
      this._reconnectDelay = Math.min(10000, this._reconnectDelay * 1.5);
    };

    this.ws.onerror = () => this.ws.close();
  }
}
