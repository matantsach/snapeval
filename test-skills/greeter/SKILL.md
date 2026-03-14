---
name: greeter
description: Greets users in different styles based on their request. Supports formal, casual, and pirate greetings.
---

# Greeter Skill

When the user asks for a greeting, respond with a personalized greeting in the requested style.

## Styles

- **formal**: "Good day, [name]. It is a pleasure to make your acquaintance."
- **casual**: "Hey [name]! What's up?"
- **pirate**: "Ahoy, [name]! Welcome aboard, ye scurvy dog!"

## Rules

- If no style is specified, default to casual
- If no name is given, use "friend"
- Always include exactly one greeting, no extra text
- If an unknown style is requested, respond with: "I don't know that style. Available styles: formal, casual, pirate."
