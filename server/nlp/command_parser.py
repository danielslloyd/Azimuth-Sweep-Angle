#!/usr/bin/env python3
"""
Natural Language Command Parser
Parses voice commands into structured game commands
"""

import re
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger('overwatch.nlp')


class CommandParser:
    """Parse natural language into game commands"""

    def __init__(self):
        # Grid coordinate pattern (e.g., "A5", "grid C3", "charlie 7")
        self.grid_pattern = re.compile(
            r'(?:grid\s+)?([a-j])\s*(\d+)',
            re.IGNORECASE
        )

        # NATO phonetic alphabet for grid letters
        self.phonetic_to_letter = {
            'alpha': 'a', 'bravo': 'b', 'charlie': 'c', 'delta': 'd',
            'echo': 'e', 'foxtrot': 'f', 'golf': 'g', 'hotel': 'h',
            'india': 'i', 'juliet': 'j'
        }

        # Number words
        self.word_to_number = {
            'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
            'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
            'zero': '0'
        }

        # Action keywords
        self.action_keywords = {
            'move': ['move', 'go', 'advance', 'proceed', 'relocate', 'head'],
            'hold': ['hold', 'stop', 'stay', 'halt', 'wait', 'position'],
            'engage': ['engage', 'attack', 'fire', 'eliminate', 'take out', 'shoot'],
            'cease_fire': ['cease fire', 'hold fire', 'stop firing', 'weapons hold'],
            'airstrike': ['airstrike', 'air strike', 'bomb', 'strike', 'ordnance', 'precision strike'],
        }

        # Target keywords
        self.target_keywords = {
            'all': ['squad', 'team', 'all', 'everyone', 'everybody'],
            'alpha-1': ['alpha 1', 'alpha-1', 'alpha one', 'one'],
            'alpha-2': ['alpha 2', 'alpha-2', 'alpha two', 'two'],
            'alpha-3': ['alpha 3', 'alpha-3', 'alpha three', 'three'],
            'alpha-4': ['alpha 4', 'alpha-4', 'alpha four', 'four'],
        }

    def parse(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Parse natural language command into structured command

        Args:
            text: Natural language command string

        Returns:
            Parsed command dict or None if cannot parse
        """
        if not text:
            return None

        text = text.lower().strip()
        logger.info(f"Parsing command: {text}")

        # Normalize phonetic alphabet
        text = self._normalize_phonetics(text)

        # Parse action
        action = self._parse_action(text)
        if not action:
            logger.warning(f"Could not identify action in: {text}")
            return None

        # Parse target units
        targets = self._parse_targets(text)

        # Parse grid coordinate
        grid_coord = self._parse_grid(text)

        # Parse additional parameters
        params = self._parse_params(text, action)

        command = {
            'action': action,
            'targets': targets,
            'gridCoord': grid_coord,
            'params': params
        }

        logger.info(f"Parsed command: {command}")
        return command

    def _normalize_phonetics(self, text: str) -> str:
        """Convert NATO phonetic alphabet to letters"""
        result = text

        # Convert phonetic letters
        for phonetic, letter in self.phonetic_to_letter.items():
            result = re.sub(
                rf'\b{phonetic}\b(?!\s*\d)',  # Don't match if followed by digit (team names)
                letter,
                result
            )

        # Convert number words
        for word, digit in self.word_to_number.items():
            result = re.sub(rf'\b{word}\b', digit, result)

        return result

    def _parse_action(self, text: str) -> Optional[str]:
        """Identify action from text"""
        for action, keywords in self.action_keywords.items():
            for keyword in keywords:
                if keyword in text:
                    return action
        return None

    def _parse_targets(self, text: str) -> str:
        """Identify target units from text"""
        # Check specific unit targets first
        for target, keywords in self.target_keywords.items():
            if target == 'all':
                continue
            for keyword in keywords:
                if keyword in text:
                    return target

        # Default to all/squad
        for keyword in self.target_keywords['all']:
            if keyword in text:
                return 'all'

        # If no target specified, assume all
        return 'all'

    def _parse_grid(self, text: str) -> Optional[Dict[str, float]]:
        """Parse grid coordinate from text"""
        match = self.grid_pattern.search(text)

        if match:
            letter = match.group(1).upper()
            number = int(match.group(2))

            if 1 <= number <= 10:
                # Convert to world coordinates
                # Grid is 10x10, each cell is 10 units
                # A1 is at (-45, -45), J10 is at (45, 45)
                col_index = ord(letter) - ord('A')
                row_index = number - 1

                x = (col_index - 4.5) * 10
                z = (row_index - 4.5) * 10

                return {'x': x, 'z': z}

        return None

    def _parse_params(self, text: str, action: str) -> Dict[str, Any]:
        """Parse additional parameters based on action"""
        params = {}

        if action == 'airstrike':
            if 'cluster' in text:
                params['type'] = 'cluster'
            else:
                params['type'] = 'precision'

        return params

    def get_help(self) -> List[str]:
        """Get list of example commands"""
        return [
            "Alpha team move to grid C5",
            "Squad advance to D7",
            "Alpha-1 hold position",
            "Team engage targets",
            "Cease fire",
            "Call airstrike on grid E5",
            "Precision strike on F8",
            "Cluster bomb on G4"
        ]


class LLMCommandParser(CommandParser):
    """
    Extended command parser using LLM for complex/ambiguous commands
    Falls back to base parser for simple commands
    """

    def __init__(self, llm_backend: str = "local"):
        super().__init__()
        self.llm_backend = llm_backend
        self.llm = None

    async def initialize_llm(self):
        """Initialize LLM backend for complex parsing"""
        # Placeholder for LLM initialization
        # Could use local llama.cpp, ollama, or API-based solution
        logger.info(f"LLM command parser initialized ({self.llm_backend})")

    async def parse_with_llm(self, text: str) -> Optional[Dict[str, Any]]:
        """
        Use LLM for complex command parsing

        This handles:
        - Ambiguous commands
        - Multi-step commands
        - Context-dependent commands
        """
        # First try simple parsing
        result = self.parse(text)

        if result:
            return result

        # If simple parsing fails, use LLM
        # This is a placeholder - actual implementation would call LLM
        logger.info(f"Attempting LLM parsing for: {text}")

        # For now, return None if simple parsing fails
        return None
