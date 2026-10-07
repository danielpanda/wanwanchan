# WanWan-chan — Implementation Specification

**Date**: 2026-09-21
**Status**: Approved (Grilling Complete)
**Source**: Grilling session against `docs/superpowers/specs/2026-09-21-wanwanchan-black-french-bulldog-design.md`

---

## 1. Scope

### 1.1 MVP (v1)
- Transparent, frameless, always-on-top Electron window (280×260)
- Animated Black French Bulldog with pixel art sprite sheets (64×64 base, 3× upscale)
- States: **IDLE**, **TYPING**, **OVERHEAT**, **SLEEP**
- Global input hooking: keystrokes (paw animation), cursor position (eye tracking)
- Ghost mode (click-through) with `Cmd+Shift+D` toggle (configurable)
- System tray menu (5 items)
- macOS only
- 100% offline, no network

### 1.2 Deferred to v2
- Petting interaction (hearts, happy face)
- Mochi drag physics (squash & stretch)
- Pomodoro timer
- Scroll animation (tennis ball / paper spool)
- Ergonomic reminders (stretch/water breaks)
- Pinned note speech bubble
- Audio / sound effects
- Windows support
- Distributable packaging (.dmg)

---

## 2. Technology Stack

| Layer | Choice |
|---|---|
| Framework | Electron (v32+) |
| Runtime | Node.js (v24+) |
| Scaffold | `electron-vite` |
| Language | TypeScript (strict) |
| Renderer | HTML5 Canvas 2D |
| Input Hook | `uiohook-napi` |
| Persistence | `electron-store` |
| Build (dev) | Vite (via electron-vite) |
| Build (dist) | Deferred — `electron-builder` later |

---

## 3. Project Structure

```
wanwanchan/
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── assets/
│   ├── sprites/
│   │   ├── idle.png          # 6 frames: 4 breathing + 2 blink
│   │   ├── typing.png        # 3 frames: neutral, left-down, right-down
│   │   ├── overheat.png      # 3 frames: same poses, tongue-out face
│   │   ├── sleep-transition.png  # 3-4 frames: eyes droop → curl
│   │   ├── sleep.png         # 2 frames: sleeping loop
│   │   ├── pupils.png        # Pupil sprite (2-3px dot + catchlight)
│   │   └── steam.png         # Steam particle sprite(s)
│   ├── tray/
│   │   ├── iconTemplate.png      # macOS menu bar (monochrome)
│   │   └── iconTemplate@2x.png   # Retina
│   └── icon.png              # App icon (for setup window)
├── src/
│   ├── main/
│   │   ├── index.ts          # App lifecycle, dock hide, tray, window create
│   │   ├── input-hook.ts     # uiohook-napi setup, KPS calculation, state aggregation
│   │   ├── tray.ts           # System tray menu construction
│   │   └── store.ts          # electron-store schema & defaults
│   ├── preload/
│   │   └── index.ts          # contextBridge: wanwan API
│   └── renderer/
│       ├── index.html        # Canvas host
│       ├── index.ts          # Entry: setup canvas, start render loop
│       ├── renderer.ts       # Core render loop (rAF), state machine (switch/case)
│       ├── sprites.ts        # Sprite sheet loader, frame extraction
│       └── eyes.ts           # Pupil offset calculation (angle-based)
└── docs/
    ├── specs/
    │   └── IMPL-SPEC.md      # This file
    └── superpowers/
        └── specs/
            └── 2026-09-21-wanwanchan-black-french-bulldog-design.md
```

---

## 4. Window Configuration

```typescript
const win = new BrowserWindow({
  width: 280,
  height: 260,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  hasShadow: false,
  resizable: false,
  skipTaskbar: true,  // Windows (future)
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
})

// macOS: floating level (above normal, below alerts)
win.setAlwaysOnTop(true, 'floating')

// macOS: hide from Dock and Cmd+Tab
app.dock.hide()
```

**LSUIElement**: Set `LSUIElement: true` in electron-builder config (when added).

---

## 5. State Machine

### 5.1 States

```
IDLE ──(keydown, kps < 5)──→ TYPING
IDLE ──(keydown, kps ≥ 5)──→ OVERHEAT
IDLE ──(3 min inactivity)──→ SLEEP (via transition)

TYPING ──(kps ≥ 5)──→ OVERHEAT
TYPING ──(1s no keys)──→ IDLE

OVERHEAT ──(kps < 5)──→ TYPING  (instant)
OVERHEAT ──(1s no keys)──→ IDLE

SLEEP ──(any keydown)──→ IDLE (via 2-frame wake)
```

### 5.2 Implementation

```typescript
type WanWanState = 'IDLE' | 'TYPING' | 'OVERHEAT' | 'SLEEP' | 'SLEEP_TRANSITION' | 'WAKE'

// In render loop:
switch (state) {
  case 'IDLE': /* breathing cycle, blink timer, check kps/inactivity */ break
  case 'TYPING': /* paw frames driven by keydown alternation */ break
  case 'OVERHEAT': /* same paw logic + overheat face + steam particles */ break
  case 'SLEEP_TRANSITION': /* play transition frames, then → SLEEP */ break
  case 'SLEEP': /* sleep loop + procedural Zzz */ break
  case 'WAKE': /* 2 reverse frames, then → IDLE or TYPING */ break
}
```

---

## 6. Sprite System

### 6.1 Sheet Format
- Each sheet is a horizontal strip: frames are `frameWidth × frameHeight` tiles left-to-right.
- Base character size: **64×64 pixels** per frame.
- Rendered at **3× upscale** (192×192) with `imageSmoothingEnabled = false`.

### 6.2 Frame Counts

| Sheet | Frames | FPS | Notes |
|---|---|---|---|
| `idle.png` | 6 | ~2 | 4 breathing + 2 blink (blink triggered randomly every 3-6s) |
| `typing.png` | 3 | event-driven | neutral=0, left-down=1, right-down=2 |
| `overheat.png` | 3 | event-driven | Same poses, different face (tongue out) |
| `sleep-transition.png` | 4 | ~2.5 | Played once: eyes droop → head nod → curl up |
| `sleep.png` | 2 | ~1 | Loop while sleeping |
| `pupils.png` | 1 | — | Static sprite, positioned by angle math |
| `steam.png` | 2-3 | ~4 | Particle frames for overheat ear steam |

### 6.3 Compositing Order (bottom to top)
1. Character body sprite (current state frame)
2. Pupil sprites (×2, one per eye, offset by cursor angle)
3. Steam particles (overheat only)
4. Procedural Zzz text (sleep only)

### 6.4 Desk
Baked into the bottom of every character sprite frame. Not a separate layer.

---

## 7. Eye Tracking

### 7.1 Input
Global cursor coordinates from `uiohook-napi` `mousemove` events, throttled to 60Hz in main process.

### 7.2 Calculation
```typescript
const MAX_OFFSET = 3 // source pixels

function getPupilOffset(cursorX: number, cursorY: number, windowX: number, windowY: number) {
  const centerX = windowX + 140  // half of 280
  const centerY = windowY + 130  // half of 260
  const angle = Math.atan2(cursorY - centerY, cursorX - centerX)
  return {
    x: Math.cos(angle) * MAX_OFFSET,
    y: Math.sin(angle) * MAX_OFFSET,
  }
}
```

Offset is applied at source resolution, then upscaled with the character.

---

## 8. KPS (Keystrokes Per Second)

### 8.1 Rolling Window
```typescript
const keyTimestamps: number[] = []

function onKeydown() {
  const now = Date.now()
  keyTimestamps.push(now)
  // Prune entries older than 1 second
  while (keyTimestamps.length > 0 && keyTimestamps[0] < now - 1000) {
    keyTimestamps.shift()
  }
}

function getKPS(): number {
  const now = Date.now()
  while (keyTimestamps.length > 0 && keyTimestamps[0] < now - 1000) {
    keyTimestamps.shift()
  }
  return keyTimestamps.length
}
```

### 8.2 Thresholds
- `kps >= 1` → TYPING
- `kps >= 5` → OVERHEAT
- `kps === 0` for 1 second → IDLE
- `kps === 0` for 3 minutes → SLEEP

---

## 9. IPC Contract

### 9.1 Main → Renderer (60Hz throttle)

```typescript
// Channel: 'wanwan:state-update'
interface InputState {
  kps: number
  cursorX: number
  cursorY: number
  lastKeyside: 'left' | 'right'  // alternating paw
}
```

### 9.2 Main → Renderer (event-driven)

```typescript
// Channel: 'wanwan:ghost-mode-changed'
// Payload: boolean
```

### 9.3 Preload API

```typescript
interface WanWanAPI {
  onStateUpdate(callback: (state: InputState) => void): void
  onGhostModeChanged(callback: (enabled: boolean) => void): void
}

// Exposed as window.wanwan
```

---

## 10. Ghost Mode

- Toggle: Global shortcut (default `CmdOrCtrl+Shift+D`, configurable via `electron-store`)
- Window: `win.setIgnoreMouseEvents(true, { forward: true })`
- Visual: `win.setOpacity(0.7)` when enabled, `1.0` when disabled
- Persistence: `ghostModeEnabled` saved in store, restored on launch

---

## 11. System Tray

### 11.1 Icon
- `iconTemplate.png` / `iconTemplate@2x.png` — monochrome WanWan-chan face for macOS menu bar template rendering.

### 11.2 Menu Items

| Label | Type | Action |
|---|---|---|
| 🐶 WanWan-chan | label (disabled) | Status display |
| 👻 Click-Through Mode | checkbox | Toggle ghost mode |
| 📏 Size | submenu | Small (75%) / Normal (100%) / Large (130%) |
| 📍 Reset Position | click | Move window to default bottom-right position |
| 🚪 Quit WanWan-chan | click | `app.quit()` |

---

## 12. Persistence (electron-store)

### 12.1 Schema

```typescript
interface WanWanStore {
  windowPosition: { x: number; y: number }
  ghostModeShortcut: string       // default: 'CmdOrCtrl+Shift+D'
  ghostModeEnabled: boolean       // default: false
  accessibilityGranted: boolean   // default: false
  size: 'small' | 'normal' | 'large'  // default: 'normal'
}
```

### 12.2 Position Save
Debounced 500ms after last window move event.

---

## 13. macOS Accessibility

### 13.1 Detection
```typescript
const { systemPreferences } = require('electron')
const trusted = systemPreferences.isTrustedAccessibilityClient(false)
```

### 13.2 Flow
1. On launch, check `accessibilityGranted` in store.
2. If `false`, call `isTrustedAccessibilityClient(false)`.
3. If not trusted, show a **separate small BrowserWindow** with:
   - Step-by-step instructions
   - "Open System Preferences" button (`shell.openExternal('x-apple.systempreferences:...')`)
   - "I've Granted Access" button → re-check, if trusted: set `accessibilityGranted: true`, close window, start input hooks.
4. If denied: close setup window, run in IDLE-only mode (no typing/scroll reactions).
5. Tray menu includes "Grant Accessibility" if not yet granted.

---

## 14. Render Loop

```typescript
let lastTime = 0
let frameAccumulator = 0

function render(timestamp: number) {
  const dt = timestamp - lastTime
  lastTime = timestamp
  frameAccumulator += dt

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Advance sprite frame based on accumulator and current state's FPS
  const frameDuration = getFrameDuration(currentState) // e.g., 500ms for 2 FPS
  if (frameAccumulator >= frameDuration) {
    currentFrame = advanceFrame(currentState, currentFrame)
    frameAccumulator -= frameDuration
  }

  // Draw layers
  ctx.imageSmoothingEnabled = false
  drawCharacter(ctx, currentState, currentFrame)  // body + desk
  drawPupils(ctx, pupilOffset)                      // eyes
  if (currentState === 'OVERHEAT') drawSteam(ctx)   // particles
  if (currentState === 'SLEEP') drawZzz(ctx)         // procedural text

  requestAnimationFrame(render)
}

requestAnimationFrame(render)
```

---

## 15. Animation Details

### 15.1 Idle Breathing
- 4 frames: chest slightly rises/falls
- ~2 FPS (500ms per frame)
- Loop: 0→1→2→3→0...

### 15.2 Idle Blink
- Random interval: 3-6 seconds
- Swap to blink frame (index 4) for 1 frame, then frame 5 (eyes reopening), then resume breathing

### 15.3 Typing Paw Strikes
- Event-driven, not time-based
- On keydown: show left-down (frame 1) or right-down (frame 2), alternating
- On 1s of no keydown: return to neutral (frame 0)
- `lastKeyside` in InputState drives alternation

### 15.4 Overheat
- Same paw logic as TYPING but uses `overheat.png` (tongue-out face)
- Steam particles: 2-3 frame sprites, float upward from ear positions, fade out
- New steam particle emitted every ~300ms while in OVERHEAT

### 15.5 Sleep Transition
- Play `sleep-transition.png` frames sequentially at ~2.5 FPS
- After last frame, switch to SLEEP state

### 15.6 Sleep Loop
- 2 frames at ~1 FPS
- Procedural Zzz: draw "Z" characters using Canvas `fillText`
- 3 Z's at staggered positions, floating upward with sine-wave horizontal wobble
- Each Z fades from full opacity to 0 as it rises, then resets

### 15.7 Wake
- Play last 2 frames of `sleep-transition.png` in reverse
- After both frames shown, transition to IDLE (or TYPING if kps > 0)

---

## 16. Verification Plan

| # | Test | Pass Criteria |
|---|---|---|
| 1 | App launches, no Dock icon | `app.dock.hide()` works, no Cmd+Tab entry |
| 2 | Window is transparent | No black/white borders, desktop visible through non-character areas |
| 3 | Idle breathing animates | Character visibly breathes when no input |
| 4 | Blink fires | Random blink occurs within 3-6 seconds of idle |
| 5 | Typing in external app triggers paws | Open terminal, type → paws alternate |
| 6 | KPS ≥ 5 triggers overheat | Fast typing → tongue out, steam particles appear |
| 7 | KPS drop exits overheat | Stop fast typing → returns to normal typing face |
| 8 | 1s no typing → idle | Stop typing → returns to idle within ~1s |
| 9 | 3 min inactivity → sleep | Wait 3 min → sleep transition plays, Zzz appears |
| 10 | Keystroke during sleep → wake | Type while sleeping → wake animation, then typing state |
| 11 | Eyes track cursor | Move mouse around screen → pupils follow direction |
| 12 | Ghost mode toggle | Press Cmd+Shift+D → clicks pass through, opacity drops to 70% |
| 13 | Drag window | Click and drag → window moves, position persists after restart |
| 14 | Tray menu works | Click tray icon → menu appears with all 5 items functional |
| 15 | Accessibility denied | Deny accessibility → app runs in idle-only mode, no crash |
