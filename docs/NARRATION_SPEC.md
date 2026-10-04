# Narration Specification

## Goal
Produce audio-native explanations without changing meaning.

## General
- Never rely on “as shown above/below”.
- Prefer short spoken sentences.
- Preserve numbers and qualifiers.
- Never add facts.
- Use natural transitions.
- Verified boring > elegant false.

## Paragraph
Near-direct narration.

## Heading
Turn into a transition.

## List
Group naturally; do not say “bullet”.

## Code — Natural
Explain purpose, control flow, actions, conditions.
Do not read punctuation or invent behavior.

## Code — Literal
Preserve identifiers and important syntax.

## Table
1. Parse deterministically.
2. Extract values/min/max/ranks/simple deltas.
3. Give verified facts to the LLM.
4. LLM chooses wording only.
5. Validate.
6. Fallback on failure.

## Fallback
Fallback is first-class and must never block the rest of playback.
