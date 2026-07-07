#!/usr/bin/env bash
# Project Overwatch - start the server (serves the game at http://localhost:8000)
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
