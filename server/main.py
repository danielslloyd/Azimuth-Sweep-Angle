"""Project Overwatch server.

Serves the browser client, proxies command parsing to Ollama, optionally runs
faster-whisper STT, and mirrors all server-side pipeline events to the browser
debug feed over /ws.

Run: python -m uvicorn server.main:app --port 8000
"""

import logging
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .llm_parser import parser
from .log_bus import bus
from .whisper_stt import stt

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

CLIENT_DIR = Path(__file__).resolve().parent.parent / "client"

app = FastAPI(title="Project Overwatch")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseRequest(BaseModel):
    text: str
    traceId: str | None = None


class ConfigUpdate(BaseModel):
    model: str | None = None


@app.get("/api/health")
async def health():
    ollama = await parser.check_health()
    return {
        "server": True,
        "ollama": ollama,
        "whisper": {
            "state": stt.state,
            "model": stt.model_name,
            "error": stt.load_error,
        },
    }


@app.get("/api/config")
async def get_config():
    return {
        "model": parser.model,
        "ollamaUrl": parser.ollama_url,
        "whisperModel": stt.model_name,
    }


@app.post("/api/config")
async def set_config(update: ConfigUpdate):
    if update.model:
        old = parser.model
        parser.model = update.model
        await bus.emit("CONFIG", f"Parser model changed: {old} -> {update.model}")
    return await get_config()


@app.post("/api/parse")
async def parse_command(req: ParseRequest):
    await bus.emit(
        "PARSE", f"Sending to {parser.model}: \"{req.text}\"",
        trace_id=req.traceId, data={"text": req.text},
    )
    result = await parser.parse(req.text)
    if result["ok"]:
        await bus.emit(
            "PARSE",
            f"Parsed OK in {result['durationMs']}ms: {result['command']}",
            trace_id=req.traceId,
            duration_ms=result["durationMs"],
            data={"command": result["command"], "rawResponse": result["rawResponse"]},
        )
    else:
        await bus.emit(
            "PARSE", "Parse failed",
            trace_id=req.traceId,
            duration_ms=result["durationMs"],
            data={"rawResponse": result["rawResponse"],
                  "validationErrors": result["validationErrors"]},
            error=result["error"],
        )
    return result


@app.post("/api/stt")
async def transcribe(request: Request, traceId: str | None = None):
    audio = await request.body()
    content_type = request.headers.get("content-type", "audio/webm")
    suffix = ".ogg" if "ogg" in content_type else ".webm"
    await bus.emit(
        "STT", f"Received {len(audio)} bytes of audio ({content_type})",
        trace_id=traceId,
    )
    result = await stt.transcribe(audio, suffix=suffix)
    if result["ok"]:
        await bus.emit(
            "STT", f"Whisper transcript in {result['durationMs']}ms: \"{result['text']}\"",
            trace_id=traceId, duration_ms=result["durationMs"], data=result,
        )
    else:
        await bus.emit(
            "STT", "Whisper transcription failed",
            trace_id=traceId, duration_ms=result["durationMs"], error=result["error"],
        )
    return result


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    await bus.register(ws)
    await bus.emit("SERVER", "Browser connected to log bus")
    try:
        while True:
            # Keep the connection alive; client -> server messages are ignored
            # (client-side events are logged in the browser directly).
            await ws.receive_text()
    except WebSocketDisconnect:
        bus.unregister(ws)


# Static client — mounted last so /api and /ws take priority.
app.mount("/", StaticFiles(directory=str(CLIENT_DIR), html=True, check_dir=False), name="client")
