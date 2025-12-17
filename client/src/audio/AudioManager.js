// Audio Manager - Handles sound effects and voice playback

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
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0.5;

            // Generate procedural sounds
            await this.generateSounds();

            this.isInitialized = true;
            console.log('AudioManager initialized');
        } catch (error) {
            console.error('Failed to initialize AudioManager:', error);
        }
    }

    // Generate procedural sound effects
    async generateSounds() {
        // Gunshot sound
        this.sounds.gunshot = this.createGunshot();

        // Explosion sound
        this.sounds.explosion = this.createExplosion();

        // Radio click
        this.sounds.radioClick = this.createRadioClick();

        // Confirmation beep
        this.sounds.confirm = this.createConfirmBeep();
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

        try {
            // Play radio click before voice
            this.playRadioClick();
            await this.delay(100);

            // Decode and play voice
            const audioBuffer = await this.audioContext.decodeAudioData(audioData);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            source.onended = () => {
                this.processVoiceQueue();
            };

            source.start();
        } catch (error) {
            console.error('Error playing voice:', error);
            this.processVoiceQueue();
        }
    }

    // Start recording voice
    async startRecording() {
        if (this.isRecording) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                if (this.onRecordingComplete) {
                    this.onRecordingComplete(audioBlob);
                }

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.playRadioClick();

            return true;
        } catch (error) {
            console.error('Failed to start recording:', error);
            return false;
        }
    }

    // Stop recording voice
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;

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
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}
