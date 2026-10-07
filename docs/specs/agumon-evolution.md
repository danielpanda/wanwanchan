# Spec: Agumon Evolution Animation (Stretch Reminder Cutscene)

Status: **ready-for-agent**
Date: 2026-09-29
Source: Grilling session against `docs/reference/agumon/gen/evolving.jpeg` + `docs/specs/agumon-enhancement.md`

## 1. Problem Statement

The stretch reminder today is a small in-place elastic "grow" of whatever skin is
active (`grow-anim.ts`, `renderer.ts:428`). When the user has the Agumon skin,
the reminder should instead play a large, near-fullscreen cutscene: Agumon
digitizes and evolves into WarGreymon, which then cycles through its idle and
attack poses. The user has a 3×3 reference sheet (`evolving.jpeg`) that lays out
exactly the nine keyframes, and wants them all played, at a size that almost
covers the screen.

## 2. Solution

A new **Evolution Animation** cutscene, triggered by the stretch reminder when the
active skin is Agumon. The pet window transiently resizes to a near-fullscreen
integer-scaled area, plays a 9-frame evolution strip from left-to-right,
top-to-bottom, with per-frame hold times and procedural glitch/shake accents,
then shrinks back and resumes the idle loop. Non-Agumon skins keep the current
grow behavior.

## 3. User Stories

1. As a user with the Agumon skin, I want the stretch reminder to play a large evolution cutscene, so that the reminder is a memorable, high-impact event.
2. As a user, I want the animation to begin with Agumon idling, so that the cutscene starts from a recognizable resting pose.
3. As a user, I want Agumon to rotate and digitize into pixels, so that the transition reads as a digivolution, not a jump cut.
4. As a user, I want a WarGreymon silhouette to appear after the digitize, so that the reveal is staged dramatically.
5. As a user, I want WarGreymon to then play its idle pose, so that the reveal lands on a stable, readable character.
6. As a user, I want WarGreymon to raise one hand, so that the idle pose has motion before the action poses.
7. As a user, I want WarGreymon to roar, so that the cutscene has an emotional peak.
8. As a user, I want WarGreymon to perform a claw attack, so that the action sequence starts.
9. As a user, I want WarGreymon to raise two hands holding a small fireball, so that the fireball builds up in stages.
10. As a user, I want WarGreymon to shrink into the distance and throw a large two-handed fireball, so that the cutscene ends on its biggest attack.
11. As a user, I want the animation to be big — almost covering the screen — so that the evolution feels momentous.
12. As a user, I want the animation to play all nine frames in order, so that none of the art I provided is skipped.
13. As a user with a non-Agumon skin, I want the stretch reminder to keep the existing grow, so that the new feature does not regress other characters.
14. As a user, I want to click to dismiss the cutscene early, so that I am not locked out of my desktop during the ~6 seconds it runs.
15. As a user, I want the window restored to its original size and position after the cutscene, so that the pet returns to normal.
16. As a user, I want the cutscene to end cleanly with a fade-out, so that it does not jarringly snap back.
17. As a user, I want the evolution to have a distinct sound, so that the audio reinforces the visual event.
18. As a user, I want the sound to respect the existing sound on/off and volume settings, so that the cutscene obeys my audio preferences.
19. As a user, I want the cutscene to trigger from the stretch test action in the Companion Hub, so that I can preview it on demand.
20. As a user, I want the cutscene gated to the Agumon skin, so that switching skins switches the reminder behavior correctly.

## 4. Implementation Decisions

- **Cutscene module.** Add one pure, DOM-free **Evolution Anim** state machine
  (`createEvolutionAnim`, `triggerEvolution`, `tickEvolution`, `dismissEvolution`,
  `evolutionFrame`) in the same shape as `agent-anim.ts` / `grow-anim.ts` /
  `timer-badge.ts`. It owns: phase, frame index, per-frame hold, elapsed time,
  glitch offset, and screen-shake amplitude. It is the single new seam.

- **Frame timeline.** Nine frames in row-major order (left→right, top→bottom),
  one strip `evolution.png`. Per-frame hold durations:
  idle-Agumon 600ms → rotate/digitize 900ms → WGM-silhouette 700ms → WGM-idle
  600ms → raise-one-hand 600ms → roar 800ms → claw 600ms → two-hand-small-
  fireball 700ms → far/small + throw-big-fireball 900ms → fade-out.

- **Frame resolution.** 256×256 native evolution frames, downscaled from the
  ~682px source cells. Integer-scaled at draw time. (64px would mosaic at 20×+;
  512px bloats the strip with no visible gain.)

- **Backdrop.** The evolution draws on a dark backdrop filling the window; the
  source cells are cut to transparency and the strip is drawn over the dark fill.
  The digitize and silhouette frames only read against a dark ground.

- **Procedural accents.** The digitize frame gets a horizontal glitch/scanline
  offset; the roar and throw frames get a small screen shake. These are computed
  in `tickEvolution`, not baked into the art, matching the "motion is procedural"
  ADR (0001).

- **Renderer integration.** The render loop gains one branch: when the evolution
  is active, it draws the dark backdrop + current evolution frame (full-window)
  instead of the normal pose composition. The normal `selectPose` path is
  untouched. `ctx.imageSmoothingEnabled = false` is preserved so integer scaling
  stays crisp.

- **Trigger gating.** The stretch reminder path (`test-stretch` action and the
  periodic stretch check) routes through one `triggerStretch()` helper: if
  `skin === 'agumon'` it starts the evolution cutscene (and requests the window
  resize); otherwise it keeps the existing grow. Frenchie/tetsu are unchanged.

- **Window resize (main process).** Main gains `enterEvolution` / `exitEvolution`:
  save the pet window's current bounds, resize to an integer-scaled rectangle at
  ~85% of the primary display's work area (centered), and restore on exit.
  Reuses the existing frameless/transparent/always-on-top window — no second
  window. The size change is orchestrated over a dedicated IPC channel, not the
  persisted `size` setting (the tier is not modified).

- **IPC contract.** New channels: main→renderer `wanwan:evolution:begin/end`
  (renderer tells main to resize, and main tells renderer when the resize is done
  and to restore). The preload exposes `beginEvolution()` / `endEvolution()`.

- **Sound.** New `playEvolution()` WebAudio chiptune (rising arpeggio + low roar
  tail) in `sound.ts`, obeying `configureSound` on/off and volume. It replaces
  `playStretchSlide()` during the cutscene.

- **Asset pipeline.** New `scripts/slice-evolution.mjs`: detect the 3×3 grid in
  `evolving.jpeg`, key out the flat background, cut nine cells, downscale to
  256×256 binary-alpha frames, and write `assets/sprites/agumon/evolution.png`
  as one horizontal strip. Source cells are committed under
  `assets/art-src/agumon/evolution/` for reproducibility, mirroring the Compose
  workflow. If the source background is not a clean flat key color, transparency
  is hand-cut and the decision noted in the script.

## 5. Testing Decisions

- **Good tests assert external behavior** (frame index, phase transitions, hold
  timing, gating), never canvas pixels or window bounds.
- **Modules under test:** the evolution state machine (frame timeline and
  phase/`dismiss` transitions) and the gating helper. `slice-evolution.mjs`
  gets a `--self-test` for its grid detection, mirroring `compose-skin.mjs` and
  `import-art.mjs`.
- **Prior art:** `agent-anim.test.ts`, `grow-anim.test.ts`, `timer-badge.test.ts`
  — pure `node --test` over the state machine, ticking by `dt` and asserting the
  resulting frame/phase.
- **Window resize** is verified manually in `npm run dev` (the existing pattern
  for `setSize`), not unit-tested — Electron bounds are outside the pure seam.

## 6. Out of Scope

- WarGreymon as a selectable idle skin (only the cutscene strip is added).
- Non-Agumon evolution sequences.
- Sound design beyond one evolution chime.
- Any change to the persisted `size` tier; the cutscene resize is transient.
- A "skip" button or pause — dismissal is click-to-fade only.
- Windows/Linux behavior (macOS-first, per the existing architecture).

## 7. Further Notes

- The cutscene reuses the pet window rather than spawning a fullscreen `BrowserWindow`,
  which keeps the compositor transparent and the drag/ghost-mode plumbing intact.
- The evolution strip is a one-off asset; it does not extend the per-skin
  `SheetSet` contract beyond a single optional `evolution` sheet for Agumon.
- `docs/skins.md` and `CONTEXT.md` gain the **Evolution Animation** and
  **Evolution Sheet** terms; `docs/adr/` is left unchanged (the Compose decision
  already covers deterministic art + procedural motion).
