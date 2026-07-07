# Project Overwatch

A voice-controlled tactical squad game. You are the drone operator: speak orders to a
4-man squad, call airstrikes, and warn them about threats. A **local LLM (via Ollama)**
parses your natural-language commands into structured squad orders.

Built debug-first: simple shapes, every vision cone and awareness state visualized, and
every stage of the voice → action pipeline logged in an on-screen debug feed.

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com) running locally with a small model pulled
  (default: `llama3:8b` — `ollama pull llama3:8b`)
- A Chromium-based browser (Chrome/Edge) for the default browser speech recognition
- Optional: `pip install faster-whisper` for fully local server-side STT

## Quick start

```bash
pip install -r requirements.txt
python -m uvicorn server.main:app --port 8000
# then open http://localhost:8000
```

Or `start.bat` (Windows) / `./start.sh`.

## How it works

```
MIC (hold Space to talk, VU meter)
 → STT       browser Web Speech API (default) or server faster-whisper (toggle in panel)
 → PARSE     server → Ollama chat with JSON-schema output → validated command
 → COMMAND   dispatched to the game, or a spoken clarification request
 → SQUAD     verbal acknowledgment (browser speechSynthesis)
 → ACTION    pathing, movement, engagements
```

The game simulation runs entirely in the browser. The Python server serves the client,
proxies command parsing to Ollama, and (optionally) runs Whisper. Server log events are
mirrored over WebSocket into the browser debug feed, so the whole chain is one trace.

## Voice commands (examples)

- "Alpha one, move to grid Charlie five"
- "Squad, hold position" / "Weapons free" / "Cease fire"
- "Airstrike on Delta seven"
- "Enemies approaching from the southeast" — raises squad suspicion of that direction;
  they orient and take cover, but only get precise targets on visual contact
- "New objective: clear the buildings at hotel eight"

## Squad autonomy

The squad knows its mission goal and acts on its own: advancing cautiously when idle,
reporting contacts, engaging, and seeking cover facing known threats. Your commands
steer them; they don't wait for micromanagement.

## Debugging

Everything is visible:

- **Debug feed** (right panel): every command as a grouped trace — transcript, exact
  LLM prompt and raw reply, validated command JSON, per-stage latency, errors.
- **Text command box**: type a command to test LLM parsing without the mic.
- **Raw command box**: inject command JSON directly, bypassing the LLM.
- **Status lights**: server WebSocket, Ollama reachability, model availability, Whisper.
- **Overlays** (toggleable): sight cones for all units, squad awareness rings
  (solid = seen now, hollow ghost = last known, wedge = suspected direction), paths,
  cover positions, airstrike blast circles, LOS rays.

## Structure

```
/server   FastAPI: static serving, /api/parse (Ollama), /api/stt (Whisper), /ws (log bus)
/client   vanilla JS + Canvas 2D, no build step
  /src/voice     STT engines, TTS, mic meter
  /src/command   pipeline traces + command schema
  /src/game      world, LOS, units, squad AI, awareness, enemy AI, combat, airstrikes
  /src/render    Canvas renderer + overlays
  /src/debug     debug feed UI
```
