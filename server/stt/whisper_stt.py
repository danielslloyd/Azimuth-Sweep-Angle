#!/usr/bin/env python3
"""
Speech-to-Text module using OpenAI Whisper
Supports local GPU acceleration
"""

import io
import asyncio
import logging
from typing import Optional
import tempfile
import os

logger = logging.getLogger('overwatch.stt')


class WhisperSTT:
    """Speech-to-text using Whisper model"""

    def __init__(self, model_size: str = "base"):
        """
        Initialize Whisper STT

        Args:
            model_size: Whisper model size (tiny, base, small, medium, large)
        """
        self.model_size = model_size
        self.model = None
        self.device = None
        self.initialized = False

    async def initialize(self):
        """Load Whisper model"""
        if self.initialized:
            return

        try:
            # Import whisper (lazy import to avoid startup delay)
            import torch
            import whisper

            # Determine device
            if torch.cuda.is_available():
                self.device = "cuda"
                logger.info("Using CUDA for Whisper")
            else:
                self.device = "cpu"
                logger.info("Using CPU for Whisper (GPU not available)")

            # Load model
            logger.info(f"Loading Whisper model: {self.model_size}")
            self.model = whisper.load_model(self.model_size, device=self.device)

            self.initialized = True
            logger.info("Whisper model loaded successfully")

        except ImportError:
            logger.error("Whisper not installed. Install with: pip install openai-whisper")
            raise
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    async def transcribe(self, audio_data: bytes) -> Optional[str]:
        """
        Transcribe audio data to text

        Args:
            audio_data: Audio bytes (webm/opus format from browser)

        Returns:
            Transcribed text or None if failed
        """
        if not self.initialized:
            logger.error("Whisper not initialized")
            return None

        try:
            # Save audio to temporary file (Whisper needs file path)
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
                f.write(audio_data)
                temp_path = f.name

            try:
                # Run transcription in thread pool to avoid blocking
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    self._transcribe_file,
                    temp_path
                )

                if result and 'text' in result:
                    text = result['text'].strip()
                    logger.info(f"Transcription: {text}")
                    return text

                return None

            finally:
                # Clean up temp file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return None

    def _transcribe_file(self, file_path: str) -> dict:
        """Synchronous transcription (runs in thread pool)"""
        try:
            result = self.model.transcribe(
                file_path,
                language='en',
                task='transcribe',
                fp16=(self.device == 'cuda'),
                verbose=False
            )
            return result
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return {}

    def get_model_info(self) -> dict:
        """Get information about loaded model"""
        return {
            'model_size': self.model_size,
            'device': self.device,
            'initialized': self.initialized
        }


class MockWhisperSTT:
    """Mock STT for testing without GPU"""

    def __init__(self):
        self.initialized = False

    async def initialize(self):
        self.initialized = True
        logger.info("Mock Whisper STT initialized")

    async def transcribe(self, audio_data: bytes) -> Optional[str]:
        """Return mock transcription for testing"""
        # This would normally process audio
        # For testing, we'll just return a placeholder
        await asyncio.sleep(0.5)  # Simulate processing time
        return None  # Actual implementation would return real transcription

    def get_model_info(self) -> dict:
        return {
            'model_size': 'mock',
            'device': 'none',
            'initialized': self.initialized
        }


# Factory function to create appropriate STT instance
def create_stt(use_mock: bool = False, model_size: str = "base") -> WhisperSTT:
    """
    Create STT instance

    Args:
        use_mock: Use mock STT for testing
        model_size: Whisper model size

    Returns:
        STT instance
    """
    if use_mock:
        return MockWhisperSTT()
    return WhisperSTT(model_size)
