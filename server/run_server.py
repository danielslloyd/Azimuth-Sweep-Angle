#!/usr/bin/env python3
"""
Project Overwatch - Server Runner
Simplified entry point for the backend server
"""

import asyncio
import json
import base64
import logging
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import websockets
from websockets.server import WebSocketServerProtocol

from stt.whisper_stt import WhisperSTT, MockWhisperSTT
from nlp.command_parser import CommandParser
from tts.tts_engine import TTSEngine
from dialogue.dialogue_manager import DialogueManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('overwatch')


class SimpleOverwatchServer:
    """Simplified server implementation"""

    def __init__(self, host='localhost', port=8765, use_mock=False):
        self.host = host
        self.port = port
        self.use_mock = use_mock

        self.stt = None
        self.command_parser = None
        self.tts = None
        self.dialogue = None
        self.clients = set()

    async def initialize(self):
        """Initialize all components"""
        logger.info("Initializing server components...")

        # Initialize STT
        if self.use_mock:
            logger.info("Using mock STT (no GPU)")
            self.stt = MockWhisperSTT()
        else:
            self.stt = WhisperSTT(model_size="base")

        await self.stt.initialize()

        # Initialize command parser (no async needed)
        self.command_parser = CommandParser()

        # Initialize TTS
        self.tts = TTSEngine()
        await self.tts.initialize()

        # Initialize dialogue manager
        self.dialogue = DialogueManager()

        logger.info("All components initialized")

    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle client connection"""
        self.clients.add(websocket)
        logger.info(f"Client connected. Total clients: {len(self.clients)}")

        try:
            async for message in websocket:
                await self.process_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            logger.info(f"Client disconnected. Total clients: {len(self.clients)}")

    async def process_message(self, websocket, message):
        """Process incoming message"""
        try:
            data = json.loads(message)
            msg_type = data.get('type')

            if msg_type == 'audio':
                await self.handle_audio(websocket, data)
            elif msg_type == 'text_command':
                await self.handle_text_command(websocket, data)
            elif msg_type == 'tts_request':
                await self.handle_tts_request(websocket, data)
            elif msg_type == 'pong':
                pass

        except json.JSONDecodeError:
            logger.error("Invalid JSON message")
        except Exception as e:
            logger.error(f"Error processing message: {e}")

    async def handle_audio(self, websocket, data):
        """Process audio for transcription"""
        try:
            audio_b64 = data.get('audio', '')
            audio_bytes = base64.b64decode(audio_b64)

            # Transcribe
            text = await self.stt.transcribe(audio_bytes)

            if text:
                await websocket.send(json.dumps({
                    'type': 'transcription',
                    'text': text
                }))

                # Parse command
                command = self.command_parser.parse(text)

                if command:
                    await websocket.send(json.dumps({
                        'type': 'command',
                        'command': command
                    }))

                    # Generate response
                    response = self.dialogue.generate_response(command)
                    await websocket.send(json.dumps({
                        'type': 'dialogue',
                        'text': response,
                        'speaker': 'alpha'
                    }))

        except Exception as e:
            logger.error(f"Audio processing error: {e}")

    async def handle_text_command(self, websocket, data):
        """Process text command"""
        text = data.get('text', '')
        if not text:
            return

        command = self.command_parser.parse(text)

        if command:
            await websocket.send(json.dumps({
                'type': 'command',
                'command': command
            }))

            response = self.dialogue.generate_response(command)
            await websocket.send(json.dumps({
                'type': 'dialogue',
                'text': response,
                'speaker': 'alpha'
            }))

    async def handle_tts_request(self, websocket, data):
        """Generate TTS audio"""
        text = data.get('text', '')
        if not text:
            return

        audio = await self.tts.synthesize(text)

        if audio:
            audio_b64 = base64.b64encode(audio).decode('utf-8')
            await websocket.send(json.dumps({
                'type': 'voice',
                'audio': audio_b64
            }))

    async def run(self):
        """Run the server"""
        await self.initialize()

        logger.info(f"Starting server on ws://{self.host}:{self.port}")

        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port
        ):
            await asyncio.Future()  # Run forever


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Project Overwatch Server')
    parser.add_argument('--host', default='localhost', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8765, help='Port to bind to')
    parser.add_argument('--mock', action='store_true', help='Use mock STT (no GPU required)')

    args = parser.parse_args()

    server = SimpleOverwatchServer(
        host=args.host,
        port=args.port,
        use_mock=args.mock
    )

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        logger.info("Server stopped")


if __name__ == '__main__':
    main()
