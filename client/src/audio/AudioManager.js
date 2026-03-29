// Audio Manager - Handles sound effects and voice playback
import { debugFeed } from '../debug/DebugFeed.js';

debugFeed.log('INIT', 'AudioManager module loaded');

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.gainNode = null;
        this.isInitialized = false;

        // Sound effect buffers
        this.sounds = {};

        // Voice queue for AI responses
        this.voiceQueue = [];
        this.isPlayingVoice = false;

        // Recording state
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.onRecordingComplete = null;
    }

    // Initialize audio context (must be called from user gesture)
    async init() {
        if (this.isInitialized) {
            debugFeed.log('AUDIO', 'init() called but already initialized, skipping');
            return;
        }

        debugFeed.log('AUDIO', 'Initializing AudioContext...');

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) {
                debugFeed.error('AUDIO', 'AudioContext API not available in this browser');
                return;
            }
            debugFeed.log('AUDIO', `Using ${window.AudioContext ? 'AudioContext' : 'webkitAudioContext'}`);

            this.audioContext = new AudioCtx();
            debugFeed.log('AUDIO', `AudioContext created, state: ${this.audioContext.state}`);

            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0.5;
            debugFeed.log('AUDIO', 'GainNode connected to destination');

            // Generate procedural sounds
            await this.generateSounds();

            this.isInitialized = true;
            debugFeed.log('AUDIO', 'AudioManager fully initialized ✓');
        } catch (error) {
            debugFeed.error('AUDIO', `init() failed: ${error.message}`);
        }
    }

    // Generate procedural sound effects
    async generateSounds() {
        debugFeed.log('AUDIO', 'Generating procedural sound buffers...');
        this.sounds.gunshot    = this.createGunshot();
        this.sounds.explosion  = this.createExplosion();
        this.sounds.radioClick = this.createRadioClick();
        this.sounds.confirm    = this.createConfirmBeep();
        debugFeed.log('AUDIO', `Sound buffers created: ${Object.keys(this.sounds).join(', ')}`);
    }

    // Create gunshot sound
    createGunshot() {
        const duration = 0.15;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / sampleRate;
            // Sharp attack, quick decay
            const envelope = Math.exp(-t * 40);
            // Noise with some low frequency
            const noise = (Math.random() * 2 - 1) * envelope;
            const lowFreq = Math.sin(t * 150 * Math.PI * 2) * envelope * 0.5;
            data[i] = (noise + lowFreq) * 0.3;
        }

        return buffer;
    }

    // Create explosion sound
    createExplosion() {
        const duration = 1.5;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / sampleRate;
            // Longer decay with rumble
            const envelope = Math.exp(-t * 3) * (1 + Math.sin(t * 5) * 0.3);
            // Low frequency rumble with noise
            const noise = (Math.random() * 2 - 1) * envelope;
            const lowFreq = Math.sin(t * 40 * Math.PI * 2) * envelope * 0.8;
            const midFreq = Math.sin(t * 80 * Math.PI * 2) * envelope * 0.3;
            data[i] = (noise * 0.5 + lowFreq + midFreq) * 0.4;
        }

        return buffer;
    }

    // Create radio click sound
    createRadioClick() {
        const duration = 0.05;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / sampleRate;
            const envelope = t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) * 100);
            data[i] = Math.sin(t * 2000 * Math.PI * 2) * envelope * 0.2;
        }

        return buffer;
    }

    // Create confirmation beep
    createConfirmBeep() {
        const duration = 0.1;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            const t = i / sampleRate;
            const envelope = Math.sin(t / duration * Math.PI);
            data[i] = Math.sin(t * 800 * Math.PI * 2) * envelope * 0.15;
        }

        return buffer;
    }

    // Play a sound effect
    playSound(name, volume = 1.0, pan = 0) {
        if (!this.isInitialized || !this.sounds[name]) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds[name];

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;

        // Create panner for spatial audio
        const panner = this.audioContext.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));

        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(this.gainNode);

        source.start();
    }

    // Play gunshot with position-based panning
    playGunshot(x) {
        // Convert x position (-50 to 50) to pan (-1 to 1)
        const pan = Math.max(-1, Math.min(1, x / 50));
        this.playSound('gunshot', 0.6 + Math.random() * 0.2, pan);
    }

    // Play explosion with position-based panning
    playExplosion(x) {
        const pan = Math.max(-1, Math.min(1, x / 50));
        this.playSound('explosion', 1.0, pan);
    }

    // Play radio click (for voice transmissions)
    playRadioClick() {
        this.playSound('radioClick', 0.8, 0);
    }

    // Play confirmation beep
    playConfirm() {
        this.playSound('confirm', 0.5, 0);
    }

    // Queue and play AI voice response
    async playVoiceResponse(audioData) {
        debugFeed.log('AUDIO', `Voice response queued (${audioData?.byteLength ?? '?'} bytes), queue length: ${this.voiceQueue.length + 1}`);
        this.voiceQueue.push(audioData);

        if (!this.isPlayingVoice) {
            this.processVoiceQueue();
        }
    }

    // Process voice queue
    async processVoiceQueue() {
        if (this.voiceQueue.length === 0) {
            this.isPlayingVoice = false;
            return;
        }

        this.isPlayingVoice = true;
        const audioData = this.voiceQueue.shift();
        debugFeed.log('AUDIO', `Decoding TTS audio (${audioData?.byteLength ?? '?'} bytes)...`);

        try {
            // Play radio click before voice
            this.playRadioClick();
            await this.delay(100);

            // Decode and play voice
            const audioBuffer = await this.audioContext.decodeAudioData(audioData);
            debugFeed.log('AUDIO', `TTS decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.numberOfChannels}ch @ ${audioBuffer.sampleRate}Hz`);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            source.onended = () => {
                debugFeed.log('AUDIO', 'TTS playback finished');
                this.processVoiceQueue();
            };

            source.start();
        } catch (error) {
            debugFeed.error('AUDIO', `processVoiceQueue() decode/play failed: ${error.message}`);
            this.processVoiceQueue();
        }
    }

    // Start recording voice
    async startRecording() {
        if (this.isRecording) {
            debugFeed.warn('AUDIO', 'startRecording() called but already recording');
            return;
        }

        debugFeed.log('AUDIO', 'Requesting microphone via getUserMedia...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            debugFeed.error('AUDIO', 'getUserMedia not available — browser may lack mic support or need HTTPS');
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const tracks = stream.getAudioTracks();
            debugFeed.log('AUDIO', `Microphone granted ✓ — track: "${tracks[0]?.label || 'unknown'}", ${tracks.length} track(s)`);

            const mimeType = 'audio/webm;codecs=opus';
            const supported = MediaRecorder.isTypeSupported(mimeType);
            debugFeed.log('AUDIO', `MediaRecorder mimeType "${mimeType}" supported: ${supported}`);

            this.mediaRecorder = new MediaRecorder(stream, supported ? { mimeType } : {});
            debugFeed.log('AUDIO', `MediaRecorder created, actual mimeType: "${this.mediaRecorder.mimeType}"`);

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    debugFeed.log('AUDIO', `Audio chunk received: ${event.data.size} bytes (total chunks: ${this.audioChunks.length})`);
                } else {
                    debugFeed.warn('AUDIO', 'ondataavailable fired but chunk was empty (0 bytes)');
                }
            };

            this.mediaRecorder.onerror = (event) => {
                debugFeed.error('AUDIO', `MediaRecorder error: ${event.error?.message || event}`);
            };

            this.mediaRecorder.onstop = () => {
                const totalBytes = this.audioChunks.reduce((s, c) => s + c.size, 0);
                debugFeed.log('AUDIO', `Recording stopped — ${this.audioChunks.length} chunks, ${totalBytes} bytes total`);

                if (this.audioChunks.length === 0) {
                    debugFeed.error('AUDIO', 'No audio chunks captured — recording may have been too short or mic failed');
                }

                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                debugFeed.log('AUDIO', `Blob created: ${audioBlob.size} bytes, type: "${audioBlob.type}"`);

                if (this.onRecordingComplete) {
                    this.onRecordingComplete(audioBlob);
                } else {
                    debugFeed.error('AUDIO', 'onRecordingComplete callback not set!');
                }

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            debugFeed.log('AUDIO', `MediaRecorder started, state: "${this.mediaRecorder.state}"`);
            this.playRadioClick();

            return true;
        } catch (error) {
            debugFeed.error('AUDIO', `startRecording() failed: ${error.name}: ${error.message}`);
            if (error.name === 'NotAllowedError') {
                debugFeed.error('AUDIO', '→ Microphone permission DENIED by user or browser policy');
            } else if (error.name === 'NotFoundError') {
                debugFeed.error('AUDIO', '→ No microphone device found');
            }
            return false;
        }
    }

    // Stop recording voice
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            debugFeed.warn('AUDIO', `stopRecording() called but not recording (isRecording=${this.isRecording}, mediaRecorder=${!!this.mediaRecorder})`);
            return;
        }

        debugFeed.log('AUDIO', `Stopping MediaRecorder (state: "${this.mediaRecorder.state}")...`);
        this.mediaRecorder.stop();
        this.isRecording = false;
        this.playRadioClick();
    }

    // Set recording complete callback
    setOnRecordingComplete(callback) {
        this.onRecordingComplete = callback;
    }

    // Helper delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Set master volume
    setVolume(volume) {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    // Resume audio context (for autoplay policies)
    async resume() {
        if (!this.audioContext) {
            debugFeed.warn('AUDIO', 'resume() called but audioContext is null');
            return;
        }
        debugFeed.log('AUDIO', `AudioContext state before resume: "${this.audioContext.state}"`);
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            debugFeed.log('AUDIO', `AudioContext resumed, new state: "${this.audioContext.state}"`);
        } else {
            debugFeed.log('AUDIO', `AudioContext not suspended, no resume needed (state: "${this.audioContext.state}")`);
        }
    }
}
