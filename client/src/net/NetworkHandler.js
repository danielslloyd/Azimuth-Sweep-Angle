// Network Handler - WebSocket communication with backend server
import { debugFeed } from '../debug/DebugFeed.js';

debugFeed.log('INIT', 'NetworkHandler module loaded');

export const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
};

export class NetworkHandler {
    constructor(serverUrl = 'ws://localhost:8765') {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.state = ConnectionState.DISCONNECTED;

        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onError = null;
        this.onTranscription = null;
        this.onCommandParsed = null;
        this.onVoiceResponse = null;
        this.onDialogue = null;

        // Reconnection
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;

        // Message queue for offline operation
        this.messageQueue = [];
    }

    // Connect to server
    async connect() {
        if (this.state === ConnectionState.CONNECTING) {
            debugFeed.warn('NET', 'connect() called but already CONNECTING — ignoring');
            return;
        }
        if (this.state === ConnectionState.CONNECTED) {
            debugFeed.warn('NET', 'connect() called but already CONNECTED — ignoring');
            return;
        }

        debugFeed.log('NET', `Connecting to WebSocket server: ${this.serverUrl}`);
        this.state = ConnectionState.CONNECTING;

        try {
            if (!('WebSocket' in window)) {
                debugFeed.error('NET', 'WebSocket API not available in this browser');
                return;
            }

            this.socket = new WebSocket(this.serverUrl);
            debugFeed.log('NET', `WebSocket created, readyState: ${this.socket.readyState}`);

            this.socket.onopen = () => {
                this.state = ConnectionState.CONNECTED;
                this.reconnectAttempts = 0;
                debugFeed.log('NET', `WebSocket CONNECTED ✓ to ${this.serverUrl}`);

                // Flush message queue
                const queued = this.messageQueue.length;
                if (queued > 0) {
                    debugFeed.log('NET', `Flushing ${queued} queued message(s)...`);
                }
                while (this.messageQueue.length > 0) {
                    const msg = this.messageQueue.shift();
                    this.send(msg.type, msg.data);
                }

                if (this.onConnected) this.onConnected();
            };

            this.socket.onclose = (event) => {
                debugFeed.warn('NET', `WebSocket closed — code: ${event.code}, reason: "${event.reason || 'none'}", wasClean: ${event.wasClean}`);
                this.state = ConnectionState.DISCONNECTED;

                if (this.onDisconnected) this.onDisconnected();

                // Attempt reconnection
                this.attemptReconnect();
            };

            this.socket.onerror = (error) => {
                debugFeed.error('NET', `WebSocket error — server may not be running at ${this.serverUrl}`);
                this.state = ConnectionState.ERROR;

                if (this.onError) this.onError(error);
            };

            this.socket.onmessage = (event) => {
                const preview = typeof event.data === 'string'
                    ? event.data.slice(0, 120)
                    : `[binary ${event.data.size ?? event.data.byteLength} bytes]`;
                debugFeed.log('NET', `← MSG received: ${preview}`);
                this.handleMessage(event.data);
            };

        } catch (error) {
            debugFeed.error('NET', `connect() threw: ${error.message}`);
            this.state = ConnectionState.ERROR;

            if (this.onError) this.onError(error);
        }
    }

    // Handle incoming messages
    async handleMessage(data) {
        try {
            // Check if binary (audio data)
            if (data instanceof Blob) {
                debugFeed.log('NET', `← Binary Blob received: ${data.size} bytes`);
                const arrayBuffer = await data.arrayBuffer();
                if (this.onVoiceResponse) {
                    this.onVoiceResponse(arrayBuffer);
                } else {
                    debugFeed.warn('NET', 'Received voice blob but onVoiceResponse callback not set');
                }
                return;
            }

            // Parse JSON message
            let message;
            try {
                message = JSON.parse(data);
            } catch (parseErr) {
                debugFeed.error('NET', `Failed to parse server message as JSON: ${parseErr.message} — raw: ${String(data).slice(0, 80)}`);
                return;
            }

            debugFeed.log('NET', `← ${message.type}: ${JSON.stringify(message).slice(0, 100)}`);

            switch (message.type) {
                case 'transcription':
                    debugFeed.log('NET', `Transcription received: "${message.text}"`);
                    if (this.onTranscription) {
                        this.onTranscription(message.text);
                    } else {
                        debugFeed.warn('NET', 'onTranscription callback not set');
                    }
                    break;

                case 'command':
                    debugFeed.log('NET', `Command received: ${JSON.stringify(message.command)}`);
                    if (this.onCommandParsed) {
                        this.onCommandParsed(message.command);
                    } else {
                        debugFeed.warn('NET', 'onCommandParsed callback not set');
                    }
                    break;

                case 'dialogue':
                    debugFeed.log('NET', `Dialogue from ${message.speaker}: "${message.text}"`);
                    if (this.onDialogue) {
                        this.onDialogue(message.text, message.speaker);
                    }
                    break;

                case 'voice':
                    // Voice data sent as base64
                    if (message.audio && this.onVoiceResponse) {
                        debugFeed.log('NET', `Voice audio received (base64 len: ${message.audio.length}), decoding...`);
                        const binaryString = atob(message.audio);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        debugFeed.log('NET', `Voice decoded: ${bytes.byteLength} bytes`);
                        this.onVoiceResponse(bytes.buffer);
                    } else if (!message.audio) {
                        debugFeed.warn('NET', 'Voice message received but no audio field');
                    }
                    break;

                case 'error':
                    debugFeed.error('NET', `Server error: ${message.message}`);
                    if (this.onError) {
                        this.onError(new Error(message.message));
                    }
                    break;

                case 'ping':
                    debugFeed.log('NET', '← ping, sending pong');
                    this.send('pong', {});
                    break;

                default:
                    debugFeed.warn('NET', `Unknown message type from server: "${message.type}"`);
            }

        } catch (error) {
            debugFeed.error('NET', `handleMessage() threw: ${error.message}`);
        }
    }

    // Send message to server
    send(type, data) {
        const message = JSON.stringify({ type, ...data });

        if (this.state !== ConnectionState.CONNECTED) {
            debugFeed.warn('NET', `send("${type}") — not connected (state: ${this.state}), queuing (queue size: ${this.messageQueue.length + 1})`);
            this.messageQueue.push({ type, data });
            return false;
        }

        try {
            this.socket.send(message);
            debugFeed.log('NET', `→ sent "${type}" (${message.length} chars)`);
            return true;
        } catch (error) {
            debugFeed.error('NET', `send("${type}") failed: ${error.message}`);
            return false;
        }
    }

    // Send audio data for transcription
    async sendAudio(audioBlob) {
        if (this.state !== ConnectionState.CONNECTED) {
            debugFeed.error('NET', `sendAudio() called but not connected (state: ${this.state})`);
            return false;
        }

        debugFeed.log('NET', `Encoding audio blob (${audioBlob.size} bytes) to base64...`);
        try {
            // Convert blob to base64
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(arrayBuffer)
                    .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            debugFeed.log('NET', `→ sending audio: ${audioBlob.size} bytes (base64 len: ${base64.length})`);
            this.send('audio', { audio: base64 });
            return true;
        } catch (error) {
            debugFeed.error('NET', `sendAudio() failed: ${error.message}`);
            return false;
        }
    }

    // Send text command directly (for testing)
    sendTextCommand(text) {
        return this.send('text_command', { text });
    }

    // Request TTS for a response
    requestVoice(text, speaker = 'default') {
        return this.send('tts_request', { text, speaker });
    }

    // Attempt to reconnect
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            debugFeed.error('NET', `Max reconnect attempts (${this.maxReconnectAttempts}) reached — giving up. Game will run in offline mode.`);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        debugFeed.warn('NET', `Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    // Disconnect from server
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.state = ConnectionState.DISCONNECTED;
    }

    // Check connection state
    isConnected() {
        return this.state === ConnectionState.CONNECTED;
    }

    // Set callbacks
    setCallbacks(callbacks) {
        if (callbacks.onConnected) this.onConnected = callbacks.onConnected;
        if (callbacks.onDisconnected) this.onDisconnected = callbacks.onDisconnected;
        if (callbacks.onError) this.onError = callbacks.onError;
        if (callbacks.onTranscription) this.onTranscription = callbacks.onTranscription;
        if (callbacks.onCommandParsed) this.onCommandParsed = callbacks.onCommandParsed;
        if (callbacks.onVoiceResponse) this.onVoiceResponse = callbacks.onVoiceResponse;
        if (callbacks.onDialogue) this.onDialogue = callbacks.onDialogue;
    }
}
