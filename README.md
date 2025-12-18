# Project Overwatch

A voice-controlled tactical overwatch game with a drone/IR view perspective.

## Quick Start

### Option 1: Using npm (recommended)
```bash
# Install all dependencies
npm run install:all

# Start both server and client (with GPU/Whisper)
npm start

# Or start in mock mode (no GPU required)
npm run dev
```

### Option 2: Using shell script
```bash
# Make executable (first time only)
chmod +x start.sh

# Start with GPU support
./start.sh

# Start in mock mode
./start.sh --mock
```

### Option 3: Windows
```cmd
start.bat
REM or
start.bat --mock
```

## Access the Game

Once started, open your browser to: **http://localhost:3000**

## Controls

| Key | Action |
|-----|--------|
| **Space** | Push-to-talk for voice commands |
| **D** | Toggle debug overlay |
| **Arrows** | Pan camera |
| **Scroll** | Zoom in/out |

## Voice Commands

- `"Alpha, move to grid C5"` - Move squad to position
- `"Alpha-1, move to D7"` - Move specific unit
- `"Squad, hold position"` - Hold current positions
- `"Engage targets"` - Open fire on enemies
- `"Call airstrike on grid E5"` - Request precision strike
- `"Cluster bomb on F6"` - Request cluster munitions

## Requirements

- **Node.js** 16+
- **Python** 3.8+
- **GPU with CUDA** (optional, for Whisper STT)

### Python Dependencies
```bash
pip install -r requirements.txt
```

Key packages:
- `websockets` - Server communication
- `openai-whisper` - Speech-to-text (requires GPU)
- `pyttsx3` - Text-to-speech

## Mock Mode

If you don't have a GPU, use mock mode which:
- Uses browser's Web Speech API for voice recognition
- Skips Whisper model loading
- Still provides full game functionality

## Project Structure

```
/client
  /public          - Static HTML/CSS
  /src
    /rendering     - Three.js renderer
    /audio         - Sound effects & voice
    /input         - Keyboard & voice input
    /game          - Game logic & units
    /net           - WebSocket client

/server
  /stt             - Speech-to-text (Whisper)
  /nlp             - Command parsing
  /tts             - Text-to-speech
  /dialogue        - AI responses
  /api             - WebSocket server
```

## Debug Overlay

Press **D** to toggle debug visuals:
- Unit FOV sight cones
- Movement destination markers
- Airstrike target indicators
- Path lines for moving units
