# WanWan-chan — Domain Context

## Domain Language

| Term | Definition |
|---|---|
| **WanWan-chan** | The product: a desktop companion app featuring an animated Black French Bulldog |
| **KPS** | Keystrokes per second — rolling 1-second window count of global keydown events |
| **Overheat** | Visual state triggered at ≥5 KPS: tongue out, steam particles, rapid paw drumming |
| **Ghost Mode** | Click-through mode where the window passes all mouse events to apps beneath |
| **Mochi Drag** | Press inside the sprite box and move more than 4px to lift the pet; it hangs from the grab point (custom pointer drag, ADR 0002). A procedural spring stretches it (up to 1.3×, volume-preserving), leans it (~20°) and wobbles it on every skin. Agumon also swaps to drawn **Drag Frames**. On release it lands in place: fall → squash → dizzy → idle. Disabled in Ghost Mode and during the Evolution Animation |
| **Drag Frames** | Agumon's `drag.png`: an 8-frame 512×64 strip sliced from `docs/reference/agumon/gen/dragging.jpeg` (lift, dangle, swing-left, flail, swing-right, fall, squash, dizzy) |
| **State Snapshot** | The 60Hz IPC payload from main→renderer: `{ kps, cursorX, cursorY }` |
| **Pupil Layer** | Separate tiny sprite composited over the face, offset by cursor angle |
| **Sprite Sheet** | Horizontal strip of animation frames for one state, one PNG per state |
| **Skin** | Selectable character (frenchie, agumon): one sprite-sheet set per skin under `assets/sprites/<skin>/`, sharing anchors and frame counts so swapping is a renderer lookup |
| **Art Source** | `assets/art-src/<skin>/`: hand-curated 64x64 RGBA PNGs + `skin.json`. Input to Compose; committed, never read at runtime |
| **Expression Sheet** | Optional per-skin 2-frame strip (`happy`, `laugh`, `confused`) that overrides the base pose while its state is active; skins without one fall back |
| **Evolution Sheet** | Agumon-only 9-frame 256x256 strip (`assets/sprites/agumon/evolution.png`) played left→right, top→bottom as a near-fullscreen cutscene on the stretch reminder |
| **Evolution Animation** | The Agumon → WarGreymon digivolution cutscene (idle → digitize → silhouette → reveal → roar/claw/fireball → throw), driven by the pure `evolution.ts` state machine; gated to the `agumon` skin |
| **Compose** | Deterministic transform Art Source → Sprite Sheets (`npm run compose -- <skin>`): same input, same bytes |

## Architecture Decisions

- **macOS-first** — Windows support deferred
- **Sprite sheets over procedural drawing** — art is pre-rendered frames, not Canvas paths
- **AI art → Art Source → compose; procedural skins stay in gen-sprites** — see `docs/adr/0001-ai-art-source-plus-compose.md`, `docs/skins.md`
- **electron-vite scaffold** — handles main/preload/renderer bundling
- **electron-store for all persistence** — single JSON file in app data dir
- **Throttled IPC at 60Hz** — main process aggregates raw input into state snapshots
- **Angle-based eye tracking** — atan2 from window center to global cursor, mapped to ±3px pupil offset
- **`floating` window level** — above normal windows, below system alerts
- **No packaging for MVP** — dev mode only, electron-builder added later
