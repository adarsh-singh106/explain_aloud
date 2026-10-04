# Acceptance Criteria

## Parser
Fixture correctly identifies:
- paragraph
- heading
- list
- code
- table

No content silently disappears.

## Table
- every spoken critical number exists in source/derived facts
- no reversed min/max
- no invented entity
- no invented causal relationship

## Code
- explicitly narrated identifiers exist in source
- no unsupported behavior
- Natural mode does not read punctuation line-by-line

## Narration
- every LLM segment has sourceBlockIds
- factual segments have factIds
- no unresolved “as shown above/below”
- failed validation triggers fallback

## Audio
- one Kokoro voice end-to-end
- play
- pause
- skip
- cancel

## Privacy
- no telemetry
- no cloud API
- no `<all_urls>`
- only selected response processed

## Demo
One mixed response can be extracted, narrated, validated, spoken, and compared with native Read Aloud.
