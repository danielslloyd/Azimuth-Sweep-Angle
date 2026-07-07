"""Parses natural-language squad commands into structured orders via a local
Ollama model, using schema-constrained JSON output.

Everything about the exchange (prompt, raw reply, validation result, latency)
is returned to the caller so the client debug feed can show the full picture.
"""

import json
import os
import re
import time

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OVERWATCH_MODEL", "llama3:8b")

INTENTS = [
    "move", "advance", "hold", "engage", "cease_fire", "airstrike",
    "alert", "set_goal", "status", "unclear",
]
UNITS = ["alpha-1", "alpha-2", "alpha-3", "alpha-4", "all"]
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", ""]
GRID_RE = re.compile(r"^[A-J](10|[1-9])$")

# Schema passed to Ollama's structured-output `format` field. All fields are
# required (with "" meaning not-applicable) to keep the constrained grammar
# simple and reliable on small models.
COMMAND_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": INTENTS},
        "units": {"type": "array", "items": {"type": "string", "enum": UNITS}},
        "grid": {"type": "string"},
        "direction": {"type": "string", "enum": DIRECTIONS},
        "goal": {"type": "string"},
        "question": {"type": "string"},
    },
    "required": ["intent", "units", "grid", "direction", "goal", "question"],
}

SYSTEM_PROMPT = """You convert a squad leader's spoken orders into JSON commands for a tactical game.

The battlefield is a grid: columns A-J (west to east), rows 1-10 (north to south).
Grid references are spoken with NATO phonetics and number words: "charlie five" = "C5",
"hotel ten" = "H10". The squad has four riflemen: alpha-1, alpha-2, alpha-3, alpha-4.
"Alpha one" / "alpha 1" = alpha-1. "Squad" / "team" / "everyone" / "alpha team" = all.
If no unit is named, assume all.

Intents:
- move: go to a specific grid square (requires grid)
- advance: continue the mission / push toward the objective, no specific grid ("move out", "advance", "continue", "push up")
- hold: stop and hold position
- engage: weapons free, fire at will
- cease_fire: stop shooting
- airstrike: precision strike on a grid square (requires grid; units field is ignored)
- alert: a warning about enemies, e.g. "contacts to the southeast" (set direction; grid optional if the leader names one)
- set_goal: a new mission objective, e.g. "new objective: clear the compound at H8" (put the objective in goal, include grid if named)
- status: the leader asks for a situation report
- unclear: you cannot determine the order; put a short clarifying question in question

Fill unused string fields with "". Direction is one of N NE E SE S SW W NW or "".
The text comes from speech recognition and may contain small transcription errors —
interpret charitably ("alfa to sea for" = alpha-2, C4).

Examples:
"alpha one move to grid charlie five" -> {"intent":"move","units":["alpha-1"],"grid":"C5","direction":"","goal":"","question":""}
"everyone hold position" -> {"intent":"hold","units":["all"],"grid":"","direction":"","goal":"","question":""}
"squad move out" -> {"intent":"advance","units":["all"],"grid":"","direction":"","goal":"","question":""}
"hit delta seven with an airstrike" -> {"intent":"airstrike","units":["all"],"grid":"D7","direction":"","goal":"","question":""}
"enemies approaching from the southeast" -> {"intent":"alert","units":["all"],"grid":"","direction":"SE","goal":"","question":""}
"two and three push up to echo two" -> {"intent":"move","units":["alpha-2","alpha-3"],"grid":"E2","direction":"","goal":"","question":""}
"do the thing" -> {"intent":"unclear","units":["all"],"grid":"","direction":"","goal":"","question":"Say again? What do you want us to do?"}

Respond with the JSON command only."""


class LLMParser:
    def __init__(self):
        self.model = DEFAULT_MODEL
        self.ollama_url = OLLAMA_URL
        self.client = httpx.AsyncClient(timeout=60.0)

    async def parse(self, text: str) -> dict:
        """Returns a result dict with full debug detail; never raises."""
        started = time.monotonic()
        result = {
            "ok": False,
            "command": None,
            "input": text,
            "model": self.model,
            "prompt": SYSTEM_PROMPT,
            "rawResponse": None,
            "validationErrors": [],
            "durationMs": None,
            "error": None,
        }
        try:
            resp = await self.client.post(
                f"{self.ollama_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": text},
                    ],
                    "format": COMMAND_SCHEMA,
                    "stream": False,
                    "keep_alive": "30m",  # avoid mid-game model unload stalls
                    "options": {"temperature": 0.0},
                },
            )
            resp.raise_for_status()
            body = resp.json()
            raw = body.get("message", {}).get("content", "")
            result["rawResponse"] = raw
            command = json.loads(raw)
            errors = self._validate(command)
            result["validationErrors"] = errors
            if errors:
                result["error"] = f"Command failed validation: {'; '.join(errors)}"
            else:
                result["ok"] = True
                result["command"] = command
        except httpx.ConnectError:
            result["error"] = (
                f"Cannot reach Ollama at {self.ollama_url}. Is `ollama serve` running?"
            )
        except httpx.HTTPStatusError as e:
            detail = e.response.text[:500]
            result["error"] = f"Ollama returned HTTP {e.response.status_code}: {detail}"
        except json.JSONDecodeError as e:
            result["error"] = f"Model output was not valid JSON: {e}"
        except Exception as e:
            result["error"] = f"{type(e).__name__}: {e}"

        result["durationMs"] = round((time.monotonic() - started) * 1000, 1)
        return result

    def _validate(self, cmd: dict) -> list[str]:
        errors = []
        if not isinstance(cmd, dict):
            return ["command is not an object"]
        intent = cmd.get("intent")
        if intent not in INTENTS:
            errors.append(f"unknown intent {intent!r}")
        units = cmd.get("units")
        if not isinstance(units, list):
            errors.append("units must be an array")
        elif not units:
            cmd["units"] = ["all"]  # unspecified -> whole squad
        else:
            bad = [u for u in units if u not in UNITS]
            if bad:
                errors.append(f"unknown units {bad}")
        grid = cmd.get("grid", "")
        if grid and not GRID_RE.match(grid.upper()):
            errors.append(f"bad grid reference {grid!r} (expected A1..J10)")
        elif grid:
            cmd["grid"] = grid.upper()
        if cmd.get("direction", "") not in DIRECTIONS:
            errors.append(f"bad direction {cmd.get('direction')!r}")
        if intent in ("move", "airstrike") and not grid:
            errors.append(f"intent {intent!r} requires a grid reference")
        return errors

    async def check_health(self) -> dict:
        """Reports Ollama reachability and whether the configured model exists."""
        try:
            resp = await self.client.get(f"{self.ollama_url}/api/tags", timeout=5.0)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            base = self.model.split(":")[0]
            available = self.model in models or any(
                m == self.model or m.split(":")[0] == base for m in models
            )
            return {
                "ollama": True,
                "model": self.model,
                "modelAvailable": available,
                "installedModels": models,
            }
        except Exception as e:
            return {
                "ollama": False,
                "model": self.model,
                "modelAvailable": False,
                "error": f"{type(e).__name__}: {e}",
            }


parser = LLMParser()
