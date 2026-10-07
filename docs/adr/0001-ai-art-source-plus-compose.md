# ADR 0001: AI Art Source + deterministic Compose for character skins

Status: Accepted (2026-09-28)

## Context

`scripts/gen-sprites.mjs` draws every skin from one procedural skeleton. Recoloring it cannot produce a character-accurate skin: the old agumon read as an orange dog. Adding each new character meant writing new drawing code.

## Decision

Character skins start as an AI-generated **Art Source** (`assets/art-src/<skin>/`): a handful of curated 64x64 poses plus `skin.json`. The poses come from an external pose sheet imported with `scripts/import-art.mjs`, or from SpriteCook. `scripts/compose-skin.mjs` then turns them into the renderer's Sprite Sheets deterministically. Motion stays procedural in the renderer. Procedural skins (frenchie, steam) stay in `gen-sprites.mjs`.

## Rejected alternatives

- **Per-skin procedural rigs**: every skin costs hand-written drawing code.
- **AI animation**: frames drift, which breaks the fixed eye/ground anchors and the renderer's timing.
- **Hand-drawing every frame**: takes too long for each skin.

## Consequences

- The Art Source and the composed sheets are committed, so builds are reproducible offline with no credits.
- `verify-art` guards the contract: expression dimensions, the ground line, and eye-anchor parity between `skin.json` and `eyes.ts`.
- Changing a skin's look means new AI calls, then re-import or hand touch-up, then compose.
