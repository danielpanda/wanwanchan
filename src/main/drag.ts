// Clamp math for the custom pointer drag (ADR 0002). Pure and electron-free so
// the two-display case stays unit-testable under node --test.

export interface DragPoint {
  x: number
  y: number
}

export interface DragRect {
  x: number
  y: number
  width: number
  height: number
}

/** The scaled 64×64 draw box, offset inside the larger (padded) window. */
export interface SpriteBox {
  offsetX: number
  offsetY: number
  size: number
}

/** Sprite box offset inside a window of the given size and layout. */
export function spriteBox(
  windowWidth: number,
  windowHeight: number,
  drawSize: number,
  headroom: number,
): SpriteBox {
  return {
    offsetX: Math.round((windowWidth - drawSize) / 2),
    offsetY: headroom,
    size: drawSize,
  }
}

/**
 * Window top-left that keeps the grab point pinned under the cursor while the
 * sprite box stays inside `workArea`. `grab` is window-local, so the window
 * hangs from the point the user pressed. The box — not the window's transparent
 * padding — is what is clamped, then the window offset is re-derived from it.
 */
export function clampDrag(
  cursor: DragPoint,
  grab: DragPoint,
  box: SpriteBox,
  workArea: DragRect,
): DragPoint {
  const minX = workArea.x
  const minY = workArea.y
  const maxX = workArea.x + workArea.width - box.size
  const maxY = workArea.y + workArea.height - box.size

  const spriteX = cursor.x - grab.x + box.offsetX
  const spriteY = cursor.y - grab.y + box.offsetY

  return {
    x: Math.max(minX, Math.min(maxX, spriteX)) - box.offsetX,
    y: Math.max(minY, Math.min(maxY, spriteY)) - box.offsetY,
  }
}
