#!/usr/bin/env python3
"""
Dialogue Manager
Generates natural language responses for AI teammates
"""

import random
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger('overwatch.dialogue')


class DialogueManager:
    """Manage AI teammate dialogue and responses"""

    def __init__(self):
        # Response templates organized by action
        self.responses = {
            'move': [
                "Copy, moving to position.",
                "Roger, advancing now.",
                "Moving.",
                "Copy that, relocating.",
                "On the move.",
                "Moving to grid.",
            ],
            'hold': [
                "Roger, holding position.",
                "Copy, holding.",
                "Staying put.",
                "Position held.",
                "Not moving.",
            ],
            'engage': [
                "Copy, engaging targets.",
                "Weapons free.",
                "Engaging.",
                "Opening fire.",
                "Contact, engaging.",
            ],
            'cease_fire': [
                "Copy, holding fire.",
                "Weapons hold.",
                "Ceasing fire.",
                "Roger, holding.",
            ],
            'airstrike': [
                "Airstrike inbound. Impact in {delay} seconds.",
                "Copy, calling in air support. {delay} seconds to impact.",
                "Ordnance on the way. Danger close in {delay}.",
            ],
            'airstrike_ready': [
                "Airstrike available.",
                "Air support standing by.",
            ],
            'airstrike_cooldown': [
                "Negative, airstrike on cooldown. {time} seconds remaining.",
                "Air support unavailable. Reloading in {time}.",
            ],
            'clarify': [
                "Say again?",
                "Did not copy.",
                "Repeat command.",
                "Say again, over.",
            ],
            'confirm_target': [
                "Confirm target location.",
                "Need coordinates.",
                "Specify grid.",
            ],
            'kill_enemy': [
                "Tango down.",
                "Target eliminated.",
                "Hostile neutralized.",
                "Got him.",
            ],
            'kill_friendly': [
                "Man down!",
                "{callsign} is down!",
                "We lost {callsign}!",
            ],
            'contact': [
                "Contact!",
                "Enemy spotted!",
                "Hostiles sighted!",
                "We've got company!",
            ],
            'under_fire': [
                "Taking fire!",
                "Contact, we're engaged!",
                "Under fire!",
            ],
            'victory': [
                "Area secure.",
                "All hostiles eliminated.",
                "Mission complete.",
            ],
            'defeat': [
                "Mission failed.",
                "We're done.",
            ],
        }

        # Personality variations (for future expansion)
        self.personalities = {
            'professional': {
                'prefix': '',
                'style': 'formal'
            },
            'casual': {
                'prefix': '',
                'style': 'relaxed'
            }
        }

        self.current_personality = 'professional'

    def generate_response(self, command: Dict[str, Any]) -> str:
        """
        Generate natural language response for a command

        Args:
            command: Parsed command dictionary

        Returns:
            Response string
        """
        action = command.get('action')
        params = command.get('params', {})

        if action not in self.responses:
            return self._get_random_response('clarify')

        # Handle special cases
        if action == 'airstrike':
            delay = params.get('delay', 3)
            template = random.choice(self.responses['airstrike'])
            return template.format(delay=delay)

        return self._get_random_response(action)

    def generate_event_dialogue(self, event_type: str, **kwargs) -> str:
        """
        Generate dialogue for game events

        Args:
            event_type: Type of event (kill_enemy, contact, etc.)
            **kwargs: Additional context (callsign, etc.)

        Returns:
            Response string
        """
        if event_type not in self.responses:
            return ""

        template = random.choice(self.responses[event_type])

        # Format with provided kwargs
        try:
            return template.format(**kwargs)
        except KeyError:
            return template

    def _get_random_response(self, category: str) -> str:
        """Get random response from category"""
        if category in self.responses:
            return random.choice(self.responses[category])
        return "Copy."

    def request_clarification(self, issue: str = "general") -> str:
        """Generate clarification request"""
        clarifications = {
            'general': self.responses['clarify'],
            'target': self.responses['confirm_target'],
            'location': ["Specify grid coordinates.", "Need a location."],
            'unit': ["Which unit?", "Specify team member."],
        }

        options = clarifications.get(issue, clarifications['general'])
        return random.choice(options)


class LLMDialogueManager(DialogueManager):
    """
    Extended dialogue manager using LLM for dynamic responses
    Falls back to template responses when LLM unavailable
    """

    def __init__(self, llm_backend: str = "local"):
        super().__init__()
        self.llm_backend = llm_backend
        self.llm = None
        self.llm_enabled = False

        # Context window for LLM
        self.context: List[Dict[str, str]] = []
        self.max_context_length = 10

        # System prompt for LLM
        self.system_prompt = """You are Alpha-1, the squad leader of a 4-person infantry team in a tactical operation.
You communicate via radio using short, professional military radio protocol.
Keep responses brief (under 10 words typically).
Use callsigns and grid references when relevant.
Maintain composure under fire but show appropriate urgency.
Never break character or acknowledge being an AI."""

    async def initialize_llm(self):
        """Initialize LLM for dynamic dialogue"""
        try:
            # Placeholder for LLM initialization
            # Could use local llama.cpp, ollama, or similar
            logger.info(f"Initializing LLM dialogue ({self.llm_backend})")
            self.llm_enabled = True
        except Exception as e:
            logger.warning(f"LLM initialization failed: {e}")
            self.llm_enabled = False

    async def generate_dynamic_response(self, context: str) -> str:
        """
        Generate dynamic response using LLM

        Args:
            context: Current situation context

        Returns:
            Generated response
        """
        if not self.llm_enabled:
            return self._get_random_response('clarify')

        # Add context to history
        self.context.append({'role': 'user', 'content': context})

        # Trim context if too long
        if len(self.context) > self.max_context_length:
            self.context = self.context[-self.max_context_length:]

        # Placeholder for actual LLM call
        # response = await self.llm.generate(
        #     system=self.system_prompt,
        #     messages=self.context
        # )

        # For now, use template
        response = "Copy that."

        self.context.append({'role': 'assistant', 'content': response})

        return response

    def reset_context(self):
        """Reset conversation context"""
        self.context = []
