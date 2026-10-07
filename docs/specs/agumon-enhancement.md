# Spec: Agumon Skin Enhancement + Generic Skin Compose Pipeline

Status: **Approved**. The Art Source came from a Gemini pose sheet (§6, route B), so no credits were spent.
Date: 2026-09-28

## 1. Problem

- `assets/sprites/agumon/*` is drawn by `scripts/gen-sprites.mjs` using a recolored frenchie skeleton, so the result reads as an orange cat or dog rather than Agumon.
- Every new skin today means hand-writing procedural drawing code in `gen-sprites.mjs`. That does not scale to art-accurate characters.
- The reference art in `docs/reference/agumon/` (`image.png` is a 3x3 expression grid; `agumon.png` is a canonical 3/4-view pixel Agumon) is not used anywhere.

## 2. Goals

1. Replace Agumon's art with AI-generated pixel art that reads as Agumon, using the references as style guides.
2. Add four **Expressions** for skins that provide them:

   | Expression | Reference cell (`image.png`) | Triggered by |
   |---|---|---|
   | `happy` | happy with red sparkle | agent status `done` (during the Happy Hop) |
   | `laugh` | laughing squint, claw raised | petting (`isPetting`) |
   | `pepper` | Pepper Breath, big red mouth | overheat, where it replaces `overheat.png` for this skin |
   | `confused` | Koromon "?" pose, redrawn as Agumon | agent status `thinking` |

3. Add one generic compose script, so that a new AI-art skin is **one art folder plus one registry entry** and needs no drawing code.

## 3. Non-Goals

- Crying and dash/tumble states (deferred).
- An agent `error` status. `AgentStatus` is `'idle' | 'thinking' | 'done'`; `confused` maps to `thinking` only.
- Changes to frenchie or tetsu art. `gen-sprites.mjs` keeps producing frenchie and steam.
- Changing frame counts, canvas size (64x64), or renderer timing.

## 4. Answer: which tool makes a new skin?

| Skin kind | Tooling |
|---|---|
| Procedural (geometric, palette-driven) | `scripts/gen-sprites.mjs` (`npm run sprites`) |
| Art-accurate / licensed-look characters | `spritecook-generate-sprites` skill → art source folder → `scripts/compose-skin.mjs <skin>` (`npm run compose -- <skin>`) |

- `spritecook-animate-assets` is **not** used. The renderer's motion (breathing, blinks, typing bob, hop) is procedural over static frames, and AI animation would fight the fixed anchors.
- `spritecook-generate-tilesets` is irrelevant; there are no tiles.

## 5. Domain Terms (add to `CONTEXT.md`)

- **Art Source**: `assets/art-src/<skin>/`. Hand-curated 64x64 RGBA PNGs plus `skin.json`. It is the input to compose, is committed, and is never read at runtime.
- **Expression Sheet**: an optional per-skin strip (`happy.png`, `laugh.png`, `confused.png`) that overrides the base pose while a state is active. Skins without one fall back to existing behavior.
- **Compose**: a deterministic transform from Art Source to Sprite Sheets. Same input, same bytes.

## 6. Art Generation (manual step)

**Route B (used for agumon): an external pose sheet.**

- Render a 4x4 pose sheet in any image model, such as Gemini. It needs a flat green background and dark grid lines, and its cells go in `import-art.mjs` NAMES order. Example: `docs/reference/agumon/gen/sheet.jpeg`.
- Then run:
  - `sips -s format png sheet.jpeg --out "$TMPDIR/sheet.png"`
  - `node scripts/import-art.mjs "$TMPDIR/sheet.png" <skin>`
- The import detects the grid and the art-pixel pitch, keys out the green, and quantizes away the JPEG noise. It writes binary-alpha 64x64 frames at the largest integer scale that fits, with the feet on `GROUND_Y`.
- Touch up by hand afterwards. For agumon, the baked Zzz was removed from sleep frames because the renderer draws its own.

**Route A: SpriteCook (spends credits).**

1. Upload `docs/reference/agumon/agumon.png` and `image.png` with `create_asset_upload` → PUT → `finalize_asset_upload`, then record the asset IDs.
2. Generate the **base** with `generate_game_art`:
   - Settings: `pixel:true`, `width:64`, `height:64`, `bg_mode:'transparent'`, `style_asset_ids:[agumon.png id]`, `variations:4`, `smart_crop:false`.
   - Prompt: "Agumon, small orange dinosaur, front-facing 3/4, standing idle, green eyes, eyes open, mouth closed, full body centered, feet on bottom line".
3. Pick the best variation. Then generate each frame below with `edit_asset_id` = the chosen base, so identity and alignment stay consistent:
   - `eyes-closed`: blink.
   - `typing`: 3 poses, paws forward/left/right.
   - `sleep-curl`: 2 poses, curled/lying.
   - `happy`, `laugh`, `pepper`, `confused`: 2 frames each, with a subtle second pose for a flicker loop.
4. If SpriteCook output drifts off-model, use PixelLab `edit_image` (a batched multi-frame edit keeps consistency) as the fallback.
5. Save the chosen PNGs into the Art Source as-is. Manual touch-up with the `pixelart_workbench` repair is allowed.

Before step 2, check the budget with `get_credit_balance` and report the estimate to the user. The expected total is about 20 generations (4 base variations plus about 16 edits).

## 7. Art Source Layout

```
assets/art-src/agumon/
  skin.json
  base.png            # eyes open, mouth closed; idle bank "open"
  eyes-closed.png     # idle bank "blinked"; the half-open bank is derived
  typing-0..2.png
  sleep-0..1.png      # final curled loop; the transition is derived
  happy-0..1.png
  laugh-0..1.png
  pepper-0..1.png
  confused-0..1.png
```

`skin.json`:

```json
{
  "eyes": [[29, 17]],
  "groundY": 60,
  "halfOpenLids": [[27, 15, 30, 16]],
  "expressions": ["happy", "laugh", "confused"],
  "overheatFrom": "pepper"
}
```

- `eyes`: pupil anchors, copied to `EYE_ANCHORS_PER_SKIN`. `verify-art` asserts they match.
- `groundY`: every input's lowest opaque row must equal this value, so feet line up.
- `halfOpenLids`: rects filled with the lid color (sampled from the pixel above each rect) to make the half-open bank from `base.png`.
- `overheatFrom`: which expression stands in for `overheat.png`.

## 8. `scripts/compose-skin.mjs <skin>` (stdlib only)

**Inputs:** the Art Source above. **Outputs:** `assets/sprites/<skin>/`.

| Output | Frames | Derivation |
|---|---|---|
| `idle.png` | 12 | banks [open, blinked, half-open] × `BREATH_DY [0,-1,-2,-1]` vertical shift |
| `typing.png` | 3 | `typing-0..2`, shifted by `TYPING_POSE_DY` (-1) |
| `overheat.png` | 3 | `pepper-0, pepper-1, pepper-0` |
| `sleep-transition.png` | 4 | base → eyes-closed → sleep-0 shifted +2 → sleep-0 |
| `sleep.png` | 2 | `sleep-0..1` |
| `pupils.png` | 1 | not written by compose (it warns if missing). Agumon's is a hand-made 2x2 black pupil at (32,32), matching the art's own pupil |
| `happy.png` / `laugh.png` / `confused.png` | 2 each | as-is |

- Frame counts and dy constants are imported from the renderer sources where they are plain constants; otherwise they are duplicated with a `ponytail:` comment pointing at the source file.
- Validation happens before writing. On failure the script exits non-zero and names the file:
  - every input is 64x64 RGBA;
  - lowest opaque row equals `groundY`;
  - there are no semi-transparent pixels (alpha ∈ {0, 255});
  - every `eyes` anchor lies on an opaque pixel of `base.png`.
- Refactor: move the duplicated inline `decodePng` from `build-frenchie-revamp.mjs` and `verify-art.mjs` into `scripts/png.mjs`, next to `encodePng`. All three scripts import it.
- `package.json`: add `"compose": "node scripts/compose-skin.mjs"`.
- The pure frame math (breath shift, bank assembly) runs its own `assert`-based self-check when invoked with `--self-test`.

## 9. Renderer Wiring

`src/renderer/renderer.ts`:

- `SheetSet` gains `expressions: Partial<Record<'happy'|'laugh'|'confused', HTMLImageElement>>`. Only agumon imports expression URLs; the other skins get `{}`.
- Pose selection order (highest priority first). A branch applies only if the sheet exists:
  1. sleep / sleep-transition (unchanged)
  2. overheat → `overheat` sheet (for agumon this is already Pepper Breath, because compose writes it; no code change needed)
  3. petting → `laugh`
  4. agent `done` → `happy` (hop dy still applied)
  5. agent `thinking` → `confused` (the thought bubble is still drawn)
  6. typing / idle (unchanged)
- Expression frames loop 2 frames at 400ms.
- The pupil layer is skipped while any expression sheet is drawn, because expressions own their eyes. This is the same rule as overheat and petting today.

`src/renderer/eyes.ts`: set `EYE_ANCHORS_PER_SKIN.agumon` to `skin.json.eyes`.

The pose-selection function is extracted as a pure function so it can be unit-tested (see §11).

## 10. `scripts/verify-art.mjs`

- For each skin that has `assets/art-src/<skin>/skin.json`:
  - assert the expression sheets exist at 128x64;
  - assert `eyes` equals `EYE_ANCHORS_PER_SKIN[skin]` (parsed from `eyes.ts` with a regex, consistent with the script's existing approach);
  - assert every sheet's content is ground-aligned to `groundY`.
- The existing checks are unchanged.

## 11. Docs

- `CONTEXT.md`: add the §5 terms. Under Architecture Decisions, replace "SpriteCook for art generation — cleaned up manually" with "AI art → Art Source → compose; procedural skins stay in gen-sprites".
- `docs/adr/0001-ai-art-source-plus-compose.md`:
  - Context: the procedural skeleton cannot produce character-accurate skins.
  - Decision: AI-generated Art Source plus a deterministic compose.
  - Rejected alternatives:
    - per-skin procedural rigs, because of code cost per skin;
    - AI animation, because it breaks anchors and timing;
    - hand-drawing, because of time.
  - Consequences: art is committed and reproducible without credits; regenerating means new AI calls.
- `docs/skins.md` (short): the new-skin workflow from §4 and §6–§8 as numbered steps.

## 12. Acceptance Criteria

1. `npm run compose -- agumon` produces all 9 sheets with the documented dimensions and is byte-identical across two runs.
2. Visually, Agumon reads as Agumon (a dinosaur snout, claws, green eyes), and the pupils sit inside the eyes in idle, typing and thinking.
3. Petting shows laugh; agent done shows happy with the hop; thinking shows confused with the bubble; overheat shows Pepper Breath with steam.
4. Frenchie and tetsu render identically to before. `npm run sprites` output is unchanged (git diff is clean on their sheets).
5. `npm test`, `npm run typecheck`, `node scripts/verify-art.mjs` and `node scripts/compose-skin.mjs --self-test` all pass.
6. A new unit test covers pose-selection priority, including the fallback when a skin has no expression sheet.

## 13. Tickets (vertical slices, after approval)

1. **png.mjs decode extraction.** Pure refactor; verify-art and the revamp script still pass.
2. **Art Source for Agumon.** Upload refs, generate, curate, write `skin.json`. This ticket spends credits and gets a user checkpoint on the chosen base.
3. **compose-skin.mjs** plus the npm script and self-test; generate the agumon sheets.
4. **Renderer expressions.** SheetSet, pure pose selector plus its test, the eye anchors.
5. **verify-art checks** plus docs (CONTEXT.md, the ADR, skins.md).

## 14. Risks

- AI frames drift in proportions between poses. Mitigations: `edit_asset_id` from one base, the `groundY` check, and the PixelLab batched-edit fallback.
- The 64x64 canvas is small for the Pepper Breath flame. The flame may be cropped at the canvas edge, which is acceptable.
- Digimon is third-party IP. This is fine for personal use; flag it before any public distribution of the DMG.
