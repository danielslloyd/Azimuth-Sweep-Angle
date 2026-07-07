"""Mirrors server-side pipeline log events to all connected browser clients.

Every event is also written to the Python logger, so the chain is debuggable
from the terminal even if no browser is connected.
"""

import asyncio
import json
import logging
import time

logger = logging.getLogger("overwatch")


class LogBus:
    def __init__(self):
        self.clients: set = set()  # fastapi WebSocket objects
        self.history: list[dict] = []  # last N events, replayed to new clients
        self.max_history = 200

    async def register(self, ws):
        self.clients.add(ws)
        for event in self.history[-50:]:
            try:
                await ws.send_text(json.dumps({"type": "log", "event": event}))
            except Exception:
                break

    def unregister(self, ws):
        self.clients.discard(ws)

    async def emit(
        self,
        stage: str,
        message: str,
        trace_id: str | None = None,
        duration_ms: float | None = None,
        data: dict | None = None,
        error: str | None = None,
    ):
        event = {
            "source": "server",
            "stage": stage,
            "message": message,
            "traceId": trace_id,
            "t": time.time() * 1000,
            "durationMs": duration_ms,
            "data": data,
            "error": error,
        }
        self.history.append(event)
        if len(self.history) > self.max_history:
            self.history = self.history[-self.max_history :]

        level = logging.ERROR if error else logging.INFO
        logger.log(level, "[%s] %s%s", stage, message, f" | {error}" if error else "")

        payload = json.dumps({"type": "log", "event": event})
        dead = []
        for ws in self.clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    def emit_soon(self, *args, **kwargs):
        """Fire-and-forget emit from sync code."""
        asyncio.get_event_loop().create_task(self.emit(*args, **kwargs))


bus = LogBus()
