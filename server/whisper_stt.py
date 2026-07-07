"""Optional server-side STT using faster-whisper.

Lazy-loaded: the model (and CUDA) is only touched the first time the client
actually sends audio in Whisper mode. Browser-STT-only sessions never pay the
cost. If faster-whisper is not installed, transcribe() reports that clearly
instead of crashing the server.
"""

import asyncio
import os
import tempfile
import time

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small.en")


class WhisperSTT:
    def __init__(self):
        self.model = None
        self.model_name = WHISPER_MODEL
        self.state = "unloaded"  # unloaded | loading | ready | error | not_installed
        self.load_error: str | None = None
        self._lock = asyncio.Lock()

    def _load_sync(self):
        from faster_whisper import WhisperModel

        try:
            return WhisperModel(self.model_name, device="cuda", compute_type="float16")
        except Exception:
            # No CUDA / driver mismatch — fall back to CPU rather than failing.
            return WhisperModel(self.model_name, device="cpu", compute_type="int8")

    async def ensure_loaded(self) -> bool:
        async with self._lock:
            if self.state == "ready":
                return True
            try:
                import faster_whisper  # noqa: F401
            except ImportError:
                self.state = "not_installed"
                self.load_error = (
                    "faster-whisper is not installed. Run: pip install faster-whisper"
                )
                return False
            self.state = "loading"
            try:
                self.model = await asyncio.to_thread(self._load_sync)
                self.state = "ready"
                return True
            except Exception as e:
                self.state = "error"
                self.load_error = f"{type(e).__name__}: {e}"
                return False

    async def transcribe(self, audio_bytes: bytes, suffix: str = ".webm") -> dict:
        """Returns {ok, text, durationMs, ...debug detail}; never raises."""
        started = time.monotonic()
        result = {
            "ok": False,
            "text": None,
            "model": self.model_name,
            "state": self.state,
            "audioBytes": len(audio_bytes),
            "durationMs": None,
            "error": None,
        }
        if not audio_bytes:
            result["error"] = "Received empty audio blob"
            return result

        if not await self.ensure_loaded():
            result["state"] = self.state
            result["error"] = self.load_error
            return result

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
                f.write(audio_bytes)
                tmp_path = f.name

            def run():
                segments, info = self.model.transcribe(tmp_path, language="en", beam_size=5)
                return " ".join(s.text.strip() for s in segments).strip(), info

            text, info = await asyncio.to_thread(run)
            result["ok"] = True
            result["text"] = text
            result["state"] = "ready"
            result["audioSeconds"] = round(getattr(info, "duration", 0.0), 2)
        except Exception as e:
            result["error"] = f"Transcription failed: {type(e).__name__}: {e}"
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        result["durationMs"] = round((time.monotonic() - started) * 1000, 1)
        return result


stt = WhisperSTT()
