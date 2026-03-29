// Input Handler - Manages voice input and keyboard shortcuts
import { debugFeed } from '../debug/DebugFeed.js';

debugFeed.log('INIT', 'InputHandler module loaded');

export const InputState = {
    IDLE: 'idle',
    LISTENING: 'listening',
    PROCESSING: 'processing'
};

export class InputHandler {
    constructor() {
        this.state = InputState.IDLE;

        // Callbacks
        this.onVoiceStart = null;
        this.onVoiceEnd = null;
        this.onKeyDown = null;
        this.onKeyUp = null;
        this.onMouseMove = null;
        this.onWheel = null;

        // Push-to-talk key
        this.pttKey = ' '; // Spacebar
        this.isPTTHeld = false;

        // Mouse position for grid lookup
        this.mouseX = 0;
        this.mouseY = 0;

        this.setupEventListeners();
    }

    setupEventListeners() {
        debugFeed.log('INPUT', 'Registering event listeners: keydown, keyup, mousemove, wheel');
        // Keyboard events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Mouse events
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('wheel', (e) => this.handleWheel(e));

        // Prevent context menu on right click
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        debugFeed.log('INPUT', `PTT key: SPACE | Other keys: Arrows, D (3D debug), F (feed toggle)`);
    }

    handleKeyDown(event) {
        // Ignore if in input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Push-to-talk
        if (event.key === this.pttKey && !event.repeat) {
            event.preventDefault();
            this.startVoiceInput();
            return;
        }

        // Other key handlers
        if (this.onKeyDown) {
            this.onKeyDown(event);
        }
    }

    handleKeyUp(event) {
        // Push-to-talk release
        if (event.key === this.pttKey) {
            event.preventDefault();
            this.stopVoiceInput();
            return;
        }

        if (this.onKeyUp) {
            this.onKeyUp(event);
        }
    }

    handleMouseMove(event) {
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;

        if (this.onMouseMove) {
            this.onMouseMove(event);
        }
    }

    handleWheel(event) {
        if (this.onWheel) {
            this.onWheel(event);
        }
    }

    // Start voice input
    startVoiceInput() {
        if (this.state !== InputState.IDLE) {
            debugFeed.warn('INPUT', `PTT pressed but state is "${this.state}" (not idle), ignoring`);
            return;
        }

        this.state = InputState.LISTENING;
        this.isPTTHeld = true;
        debugFeed.log('INPUT', 'PTT pressed → state: LISTENING');

        if (this.onVoiceStart) {
            this.onVoiceStart();
        } else {
            debugFeed.error('INPUT', 'onVoiceStart callback not set!');
        }
    }

    // Stop voice input
    stopVoiceInput() {
        if (this.state !== InputState.LISTENING) {
            debugFeed.warn('INPUT', `PTT released but state is "${this.state}" (not listening), ignoring`);
            return;
        }

        this.state = InputState.PROCESSING;
        this.isPTTHeld = false;
        debugFeed.log('INPUT', 'PTT released → state: PROCESSING');

        if (this.onVoiceEnd) {
            this.onVoiceEnd();
        } else {
            debugFeed.error('INPUT', 'onVoiceEnd callback not set!');
        }
    }

    // Set state back to idle (called after processing complete)
    resetState() {
        debugFeed.log('INPUT', `resetState() called (was: ${this.state}) → IDLE`);
        this.state = InputState.IDLE;
    }

    // Set processing state
    setProcessing() {
        this.state = InputState.PROCESSING;
    }

    // Get current state
    getState() {
        return this.state;
    }

    // Check if currently listening
    isListening() {
        return this.state === InputState.LISTENING;
    }

    // Check if currently processing
    isProcessing() {
        return this.state === InputState.PROCESSING;
    }

    // Set callbacks
    setCallbacks(callbacks) {
        if (callbacks.onVoiceStart) this.onVoiceStart = callbacks.onVoiceStart;
        if (callbacks.onVoiceEnd) this.onVoiceEnd = callbacks.onVoiceEnd;
        if (callbacks.onKeyDown) this.onKeyDown = callbacks.onKeyDown;
        if (callbacks.onKeyUp) this.onKeyUp = callbacks.onKeyUp;
        if (callbacks.onMouseMove) this.onMouseMove = callbacks.onMouseMove;
        if (callbacks.onWheel) this.onWheel = callbacks.onWheel;
    }

    // Get mouse position
    getMousePosition() {
        return { x: this.mouseX, y: this.mouseY };
    }
}
