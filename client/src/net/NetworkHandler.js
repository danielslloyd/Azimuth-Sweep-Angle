// Network Handler - WebSocket communication with backend server

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
        if (this.state === ConnectionState.CONNECTING ||
            this.state === ConnectionState.CONNECTED) {
            return;
        }

        this.state = ConnectionState.CONNECTING;

        try {
            this.socket = new WebSocket(this.serverUrl);

            this.socket.onopen = () => {
                console.log('Connected to server');
                this.state = ConnectionState.CONNECTED;
                this.reconnectAttempts = 0;

                // Flush message queue
                while (this.messageQueue.length > 0) {
                    const msg = this.messageQueue.shift();
                    this.send(msg.type, msg.data);
                }

                if (this.onConnected) {
                    this.onConnected();
                }
            };

            this.socket.onclose = () => {
                console.log('Disconnected from server');
                this.state = ConnectionState.DISCONNECTED;

                if (this.onDisconnected) {
                    this.onDisconnected();
                }

                // Attempt reconnection
                this.attemptReconnect();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.state = ConnectionState.ERROR;

                if (this.onError) {
                    this.onError(error);
                }
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

        } catch (error) {
            console.error('Failed to connect:', error);
            this.state = ConnectionState.ERROR;

            if (this.onError) {
                this.onError(error);
            }
        }
    }

    // Handle incoming messages
    async handleMessage(data) {
        try {
            // Check if binary (audio data)
            if (data instanceof Blob) {
                const arrayBuffer = await data.arrayBuffer();
                if (this.onVoiceResponse) {
                    this.onVoiceResponse(arrayBuffer);
                }
                return;
            }

            // Parse JSON message
            const message = JSON.parse(data);

            switch (message.type) {
                case 'transcription':
                    if (this.onTranscription) {
                        this.onTranscription(message.text);
                    }
                    break;

                case 'command':
                    if (this.onCommandParsed) {
                        this.onCommandParsed(message.command);
                    }
                    break;

                case 'dialogue':
                    if (this.onDialogue) {
                        this.onDialogue(message.text, message.speaker);
                    }
                    break;

                case 'voice':
                    // Voice data sent as base64
                    if (message.audio && this.onVoiceResponse) {
                        const binaryString = atob(message.audio);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        this.onVoiceResponse(bytes.buffer);
                    }
                    break;

                case 'error':
                    console.error('Server error:', message.message);
                    if (this.onError) {
                        this.onError(new Error(message.message));
                    }
                    break;

                case 'ping':
                    this.send('pong', {});
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }

        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    // Send message to server
    send(type, data) {
        const message = JSON.stringify({ type, ...data });

        if (this.state !== ConnectionState.CONNECTED) {
            // Queue message for later
            this.messageQueue.push({ type, data });
            return false;
        }

        try {
            this.socket.send(message);
            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            return false;
        }
    }

    // Send audio data for transcription
    async sendAudio(audioBlob) {
        if (this.state !== ConnectionState.CONNECTED) {
            console.warn('Not connected to server');
            return false;
        }

        try {
            // Convert blob to base64
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(arrayBuffer)
                    .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            this.send('audio', { audio: base64 });
            return true;
        } catch (error) {
            console.error('Failed to send audio:', error);
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
            console.log('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Attempting reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);

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
