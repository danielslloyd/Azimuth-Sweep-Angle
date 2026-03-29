// Project Overwatch - Main Entry Point
import { debugFeed } from './debug/DebugFeed.js';

debugFeed.log('INIT', '=== Project Overwatch starting ===');
debugFeed.log('INIT', `User agent: ${navigator.userAgent.slice(0, 80)}`);
debugFeed.log('INIT', `Page URL: ${location.href}`);
debugFeed.log('INIT', `Protocol: ${location.protocol} (HTTPS required for mic)`);

let Renderer, GameState, GamePhase, AudioManager, InputHandler, InputState, NetworkHandler, ConnectionState, Map01;

try {
    ({ Renderer } = await import('./rendering/Renderer.js'));
    debugFeed.log('INIT', 'Renderer module loaded ✓');
} catch (e) {
    debugFeed.error('INIT', `Failed to load Renderer: ${e.message}`);
}

try {
    ({ GameState, GamePhase } = await import('./game/GameState.js'));
    debugFeed.log('INIT', 'GameState module loaded ✓');
} catch (e) {
    debugFeed.error('INIT', `Failed to load GameState: ${e.message}`);
}

try {
    ({ AudioManager } = await import('./audio/AudioManager.js'));
    debugFeed.log('INIT', 'AudioManager module loaded ✓');
} catch (e) {
    debugFeed.error('INIT', `Failed to load AudioManager: ${e.message}`);
}

try {
    ({ InputHandler, InputState } = await import('./input/InputHandler.js'));
    debugFeed.log('INIT', 'InputHandler module loaded ✓');
} catch (e) {
    debugFeed.error('INIT', `Failed to load InputHandler: ${e.message}`);
}

try {
    ({ NetworkHandler, ConnectionState } = await import('./net/NetworkHandler.js'));
    debugFeed.log('INIT', 'NetworkHandler module loaded ✓');
} catch (e) {
    debugFeed.error('INIT', `Failed to load NetworkHandler: ${e.message}`);
}

try {
    ({ Map01 } = await import('./game/maps/Map01.js'));
    debugFeed.log('INIT', 'Map01 module loaded ✓');
} catch (e) {
    debugFeed.error('INIT', `Failed to load Map01: ${e.message}`);
}

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
        this.debugStatusDisplay = document.getElementById('debug-status');
        this.instructionsPanel = document.getElementById('instructions');
        this.startButton = document.getElementById('start-btn');

        // Game state
        this.isRunning = false;
        this.lastTime = performance.now();
        this.debugMode = false;

        // Server connection status
        this.serverConnected = false;

        // Fallback command parser for offline mode
        this.offlineMode = true;
    }

    async init() {
        debugFeed.attach('debug-feed');
        debugFeed.log('INIT', 'Game.init() starting...');

        // Check critical browser APIs upfront
        debugFeed.log('INIT', `WebSocket available: ${'WebSocket' in window}`);
        debugFeed.log('INIT', `MediaRecorder available: ${'MediaRecorder' in window}`);
        debugFeed.log('INIT', `getUserMedia available: ${!!(navigator.mediaDevices?.getUserMedia)}`);
        debugFeed.log('INIT', `AudioContext available: ${!!(window.AudioContext || window.webkitAudioContext)}`);
        debugFeed.log('INIT', `SpeechRecognition available: ${'SpeechRecognition' in window || 'webkitSpeechRecognition' in window}`);
        debugFeed.log('INIT', `importmap/ES modules: supported`);

        if (!Renderer || !GameState || !AudioManager || !InputHandler || !NetworkHandler || !Map01) {
            debugFeed.error('INIT', 'One or more modules failed to load — game cannot start. Check errors above.');
            return;
        }

        // Initialize canvas
        const canvas = document.getElementById('canvas');
        if (!canvas) {
            debugFeed.error('INIT', 'Canvas element #canvas not found in DOM!');
            return;
        }
        debugFeed.log('INIT', `Canvas found: ${canvas.width}x${canvas.height}`);

        try {
            this.renderer = new Renderer(canvas);
            debugFeed.log('INIT', 'Renderer instantiated ✓');
        } catch (e) {
            debugFeed.error('INIT', `Renderer constructor failed: ${e.message}`);
        }

        try {
            this.gameState = new GameState();
            debugFeed.log('INIT', 'GameState instantiated ✓');
        } catch (e) {
            debugFeed.error('INIT', `GameState constructor failed: ${e.message}`);
        }

        try {
            this.audioManager = new AudioManager();
            debugFeed.log('INIT', 'AudioManager instantiated ✓');
        } catch (e) {
            debugFeed.error('INIT', `AudioManager constructor failed: ${e.message}`);
        }

        try {
            this.inputHandler = new InputHandler();
            debugFeed.log('INIT', 'InputHandler instantiated ✓');
        } catch (e) {
            debugFeed.error('INIT', `InputHandler constructor failed: ${e.message}`);
        }

        try {
            this.networkHandler = new NetworkHandler();
            debugFeed.log('INIT', `NetworkHandler instantiated ✓ (target: ${this.networkHandler.serverUrl})`);
        } catch (e) {
            debugFeed.error('INIT', `NetworkHandler constructor failed: ${e.message}`);
        }

        // Setup callbacks
        this.setupCallbacks();
        debugFeed.log('INIT', 'Callbacks registered ✓');

        // Setup start button
        this.startButton.addEventListener('click', () => this.startGame());
        debugFeed.log('INIT', 'Start button listener attached ✓');
        debugFeed.log('INIT', 'Game.init() complete — waiting for user to click BEGIN MISSION');
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
                debugFeed.log('NET', 'Server connected ✓ — switching to online mode');
            },
            onDisconnected: () => {
                this.serverConnected = false;
                this.offlineMode = true;
                debugFeed.warn('NET', 'Server disconnected — falling back to offline/Web Speech mode');
            },
            onError: (err) => {
                debugFeed.error('NET', `Network error callback: ${err?.message || err}`);
            },
            onTranscription: (text) => this.handleTranscription(text),
            onCommandParsed: (command) => this.handleParsedCommand(command),
            onVoiceResponse: (audioData) => this.audioManager.playVoiceResponse(audioData),
            onDialogue: (text, speaker) => {
                debugFeed.log('CMD', `Dialogue [${speaker}]: "${text}"`);
                this.showFeedback(text);
            }
        });

        // Game state callbacks
        this.gameState.onUnitKilled = (unit) => this.handleUnitKilled(unit);
        this.gameState.onBulletFired = (bullet) => this.handleBulletFired(bullet);
        this.gameState.onAirstrikeImpact = (strike) => this.handleAirstrikeImpact(strike);
        this.gameState.onGameOver = (result) => this.handleGameOver(result);
    }

    async startGame() {
        debugFeed.log('INIT', '--- BEGIN MISSION clicked ---');

        // Initialize audio (requires user gesture)
        debugFeed.log('AUDIO', 'Calling AudioManager.init()...');
        try {
            await this.audioManager.init();
        } catch (e) {
            debugFeed.error('AUDIO', `audioManager.init() threw: ${e.message}`);
        }

        debugFeed.log('AUDIO', 'Calling AudioManager.resume()...');
        try {
            await this.audioManager.resume();
        } catch (e) {
            debugFeed.error('AUDIO', `audioManager.resume() threw: ${e.message}`);
        }

        // Hide instructions
        this.instructionsPanel.classList.add('hidden');
        debugFeed.log('INIT', 'Instructions panel hidden');

        // Try to connect to server
        debugFeed.log('NET', 'Initiating server connection...');
        this.networkHandler.connect();

        // Load map
        debugFeed.log('INIT', `Loading map: ${Map01?.name || 'Map01'}...`);
        try {
            this.gameState.initMission(Map01);
            const units = this.gameState.getAllUnits?.() ?? [];
            debugFeed.log('INIT', `Map loaded ✓ — ${units.length} units spawned (${units.filter(u => !u.isEnemy).length} friendly, ${units.filter(u => u.isEnemy).length} enemy)`);
        } catch (e) {
            debugFeed.error('INIT', `gameState.initMission() failed: ${e.message}`);
        }

        // Add terrain to renderer
        debugFeed.log('RENDER', 'Adding terrain to renderer...');
        try {
            this.renderer.addTerrain(this.gameState.terrain);
            debugFeed.log('RENDER', `Terrain added ✓ (${this.gameState.terrain?.length ?? '?'} objects)`);
        } catch (e) {
            debugFeed.error('RENDER', `addTerrain() failed: ${e.message}`);
        }

        // Start game loop
        this.isRunning = true;
        debugFeed.log('INIT', 'Starting game loop at 60fps...');
        this.gameLoop();

        // Show initial briefing
        const briefing = Map01?.briefing ?? 'Mission started';
        debugFeed.log('INIT', `Briefing: "${briefing}"`);
        this.showFeedback(briefing);
        setTimeout(() => this.hideFeedback(), 5000);

        debugFeed.log('INIT', '=== Game running ===');
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

        // Update airstrike target marker if pending
        if (this.gameState.pendingAirstrike) {
            const strike = this.gameState.pendingAirstrike;
            this.renderer.setAirstrikeTarget(strike.x, strike.z, strike.radius);
        } else {
            this.renderer.clearAirstrikeTarget();
        }

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

        // Update debug status
        if (this.debugStatusDisplay) {
            this.debugStatusDisplay.textContent = this.debugMode ? 'ON' : 'OFF';
            this.debugStatusDisplay.style.color = this.debugMode ? '#00ffff' : '#666';
        }

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
        debugFeed.log('VOICE', 'handleVoiceStart() — starting microphone recording...');
        const success = await this.audioManager.startRecording();
        if (!success) {
            debugFeed.error('VOICE', 'startRecording() returned false — mic unavailable or denied');
            this.showFeedback('Microphone access denied');
            this.inputHandler.resetState();
        } else {
            debugFeed.log('VOICE', 'Recording started ✓ — hold SPACE and speak');
        }
    }

    handleVoiceEnd() {
        debugFeed.log('VOICE', 'handleVoiceEnd() — stopping recording...');
        this.audioManager.stopRecording();
    }

    async handleRecordingComplete(audioBlob) {
        debugFeed.log('VOICE', `Recording complete: ${audioBlob?.size ?? '?'} bytes, type: "${audioBlob?.type}"`);

        if (!audioBlob || audioBlob.size === 0) {
            debugFeed.error('VOICE', 'Audio blob is empty — nothing was captured');
            this.inputHandler.resetState();
            return;
        }

        if (this.serverConnected) {
            debugFeed.log('VOICE', 'Server connected — sending audio for Whisper STT...');
            await this.networkHandler.sendAudio(audioBlob);
        } else {
            debugFeed.warn('VOICE', `Server not connected (offlineMode=${this.offlineMode}) — trying Web Speech API fallback`);
            this.useWebSpeechFallback();
        }
    }

    // Web Speech API fallback for offline mode
    useWebSpeechFallback() {
        const hasSR = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
        debugFeed.log('VOICE', `Web Speech API available: ${hasSR}`);

        if (!hasSR) {
            debugFeed.error('VOICE', 'SpeechRecognition not available — no voice input possible in offline mode');
            debugFeed.error('VOICE', 'Tip: Chrome/Edge support webkitSpeechRecognition; Firefox does not');
            this.showFeedback('Voice recognition not available');
            this.inputHandler.resetState();
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        debugFeed.log('VOICE', 'Web Speech recognition starting (lang: en-US)...');

        recognition.onstart = () => {
            debugFeed.log('VOICE', 'Web Speech recognition listening...');
        };

        recognition.onspeechstart = () => {
            debugFeed.log('VOICE', 'Speech detected by Web Speech API');
        };

        recognition.onspeechend = () => {
            debugFeed.log('VOICE', 'Speech ended, processing...');
        };

        recognition.onresult = (event) => {
            const result = event.results[0][0];
            const transcript = result.transcript;
            const confidence = result.confidence.toFixed(3);
            debugFeed.log('VOICE', `Web Speech result: "${transcript}" (confidence: ${confidence})`);
            this.handleTranscription(transcript);
        };

        recognition.onnomatch = () => {
            debugFeed.warn('VOICE', 'Web Speech: no match found for utterance');
            this.showFeedback('Could not understand command');
            this.inputHandler.resetState();
        };

        recognition.onerror = (event) => {
            debugFeed.error('VOICE', `Web Speech error: "${event.error}" — ${event.message || '(no message)'}`);
            if (event.error === 'not-allowed') {
                debugFeed.error('VOICE', '→ Microphone permission denied for Web Speech API');
            } else if (event.error === 'no-speech') {
                debugFeed.warn('VOICE', '→ No speech detected (too quiet or too short)');
            } else if (event.error === 'network') {
                debugFeed.error('VOICE', '→ Network error (Web Speech needs Google servers)');
            }
            this.showFeedback('Could not understand command');
            this.inputHandler.resetState();
        };

        recognition.onend = () => {
            debugFeed.log('VOICE', 'Web Speech recognition session ended');
        };

        try {
            recognition.start();
            debugFeed.log('VOICE', 'Web Speech recognition.start() called');
        } catch (e) {
            debugFeed.error('VOICE', `recognition.start() threw: ${e.message}`);
            this.inputHandler.resetState();
        }
    }

    // Handle transcribed text
    handleTranscription(text) {
        debugFeed.log('VOICE', `=== TRANSCRIPTION: "${text}" ===`);
        this.showFeedback(`"${text}"`);

        if (this.serverConnected) {
            debugFeed.log('CMD', `Sending text to server for NLP parsing: "${text}"`);
            this.networkHandler.sendTextCommand(text);
        } else {
            debugFeed.log('CMD', `Parsing locally (offline mode): "${text}"`);
            const command = this.parseCommandLocally(text);
            if (command) {
                debugFeed.log('CMD', `Local parse result: action="${command.action}", targets="${command.targets}", grid=${JSON.stringify(command.gridCoord)}`);
                this.handleParsedCommand(command);
            } else {
                debugFeed.warn('CMD', `Local parser could not parse: "${text}"`);
                debugFeed.warn('CMD', 'Try: "Alpha move to grid C5", "Call airstrike on grid D7", "Hold position"');
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
        debugFeed.log('CMD', `Executing: action="${command.action}" targets="${command.targets}" grid=${JSON.stringify(command.gridCoord)} params=${JSON.stringify(command.params ?? {})}`);

        let result;
        try {
            result = this.gameState.issueCommand(command);
        } catch (e) {
            debugFeed.error('CMD', `issueCommand() threw: ${e.message}`);
            return;
        }

        debugFeed.log('CMD', `Command result: success=${result.success}, message="${result.message}"`);

        // Show result feedback
        if (result.success) {
            this.audioManager.playConfirm();

            // Generate response based on action
            let response = '';
            switch (command.action) {
                case 'move':       response = 'Copy, moving to position.'; break;
                case 'hold':       response = 'Roger, holding position.'; break;
                case 'engage':     response = 'Copy, engaging targets.'; break;
                case 'cease_fire': response = 'Copy, holding fire.'; break;
                case 'airstrike':  response = result.message; break;
                default:           response = 'Copy.';
            }

            this.showFeedback(response);

            // Request TTS if connected
            if (this.serverConnected) {
                debugFeed.log('CMD', `Requesting TTS for: "${response}"`);
                this.networkHandler.requestVoice(response);
            }
        } else {
            debugFeed.warn('CMD', `Command failed: ${result.message}`);
            this.showFeedback(result.message);
        }

        setTimeout(() => this.hideFeedback(), 3000);
    }

    // Game event handlers
    handleUnitKilled(unit) {
        if (unit.isEnemy) {
            debugFeed.log('CMD', `Enemy killed at (${unit.x?.toFixed(1)}, ${unit.z?.toFixed(1)})`);
            this.showFeedback(`Tango down`);
        } else {
            debugFeed.warn('CMD', `Friendly ${unit.callsign} killed!`);
            this.showFeedback(`${unit.callsign} is down!`);
        }

        setTimeout(() => this.hideFeedback(), 2000);
    }

    handleBulletFired(bullet) {
        this.audioManager.playGunshot(bullet.x);
        this.renderer.addBullet(bullet);
    }

    handleAirstrikeImpact(strike) {
        debugFeed.log('CMD', `Airstrike impact: type=${strike.type}, pos=(${strike.x?.toFixed(1)}, ${strike.z?.toFixed(1)}), radius=${strike.radius}`);
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
        debugFeed.log('INIT', `=== GAME OVER: ${result.toUpperCase()} ===`);

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
            case 'd':
            case 'D':
                // Toggle 3D debug mode
                this.debugMode = this.renderer.toggleDebugMode();
                debugFeed.log('RENDER', `3D debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
                this.showFeedback(`Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
                setTimeout(() => this.hideFeedback(), 1500);
                break;
            case 'f':
            case 'F':
                // Toggle debug feed panel
                const feedVisible = debugFeed.toggle();
                debugFeed.log('INFO', `Debug feed panel: ${feedVisible ? 'shown' : 'hidden'}`);
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
