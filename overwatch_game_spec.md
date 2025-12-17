# Project Overwatch (Working Title)

## Purpose
This document is the authoritative starting spec for coding a browser-based, voice-only tactical overwatch game.  
Claude Code should **ask further clarifying questions as needed during implementation**, but may proceed with reasonable assumptions when blocked.

---

## High-Level Concept
A top-down / satellite-style battlefield game inspired by drone overwatch.  
The player **cannot use mouse or keyboard for commands** — all coordination is done via voice.

The player:
- Oversees a small infantry squad
- Issues movement and tactical commands via natural language
- Calls in precision airstrikes using grid coordinates
- Receives verbal confirmations and situational feedback from AI teammates

---

## Platform & Tech Stack
**Frontend**
- Browser-based
- Three.js for rendering
- JavaScript for game logic
- Web Audio API for audio playback

**Backend / Local Services**
- Python local server
- Local GPU required
- Responsibilities:
  - Speech-to-text (local model, e.g. Whisper-class)
  - Natural language parsing
  - LLM-based dialogue responses
  - Text-to-speech (local, slower-than-realtime acceptable)

Communication between browser and local server via WebSocket or WebRTC.

---

## Core Gameplay Loop
1. Battlefield rendered from an overhead IR/drone-like perspective
2. Player speaks a command
3. Command is transcribed locally
4. Parsed into:
   - Intent
   - Unit(s)
   - Location (grid)
   - Action
5. Squad AI confirms verbally
6. Units execute actions
7. Enemy reacts
8. Player adapts via further voice commands

---

## Squad & Units
- Initial squad size: **4**
- All start as identical riflemen
- One-hit kill rules:
  - Small arms: probabilistic accuracy
  - Explosions: radial kill probability
- No HP bars, morale, or damage states

---

## Command System
- Natural language voice commands only
- Examples:
  - “Alpha team move to grid C5 and hold”
  - “Call precision strike on D7”
- Ambiguous commands:
  - AI asks for clarification verbally
- Confirmations:
  - Always verbal (“Copy”, “Moving now”, etc.)

---

## Air Support
- Precision airstrikes only
  - Bombs
  - Cluster munitions
- Voice-only targeting using grid coordinates
- Constraints:
  - Cooldown-based usage
  - Friendly-fire enabled
  - Infantry LOS matters for gunfire
  - Airstrikes ignore LOS

---

## Visual Style
- Stylized minimalist IR/drone view:
  - Ground: dark/cold
  - Trees/terrain: medium gray
  - Humans, vehicles, bullets, explosions: bright/white (“hot”)
- Clean, readable silhouettes
- No UI clutter; rely on audio feedback

---

## AI Teammates
Hybrid AI model:
- Deterministic command parsing and execution
- LLM-generated dialogue and flavor
- Personalities may emerge but should not override command correctness

Latency mitigation strategies encouraged:
- Pre-canned verbal acknowledgments
- Parallel TTS generation
- Audio interruption/overlap allowed if needed

---

## Maps & Progression
- Start with:
  - One small handcrafted map
- Expand to:
  - Procedurally generated maps
  - Campaign-style progression

---

## Folder Structure (Initial)
Claude Code should generate and maintain a structure similar to:

/client
  /public
  /src
    /rendering
    /audio
    /input
    /game
    /net

/server
  /stt
  /tts
  /nlp
  /dialogue
  /api

/assets
  /audio
  /models
  /maps

/docs

---

## Open-Ended Instructions for Claude Code
- Ask the user clarifying questions when assumptions affect architecture
- Favor modularity and replaceable components
- Optimize for low-latency voice interaction
- Treat this document as a living source of truth
