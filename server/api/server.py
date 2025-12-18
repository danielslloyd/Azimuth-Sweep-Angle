#!/usr/bin/env python3
"""
Project Overwatch - Backend Server
Handles voice processing, command parsing, and TTS generation
"""

import asyncio
import json
import base64
import logging
from typing import Optional, Dict, Any
import websockets
from websockets.server import WebSocketServerProtocol

# Import local modules
from ..stt.whisper_stt import WhisperSTT
from ..nlp.command_parser import CommandParser
from ..tts.tts_engine import TTSEngine
from ..dialogue.dialogue_manager import DialogueManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('overwatch_server')


class OverwatchServer:
    """Main WebSocket server for Project Overwatch"""

    def __init__(self, host: str = 'localhost', port: int = 8765):
        self.host = host
        self.port = port
        self.clients: set[WebSocketServerProtocol] = set()

        # Initialize components
        self.stt: Optional[WhisperSTT] = None
        self.command_parser: Optional[CommandParser] = None
        self.tts: Optional[TTSEngine] = None
        self.dialogue: Optional[DialogueManager] = None

        # Component initialization status
        self.components_ready = False

    async def initialize_components(self):
        """Initialize AI components (can be slow due to model loading)"""
        logger.info("Initializing AI components...")

        try:
            # Initialize STT
            logger.info("Loading speech-to-text model...")
            self.stt = WhisperSTT()
            await self.stt.initialize()

            # Initialize command parser
            logger.info("Loading command parser...")
            self.command_parser = CommandParser()

            # Initialize TTS
            logger.info("Loading text-to-speech engine...")
            self.tts = TTSEngine()
            await self.tts.initialize()

            # Initialize dialogue manager
            logger.info("Loading dialogue manager...")
            self.dialogue = DialogueManager()

            self.components_ready = True
            logger.info("All components initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize components: {e}")
            raise

    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle a single client connection"""
        self.clients.add(websocket)
        client_id = id(websocket)
        logger.info(f"Client {client_id} connected")

        try:
            async for message in websocket:
                await self.process_message(websocket, message)

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client {client_id} disconnected")
        except Exception as e:
            logger.error(f"Error handling client {client_id}: {e}")
        finally:
            self.clients.discard(websocket)

    async def process_message(self, websocket: WebSocketServerProtocol, message: str):
        """Process incoming message from client"""
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
                pass  # Heartbeat response
            else:
                logger.warning(f"Unknown message type: {msg_type}")

        except json.JSONDecodeError:
            logger.error("Failed to parse message as JSON")
            await self.send_error(websocket, "Invalid message format")
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            await self.send_error(websocket, str(e))

    async def handle_audio(self, websocket: WebSocketServerProtocol, data: Dict[str, Any]):
        """Process audio data for speech-to-text"""
        if not self.components_ready:
            await self.send_error(websocket, "Server not ready")
            return

        try:
            # Decode base64 audio
            audio_b64 = data.get('audio', '')
            audio_bytes = base64.b64decode(audio_b64)

            # Transcribe audio
            logger.info("Transcribing audio...")
            transcription = await self.stt.transcribe(audio_bytes)

            if not transcription:
                await self.send_error(websocket, "Could not transcribe audio")
                return

            logger.info(f"Transcription: {transcription}")

            # Send transcription to client
            await websocket.send(json.dumps({
                'type': 'transcription',
                'text': transcription
            }))

            # Parse command
            command = self.command_parser.parse(transcription)

            if command:
                logger.info(f"Parsed command: {command}")
                await websocket.send(json.dumps({
                    'type': 'command',
                    'command': command
                }))

                # Generate dialogue response
                response = self.dialogue.generate_response(command)
                await websocket.send(json.dumps({
                    'type': 'dialogue',
                    'text': response,
                    'speaker': 'alpha'
                }))

                # Generate TTS for response
                await self.generate_and_send_tts(websocket, response)
            else:
                # Command not understood
                await websocket.send(json.dumps({
                    'type': 'dialogue',
                    'text': "Say again? Did not copy.",
                    'speaker': 'alpha'
                }))

        except Exception as e:
            logger.error(f"Error processing audio: {e}")
            await self.send_error(websocket, "Audio processing failed")

    async def handle_text_command(self, websocket: WebSocketServerProtocol, data: Dict[str, Any]):
        """Process text command directly (for testing/fallback)"""
        text = data.get('text', '')

        if not text:
            return

        # Parse command
        command = self.command_parser.parse(text)

        if command:
            await websocket.send(json.dumps({
                'type': 'command',
                'command': command
            }))

            # Generate dialogue response
            response = self.dialogue.generate_response(command)
            await websocket.send(json.dumps({
                'type': 'dialogue',
                'text': response,
                'speaker': 'alpha'
            }))

    async def handle_tts_request(self, websocket: WebSocketServerProtocol, data: Dict[str, Any]):
        """Generate TTS audio for text"""
        text = data.get('text', '')
        speaker = data.get('speaker', 'default')

        if text:
            await self.generate_and_send_tts(websocket, text, speaker)

    async def generate_and_send_tts(self, websocket: WebSocketServerProtocol,
                                     text: str, speaker: str = 'default'):
        """Generate TTS and send audio to client"""
        if not self.tts:
            return

        try:
            audio_bytes = await self.tts.synthesize(text, speaker)

            if audio_bytes:
                # Send as base64 encoded audio
                audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
                await websocket.send(json.dumps({
                    'type': 'voice',
                    'audio': audio_b64
                }))

        except Exception as e:
            logger.error(f"TTS generation failed: {e}")

    async def send_error(self, websocket: WebSocketServerProtocol, message: str):
        """Send error message to client"""
        await websocket.send(json.dumps({
            'type': 'error',
            'message': message
        }))

    async def heartbeat(self):
        """Send periodic heartbeat to all clients"""
        while True:
            await asyncio.sleep(30)
            if self.clients:
                message = json.dumps({'type': 'ping'})
                await asyncio.gather(
                    *[client.send(message) for client in self.clients],
                    return_exceptions=True
                )

    async def start(self):
        """Start the server"""
        # Initialize components
        await self.initialize_components()

        # Start heartbeat task
        asyncio.create_task(self.heartbeat())

        # Start WebSocket server
        logger.info(f"Starting server on {self.host}:{self.port}")

        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=60
        ):
            await asyncio.Future()  # Run forever


async def main():
    """Main entry point"""
    server = OverwatchServer()
    await server.start()


if __name__ == '__main__':
    asyncio.run(main())
