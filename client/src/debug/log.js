// Central client-side log bus. Every pipeline stage and game event goes
// through logEvent(); the DebugFeed subscribes, and everything is mirrored
// to the browser console.
//
// Stages: MIC, STT, PARSE, COMMAND, SQUAD, ACTION, GAME, SERVER, CONFIG, BOOT

const subscribers = [];

export function onLog(fn) {
  subscribers.push(fn);
}

export function logEvent(stage, message, opts = {}) {
  const event = {
    source: opts.source || "client",
    stage,
    message,
    traceId: opts.traceId || null,
    t: Date.now(),
    durationMs: opts.durationMs ?? null,
    data: opts.data ?? null,
    error: opts.error ?? null,
  };
  const line = `[${stage}] ${message}`;
  if (event.error) console.error(line, event.error, event.data ?? "");
  else console.log(line, event.data ?? "");
  for (const fn of subscribers) fn(event);
  return event;
}

let traceCounter = 0;
export function newTraceId() {
  traceCounter += 1;
  return `cmd-${Date.now().toString(36)}-${traceCounter}`;
}
