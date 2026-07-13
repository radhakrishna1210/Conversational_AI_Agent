"""
Intelligent Voice Selection Utility.

Analyzes input text to determine context and selects the most appropriate
voice from the available pool based on metadata (gender, style).

Rules:
    - product recommendation -> friendly (soft/bright)
    - narration -> professional (clear/deep)
"""

import re
import logging

logger = logging.getLogger(__name__)

# Keywords for context detection
KEYWORDS = {
    "recommendation": [
        r"\brecommend\b", r"\bbuy\b", r"\boffer\b", r"\bcheck out\b", 
        r"\bgreat choice\b", r"\bspecial\b", r"\bdiscount\b", r"\bdeal\b",
        r"\best\b", r"\btry\b"
    ],
    "narration": [
        r"\bonce upon\b", r"\bsection\b", r"\bchapter\b", r"\bfollowing\b",
        r"\bcontext\b", r"\bhistory\b", r"\bdescribe\b", r"\bexplanation\b"
    ]
}

def detect_context(text: str) -> str:
    """Determine the context of the text based on keywords."""
    text_lower = text.lower()
    
    # Check for recommendation keywords
    for pattern in KEYWORDS["recommendation"]:
        if re.search(pattern, text_lower):
            return "recommendation"
            
    # Check for narration keywords
    for pattern in KEYWORDS["narration"]:
        if re.search(pattern, text_lower):
            return "narration"
            
    return "default"

def select_intelligent_voice(text: str, voice_metadata: dict) -> str | None:
    """
    Selects the best voice name for the given text context.
    Returns the voice name (key in voice_metadata) or None if no voices available.
    """
    if not voice_metadata:
        return None
        
    context = detect_context(text)
    logger.info(f"Intelligent voice selection: context detected as '{context}'")
    
    # Define target attributes for each context
    if context == "recommendation":
        # Target: friendly (soft or bright)
        targets = ["soft", "bright"]
    elif context == "narration":
        # Target: professional (clear or deep)
        targets = ["clear", "deep"]
    else:
        # Default: just pick the first available or a 'clear' one
        targets = ["clear", "natural"]

    # Search for a voice that matches target styles
    for target_style in targets:
        for name, meta in voice_metadata.items():
            if meta.get("style") == target_style:
                logger.info(f"Selected voice '{name}' matching style '{target_style}' for context '{context}'")
                return name
                
    # Fallback: just return the first one
    return list(voice_metadata.keys())[0] if voice_metadata else None
