// Project Overwatch - Main Entry Point
import { Renderer } from './rendering/Renderer.js';
import { GameState, GamePhase } from './game/GameState.js';
import { AudioManager } from './audio/AudioManager.js';
import { InputHandler, InputState } from './input/InputHandler.js';
import { NetworkHandler, ConnectionState } from './net/NetworkHandler.js';
import { Map01 } from './game/maps/Map01.js';

class Game {
    constructor() {
        // Core components
        this.renderer = null;
        this.gameState = null;
        this.audioManager = null;
        this.inputHandler = null;
        this.networkHandler = null;

        // UI elements
        this.voiceIndicator = document.getElementById('voice-indicator');
        this.commandFeedback = document.getElementById('command-feedback');
        this.gridPosDisplay = document.getElementById('grid-pos');
        this.squadStatusDisplay = document.getElementById('squad-status');
        this.airstrikeStatusDisplay = document.getElementById('airstrike-status');
        this.instructionsPanel = document.getElementById('instructions');
        this.startButton = document.getElementById('start-btn');

        // Game state
        this.isRunning = false;
        this.lastTime = performance.now();

        // Server connection status
        this.serverConnected = false;

        // Fallback command parser for offline mode
        this.offlineMode = true;
    }

    async init() {
        // Initialize canvas
        const canvas = document.getElementById('canvas');
        this.renderer = new Renderer(canvas);

        // Initialize game state
        this.gameState = new GameState();

        // Initialize audio
        this.audioManager = new AudioManager();

        // Initialize input
        this.inputHandler = new InputHandler();

        // Initialize network
        this.networkHandler = new NetworkHandler();

        // Setup callbacks
        this.setupCallbacks();

        // Setup start button
        this.startButton.addEventListener('click', () => this.startGame());

        console.log('Game initialized');
    }

    setupCallbacks() {
        // Input callbacks
        this.inputHandler.setCallbacks({
            onVoiceStart: () => this.handleVoiceStart(),
            onVoiceEnd: () => this.handleVoiceEnd(),
            onMouseMove: (e) => this.handleMouseMove(e),
            onWheel: (e) => this.handleWheel(e),
            onKeyDown: (e) => this.handleKeyDown(e)
        });

        // Audio recording callback
        this.audioManager.setOnRecordingComplete((audioBlob) => {
            this.handleRecordingComplete(audioBlob);
        });

        // Network callbacks
        this.networkHandler.setCallbacks({
            onConnected: () => {
                this.serverConnected = true;
                this.offlineMode = false;
                console.log('Server connected');
            },
            onDisconnected: () => {
                this.serverConnected = false;
                this.offlineMode = true;
                console.log('Server disconnected - using offline mode');
            },
            onTranscription: (text) => this.handleTranscription(text),
            onCommandParsed: (command) => this.handleParsedCommand(command),
            onVoiceResponse: (audioData) => this.audioManager.playVoiceResponse(audioData),
            onDialogue: (text, speaker) => this.showFeedback(text)
        });

        // Game state callbacks
        this.gameState.onUnitKilled = (unit) => this.handleUnitKilled(unit);
        this.gameState.onBulletFired = (bullet) => this.handleBulletFired(bullet);
        this.gameState.onAirstrikeImpact = (strike) => this.handleAirstrikeImpact(strike);
        this.gameState.onGameOver = (result) => this.handleGameOver(result);
    }

    async startGame() {
        // Initialize audio (requires user gesture)
        await this.audioManager.init();
        await this.audioManager.resume();

        // Hide instructions
        this.instructionsPanel.classList.add('hidden');

        // Try to connect to server
        this.networkHandler.connect();

        // Load map
        this.gameState.initMission(Map01);

        // Add terrain to renderer
        this.renderer.addTerrain(this.gameState.terrain);

        // Start game loop
        this.isRunning = true;
        this.gameLoop();

        // Show initial briefing
        this.showFeedback(Map01.briefing);
        setTimeout(() => this.hideFeedback(), 5000);

        console.log('Game started');
    }

    gameLoop() {
        if (!this.isRunning) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Update game state
        this.gameState.update(currentTime);

        // Update renderer with all units
        this.gameState.getAllUnits().forEach(unit => {
            this.renderer.updateUnit(unit);
        });

        // Update UI
        this.updateUI();

        // Render
        this.renderer.render(deltaTime);

        // Next frame
        requestAnimationFrame(() => this.gameLoop());
    }

    updateUI() {
        // Update squad status
        const squad = this.gameState.getSquadStatus();
        this.squadStatusDisplay.textContent = `${squad.living}/${squad.total}`;

        // Update airstrike status
        this.airstrikeStatusDisplay.textContent = this.gameState.getAirstrikeStatus();

        // Update voice indicator
        const inputState = this.inputHandler.getState();
        this.voiceIndicator.className = '';
        if (inputState === InputState.LISTENING) {
            this.voiceIndicator.classList.add('listening');
            this.voiceIndicator.textContent = 'LISTENING...';
        } else if (inputState === InputState.PROCESSING) {
            this.voiceIndicator.classList.add('processing');
            this.voiceIndicator.textContent = 'PROCESSING...';
        } else {
            this.voiceIndicator.textContent = 'PRESS SPACE TO SPEAK';
        }
    }

    // Voice input handlers
    async handleVoiceStart() {
        const success = await this.audioManager.startRecording();
        if (!success) {
            this.showFeedback('Microphone access denied');
            this.inputHandler.resetState();
        }
    }

    handleVoiceEnd() {
        this.audioManager.stopRecording();
    }

    async handleRecordingComplete(audioBlob) {
        if (this.serverConnected) {
            // Send to server for processing
            await this.networkHandler.sendAudio(audioBlob);
        } else {
            // Offline mode - use Web Speech API fallback
            this.useWebSpeechFallback();
        }
    }

    // Web Speech API fallback for offline mode
    useWebSpeechFallback() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.showFeedback('Voice recognition not available');
            this.inputHandler.resetState();
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.handleTranscription(transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.showFeedback('Could not understand command');
            this.inputHandler.resetState();
        };

        recognition.onend = () => {
            if (this.inputHandler.getState() === InputState.PROCESSING) {
                // Already processed
            }
        };

        recognition.start();
    }

    // Handle transcribed text
    handleTranscription(text) {
        console.log('Transcription:', text);
        this.showFeedback(`"${text}"`);

        if (this.serverConnected) {
            // Server will parse and send command
            this.networkHandler.sendTextCommand(text);
        } else {
            // Parse locally
            const command = this.parseCommandLocally(text);
            if (command) {
                this.handleParsedCommand(command);
            } else {
                this.showFeedback('Command not understood');
            }
        }

        this.inputHandler.resetState();
    }

    // Local command parser (offline mode)
    parseCommandLocally(text) {
        const lowerText = text.toLowerCase();

        // Parse target units
        let targets = 'all';
        if (lowerText.includes('alpha 1') || lowerText.includes('alpha-1') || lowerText.includes('alpha one')) {
            targets = 'alpha-1';
        } else if (lowerText.includes('alpha 2') || lowerText.includes('alpha-2') || lowerText.includes('alpha two')) {
            targets = 'alpha-2';
        } else if (lowerText.includes('alpha 3') || lowerText.includes('alpha-3') || lowerText.includes('alpha three')) {
            targets = 'alpha-3';
        } else if (lowerText.includes('alpha 4') || lowerText.includes('alpha-4') || lowerText.includes('alpha four')) {
            targets = 'alpha-4';
        } else if (lowerText.includes('squad') || lowerText.includes('team') || lowerText.includes('alpha')) {
            targets = 'all';
        }

        // Parse grid coordinate
        let gridCoord = null;
        const gridMatch = lowerText.match(/(?:grid\s+)?([a-j])\s*(\d+)/i);
        if (gridMatch) {
            const gridStr = gridMatch[1].toUpperCase() + gridMatch[2];
            gridCoord = this.renderer.gridToWorld(gridStr);
        }

        // Parse action
        let action = null;
        let params = {};

        if (lowerText.includes('move') || lowerText.includes('go to') || lowerText.includes('advance')) {
            action = 'move';
        } else if (lowerText.includes('hold') || lowerText.includes('stop') || lowerText.includes('stay')) {
            action = 'hold';
        } else if (lowerText.includes('engage') || lowerText.includes('attack') || lowerText.includes('fire')) {
            action = 'engage';
        } else if (lowerText.includes('cease fire') || lowerText.includes('hold fire')) {
            action = 'cease_fire';
        } else if (lowerText.includes('airstrike') || lowerText.includes('air strike') ||
                   lowerText.includes('bomb') || lowerText.includes('strike')) {
            action = 'airstrike';
            if (lowerText.includes('cluster')) {
                params.type = 'cluster';
            } else {
                params.type = 'precision';
            }
        }

        if (!action) {
            return null;
        }

        return { action, targets, gridCoord, params };
    }

    // Handle parsed command from server or local parser
    handleParsedCommand(command) {
        console.log('Executing command:', command);

        const result = this.gameState.issueCommand(command);

        // Show result feedback
        if (result.success) {
            this.audioManager.playConfirm();

            // Generate response based on action
            let response = '';
            switch (command.action) {
                case 'move':
                    response = 'Copy, moving to position.';
                    break;
                case 'hold':
                    response = 'Roger, holding position.';
                    break;
                case 'engage':
                    response = 'Copy, engaging targets.';
                    break;
                case 'cease_fire':
                    response = 'Copy, holding fire.';
                    break;
                case 'airstrike':
                    response = result.message;
                    break;
                default:
                    response = 'Copy.';
            }

            this.showFeedback(response);

            // Request TTS if connected
            if (this.serverConnected) {
                this.networkHandler.requestVoice(response);
            }
        } else {
            this.showFeedback(result.message);
        }

        setTimeout(() => this.hideFeedback(), 3000);
    }

    // Game event handlers
    handleUnitKilled(unit) {
        console.log(`${unit.callsign} killed`);

        if (unit.isEnemy) {
            this.showFeedback(`Tango down`);
        } else {
            this.showFeedback(`${unit.callsign} is down!`);
        }

        setTimeout(() => this.hideFeedback(), 2000);
    }

    handleBulletFired(bullet) {
        this.audioManager.playGunshot(bullet.x);
        this.renderer.addBullet(bullet);
    }

    handleAirstrikeImpact(strike) {
        console.log('Airstrike impact:', strike);
        this.audioManager.playExplosion(strike.x);
        this.renderer.addExplosion(strike.x, strike.z, strike.radius);

        if (strike.type === 'cluster') {
            // Multiple explosions for cluster
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const offsetX = (Math.random() - 0.5) * strike.radius * 1.5;
                    const offsetZ = (Math.random() - 0.5) * strike.radius * 1.5;
                    this.audioManager.playExplosion(strike.x + offsetX);
                    this.renderer.addExplosion(
                        strike.x + offsetX,
                        strike.z + offsetZ,
                        strike.radius * 0.5
                    );
                }, i * 200 + Math.random() * 100);
            }
        }

        this.showFeedback('Impact! Impact!');
        setTimeout(() => this.hideFeedback(), 2000);
    }

    handleGameOver(result) {
        this.isRunning = false;

        if (result === 'victory') {
            this.showFeedback('MISSION COMPLETE - All hostiles eliminated');
        } else {
            this.showFeedback('MISSION FAILED - All squad members lost');
        }

        // Show restart option
        setTimeout(() => {
            this.instructionsPanel.querySelector('h1').textContent =
                result === 'victory' ? 'MISSION COMPLETE' : 'MISSION FAILED';
            this.instructionsPanel.querySelector('p').textContent =
                result === 'victory' ? 'All hostiles eliminated' : 'All squad members lost';
            this.startButton.textContent = 'RESTART MISSION';
            this.instructionsPanel.classList.remove('hidden');
        }, 3000);
    }

    // Input handlers
    handleMouseMove(event) {
        const grid = this.renderer.getGridAtMouse(event.clientX, event.clientY);
        this.gridPosDisplay.textContent = grid || '--';
    }

    handleWheel(event) {
        event.preventDefault();
        const zoomDelta = event.deltaY > 0 ? 5 : -5;
        this.renderer.zoomCamera(zoomDelta);
    }

    handleKeyDown(event) {
        // Camera pan with arrow keys
        const panSpeed = 2;
        switch (event.key) {
            case 'ArrowUp':
                this.renderer.panCamera(0, -panSpeed);
                break;
            case 'ArrowDown':
                this.renderer.panCamera(0, panSpeed);
                break;
            case 'ArrowLeft':
                this.renderer.panCamera(-panSpeed, 0);
                break;
            case 'ArrowRight':
                this.renderer.panCamera(panSpeed, 0);
                break;
        }
    }

    // UI helpers
    showFeedback(text) {
        this.commandFeedback.textContent = text;
        this.commandFeedback.classList.add('visible');
    }

    hideFeedback() {
        this.commandFeedback.classList.remove('visible');
    }
}

// Initialize and start
const game = new Game();
game.init();
