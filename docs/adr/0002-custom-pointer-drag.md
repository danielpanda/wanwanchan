# ADR 0002: Custom pointer drag replaces native app-region drag

Status: Accepted (2026-10-05)

## Context

The pet window moves with `-webkit-app-region: drag`. macOS owns that drag entirely, so the renderer gets no pointer events, no velocity and no release signal. **Mochi Drag** needs all three: it stretches on lift, leans and wobbles with sideways speed, flails on shakes, and plays fall, squash and dizzy frames on release.

## Decision

The renderer owns the gesture and main owns the window:

- `#pet` drops `-webkit-app-region: drag`.
- A press inside the sprite's 64×64 draw box calls `setPointerCapture`. Presses on the window padding are ignored.
- After 4px of movement the renderer sends `beginDrag` over IPC, along with the grab offset.
- While dragging, main polls `screen.getCursorScreenPoint()` at 60Hz and calls `setPosition`. The pet hangs from the grab point.
- The position is clamped so the sprite box stays inside the `workArea` of the display under the cursor.
- `pointerup` or `lostpointercapture` sends `endDrag`. Main stops following and saves the position directly.
- Velocity comes from the existing 60Hz state snapshot (`cursorX/Y`), so `uiohook-napi` keeps listening to `mousemove` only.
- Drag is disabled during the evolution cutscene and in Ghost Mode (click-through).

## Rejected alternatives

- **Keep native drag and infer motion from `moved` events**: there is no release signal, the events are debounced and arrive late, and the system drag can't be clamped.
- **uiohook `mousedown`/`mouseup` for release**: these are global events that also fire outside the pet. Pointer capture already scopes the gesture to the pet.
- **Resizing the window while dragging so the stretch can grow**: the window flickers and the position math gets harder. Stretch is capped by the existing headroom and side padding instead.

## Consequences

- The gesture's state is all in the renderer and is testable in the pure `drag.ts`. Main only follows the cursor and clamps.
- The macOS-native drag feel (momentum, Mission Control drop) is lost. That is acceptable for a pet.
- Drag no longer works when the renderer is hung. The window cannot be moved until it recovers.
