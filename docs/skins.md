# Adding a skin

Sheets live in `assets/sprites/<skin>/`: 64x64 frames in horizontal strips. The frame counts are enforced by `scripts/verify-art.mjs`.

## Procedural skin

1. Add the drawing code to `scripts/gen-sprites.mjs`, then run `npm run sprites`.

## Art skin (character-accurate)

1. **Generate the art.**
   - Route B (free): render a 4x4 pose sheet in any image model, e.g. Gemini. Use a flat green background and dark grid lines. Put the cells in the `NAMES` order from `scripts/import-art.mjs` (`docs/reference/agumon/gen/sheet.jpeg` is an example; reference art is kept locally, not committed — see `.gitignore`).
   - Route A: SpriteCook `generate_game_art` with a style reference. Edit each pose from one base so identity stays consistent (spends credits; see spec §6).
2. **Import the art.** For route B: `sips -s format png sheet.jpeg --out "$TMPDIR/sheet.png"`, then `node scripts/import-art.mjs "$TMPDIR/sheet.png" <skin>`. This writes the frames to `assets/art-src/<skin>/`.
3. **Touch up by hand.** For example, remove baked-in effects the renderer already draws, such as Zzz.
4. **Write `assets/art-src/<skin>/skin.json`.** It needs `eyes`, `groundY`, `halfOpenLids`, `expressions` and `overheatFrom` (see the spec §7).
5. **Hand-make `assets/sprites/<skin>/pupils.png`.**
6. **Compose.** Run `npm run compose -- <skin>`. It validates the inputs, then writes idle, typing, overheat, sleep and the expression sheets.
7. **Wire the renderer.**
   - Add the sheet imports in `src/renderer/renderer.ts`, including expression URLs.
   - Copy `skin.json` `eyes` into `EYE_ANCHORS_PER_SKIN` in `src/renderer/eyes.ts` on one line.
8. **Verify.** Run `node scripts/verify-art.mjs && npm test && npm run typecheck`.

## Evolution sheet (Agumon)

The Agumon skin carries one extra strip: `assets/sprites/agumon/evolution.png`, a
9-frame 256x256 horizontal strip (Agumon idle → digitize → WarGreymon silhouette →
idle/roar/claw/fireball → throw). It plays as a near-fullscreen cutscene when the
stretch reminder fires.

To rebuild it: `sips -s format png evolving.jpeg --out "$TMPDIR/evolving.png"`,
then `node scripts/slice-evolution.mjs "$TMPDIR/evolving.png"`. The source is a
2048x2048 scene grid, so cells are cut on a uniform 3x3 split and kept opaque —
the renderer draws the strip over a dark backdrop. `node scripts/slice-evolution.mjs --self-test` checks the grid/downscale.
