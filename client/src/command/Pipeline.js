// The command pipeline: transcript -> server LLM parse -> validation ->
// game dispatch. Owns traceIds so the debug feed can group every stage of
// one spoken command together.

import { CONFIG } from "../config.js";
import { logEvent, newTraceId } from "../debug/log.js";
import { validateCommand } from "./schema.js";

export class Pipeline {
  constructor(game, say) {
    this.game = game; // swapped on restart
    this.say = say;
  }

  // Entry point from STT (or the debug text box).
  async handleTranscript(text, traceId = null) {
    traceId = traceId ?? newTraceId();
    const started = performance.now();
    logEvent("PARSE", `Requesting parse: "${text}"`, { traceId, data: { text } });

    let result;
    try {
      const resp = await fetch(`${CONFIG.SERVER}/api/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, traceId }),
      });
      result = await resp.json();
    } catch (e) {
      logEvent("PARSE", "Could not reach server /api/parse", {
        traceId, error: `${e.name}: ${e.message}`,
        data: { hint: "Is the Python server running on this origin?" },
      });
      this.say(null, "Command link is down.", traceId);
      return;
    }

    const durationMs = Math.round(performance.now() - started);
    if (!result.ok) {
      logEvent("PARSE", `Parse failed after ${durationMs}ms`, {
        traceId, durationMs, error: result.error,
        data: { rawResponse: result.rawResponse, validationErrors: result.validationErrors },
      });
      this.say(null, "Say again? I didn't copy.", traceId);
      return;
    }

    logEvent("PARSE", `Parsed in ${durationMs}ms (LLM ${result.durationMs}ms): ${JSON.stringify(result.command)}`, {
      traceId, durationMs, data: { command: result.command, llmMs: result.durationMs },
    });
    this.dispatch(result.command, traceId);
  }

  // Entry point for raw command JSON (debug injection) — same validation.
  dispatch(cmd, traceId = null) {
    traceId = traceId ?? newTraceId();
    const errors = validateCommand(cmd);
    if (errors.length) {
      logEvent("COMMAND", "Rejected invalid command", {
        traceId, error: errors.join("; "), data: { command: cmd },
      });
      this.say(null, "Say again? I didn't copy.", traceId);
      return;
    }
    this.game.applyCommand(cmd, traceId);
  }
}
