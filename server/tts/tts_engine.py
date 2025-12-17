#!/usr/bin/env python3
"""
Text-to-Speech Engine
Generates voice responses for AI teammates
"""

import asyncio
import logging
import io
import os
from typing import Optional, Dict, Any
import tempfile

logger = logging.getLogger('overwatch.tts')


class TTSEngine:
    """Text-to-speech engine using local models"""

    def __init__(self, model: str = "default"):
        """
        Initialize TTS engine

        Args:
            model: TTS model to use
        """
        self.model_name = model
        self.tts = None
        self.initialized = False

        # Voice settings for different speakers
        self.voice_settings = {
            'default': {'speed': 1.0, 'pitch': 1.0},
            'alpha': {'speed': 1.1, 'pitch': 0.95},  # Slightly faster, deeper
            'command': {'speed': 0.9, 'pitch': 1.0},  # Slower for clarity
        }

    async def initialize(self):
        """Initialize TTS model"""
        if self.initialized:
            return

        try:
            # Try to use pyttsx3 for cross-platform TTS
            # Fallback options: edge-tts, coqui-tts, etc.
            logger.info("Initializing TTS engine...")

            try:
                import pyttsx3
                self.tts = pyttsx3.init()
                self.tts_type = 'pyttsx3'

                # Configure voice
                voices = self.tts.getProperty('voices')
                # Try to find a male voice
                for voice in voices:
                    if 'male' in voice.name.lower():
                        self.tts.setProperty('voice', voice.id)
                        break

                self.tts.setProperty('rate', 175)  # Words per minute

                logger.info("Using pyttsx3 TTS engine")

            except ImportError:
                logger.warning("pyttsx3 not available, trying edge-tts")

                try:
                    import edge_tts
                    self.tts_type = 'edge_tts'
                    logger.info("Using edge-tts engine")

                except ImportError:
                    logger.warning("No TTS engine available, using mock")
                    self.tts_type = 'mock'

            self.initialized = True
            logger.info("TTS engine initialized")

        except Exception as e:
            logger.error(f"Failed to initialize TTS: {e}")
            self.tts_type = 'mock'
            self.initialized = True

    async def synthesize(self, text: str, speaker: str = "default") -> Optional[bytes]:
        """
        Synthesize speech from text

        Args:
            text: Text to speak
            speaker: Voice/speaker profile

        Returns:
            Audio bytes (WAV format) or None if failed
        """
        if not self.initialized:
            await self.initialize()

        if not text:
            return None

        try:
            settings = self.voice_settings.get(speaker, self.voice_settings['default'])

            if self.tts_type == 'pyttsx3':
                return await self._synthesize_pyttsx3(text, settings)
            elif self.tts_type == 'edge_tts':
                return await self._synthesize_edge_tts(text, speaker)
            else:
                return await self._synthesize_mock(text)

        except Exception as e:
            logger.error(f"TTS synthesis failed: {e}")
            return None

    async def _synthesize_pyttsx3(self, text: str, settings: Dict[str, Any]) -> Optional[bytes]:
        """Synthesize using pyttsx3"""
        try:
            # pyttsx3 is synchronous, run in thread pool
            loop = asyncio.get_event_loop()

            def generate():
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                    temp_path = f.name

                try:
                    self.tts.setProperty('rate', int(175 * settings.get('speed', 1.0)))
                    self.tts.save_to_file(text, temp_path)
                    self.tts.runAndWait()

                    with open(temp_path, 'rb') as f:
                        return f.read()
                finally:
                    if os.path.exists(temp_path):
                        os.unlink(temp_path)

            return await loop.run_in_executor(None, generate)

        except Exception as e:
            logger.error(f"pyttsx3 synthesis failed: {e}")
            return None

    async def _synthesize_edge_tts(self, text: str, speaker: str) -> Optional[bytes]:
        """Synthesize using edge-tts (Microsoft TTS)"""
        try:
            import edge_tts

            # Voice mapping
            voice_map = {
                'default': 'en-US-GuyNeural',
                'alpha': 'en-US-GuyNeural',
                'command': 'en-US-ChristopherNeural',
            }

            voice = voice_map.get(speaker, 'en-US-GuyNeural')

            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
                temp_path = f.name

            try:
                communicate = edge_tts.Communicate(text, voice)
                await communicate.save(temp_path)

                with open(temp_path, 'rb') as f:
                    return f.read()
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

        except Exception as e:
            logger.error(f"edge-tts synthesis failed: {e}")
            return None

    async def _synthesize_mock(self, text: str) -> Optional[bytes]:
        """Mock synthesis for testing"""
        # Generate a simple beep sound as placeholder
        import struct
        import math

        # Parameters
        sample_rate = 22050
        duration = 0.2
        frequency = 800

        # Generate samples
        num_samples = int(sample_rate * duration)
        samples = []

        for i in range(num_samples):
            t = i / sample_rate
            # Sine wave with envelope
            envelope = math.sin(math.pi * t / duration)
            sample = int(32767 * envelope * math.sin(2 * math.pi * frequency * t))
            samples.append(struct.pack('<h', sample))

        # Create WAV file
        audio_data = b''.join(samples)
        wav_header = self._create_wav_header(len(audio_data), sample_rate)

        return wav_header + audio_data

    def _create_wav_header(self, data_size: int, sample_rate: int = 22050) -> bytes:
        """Create WAV file header"""
        import struct

        channels = 1
        bits_per_sample = 16
        byte_rate = sample_rate * channels * bits_per_sample // 8
        block_align = channels * bits_per_sample // 8

        header = struct.pack(
            '<4sI4s4sIHHIIHH4sI',
            b'RIFF',
            36 + data_size,
            b'WAVE',
            b'fmt ',
            16,
            1,  # PCM format
            channels,
            sample_rate,
            byte_rate,
            block_align,
            bits_per_sample,
            b'data',
            data_size
        )

        return header

    def get_available_voices(self) -> list:
        """Get list of available voices"""
        if self.tts_type == 'pyttsx3' and self.tts:
            voices = self.tts.getProperty('voices')
            return [v.name for v in voices]
        elif self.tts_type == 'edge_tts':
            return ['en-US-GuyNeural', 'en-US-ChristopherNeural', 'en-US-EricNeural']
        return ['mock']


# Pre-recorded voice lines for low-latency responses
class VoiceLineCache:
    """Cache of pre-recorded voice lines for common responses"""

    def __init__(self, tts_engine: TTSEngine):
        self.tts = tts_engine
        self.cache: Dict[str, bytes] = {}

        # Common responses to pre-generate
        self.common_lines = [
            "Copy.",
            "Roger.",
            "Copy that.",
            "Moving.",
            "Moving to position.",
            "Holding position.",
            "Engaging.",
            "Targets engaged.",
            "Say again?",
            "Did not copy.",
            "Negative.",
            "Affirmative.",
            "Tango down.",
            "Contact!",
            "Taking fire!",
            "Man down!",
            "Airstrike inbound.",
            "Impact!",
        ]

    async def preload(self):
        """Pre-generate common voice lines"""
        logger.info("Pre-loading voice lines...")

        for line in self.common_lines:
            try:
                audio = await self.tts.synthesize(line, 'alpha')
                if audio:
                    self.cache[line.lower()] = audio
            except Exception as e:
                logger.error(f"Failed to cache voice line: {line}: {e}")

        logger.info(f"Cached {len(self.cache)} voice lines")

    def get(self, text: str) -> Optional[bytes]:
        """Get cached voice line if available"""
        return self.cache.get(text.lower())

    async def get_or_generate(self, text: str, speaker: str = "alpha") -> Optional[bytes]:
        """Get from cache or generate new"""
        cached = self.get(text)
        if cached:
            return cached

        return await self.tts.synthesize(text, speaker)
