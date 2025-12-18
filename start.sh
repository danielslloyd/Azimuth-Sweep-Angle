#!/bin/bash
# Project Overwatch - Start Script
# Starts both backend server and frontend client

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}      PROJECT OVERWATCH              ${NC}"
echo -e "${BLUE}  Voice-Controlled Tactical Command  ${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check for --mock flag
USE_MOCK=""
if [[ "$1" == "--mock" ]]; then
    USE_MOCK="--mock"
    echo -e "${YELLOW}Running in MOCK mode (no GPU required)${NC}"
fi

# Check Python
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo -e "${RED}Error: Python not found. Please install Python 3.8+${NC}"
    exit 1
fi

PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found. Please install Node.js 16+${NC}"
    exit 1
fi

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing npm dependencies...${NC}"
    npm install
fi

# Check Python dependencies
echo -e "${YELLOW}Checking Python dependencies...${NC}"
$PYTHON_CMD -c "import websockets" 2>/dev/null || {
    echo -e "${YELLOW}Installing Python dependencies...${NC}"
    pip install -r requirements.txt
}

echo ""
echo -e "${GREEN}Starting services...${NC}"
echo -e "${BLUE}Backend:${NC}  http://localhost:8765 (WebSocket)"
echo -e "${GREEN}Frontend:${NC} http://localhost:3000"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend server
$PYTHON_CMD server/run_server.py $USE_MOCK &
SERVER_PID=$!

# Give server a moment to start
sleep 1

# Start frontend server
npx http-server client/public -p 3000 -c-1 --cors -s &
CLIENT_PID=$!

# Wait for both processes
wait $SERVER_PID $CLIENT_PID
