// Size tiers (issue 07). Electron-free so main, preload and renderer share
// one source of truth, and the mapping stays unit-testable under node --test.
import type { MenuItemConstructorOptions } from 'electron'

export type SizeOption = 'small' | 'normal' | 'large'

/** Main→renderer push when the tray Size submenu picks a tier. */
export const SIZE_CHANNEL = 'wanwan:size'

/** Source frame size in the sprite sheets (spec §6.1). */
export const FRAME_SIZE = 64

/**
 * Integer pixel scales only: a non-integer factor would give art pixels of
 * uneven width even with smoothing off. The tray labels say 75/100/130%; the
 * crisp ladder is 2/3/4 (≈67/100/133%) — integer-only is what keeps every
 * tier pixel-perfect.
 */
export const SCALES: Record<SizeOption, number> = { small: 2, normal: 3, large: 4 }

export function isSizeOption(value: unknown): value is SizeOption {
  return value === 'small' || value === 'normal' || value === 'large'
}

export interface Layout {
  scale: number
  drawSize: number
  /** Clear space above the sprite for future overlays (steam, Zzz, badges). */
  headroom: number
}

/**
 * Normal (scale 3) reproduces the original renderer constants: 192px draw,
 * 68px headroom. Other tiers scale both proportionally so the overlay band
 * grows with the pet instead of clipping larger Zzz glyphs.
 */
export function layoutFor(size: SizeOption): Layout {
  const scale = SCALES[size]
  return { scale, drawSize: FRAME_SIZE * scale, headroom: Math.round((68 * scale) / 3) }
}

/** Window bounds for a tier. Normal is the original 280x260: 44px side pad. */
export function windowSizeFor(size: SizeOption): { width: number; height: number } {
  const { drawSize, headroom } = layoutFor(size)
  const side = Math.round((44 * SCALES[size]) / 3)
  return { width: drawSize + side * 2, height: drawSize + headroom }
}

/** Tray submenu entries in menu order, so tray.ts and the tests agree. */
export const SIZE_MENU: ReadonlyArray<{ size: SizeOption; label: string }> = [
  { size: 'small', label: 'Small (75%)' },
  { size: 'normal', label: 'Normal (100%)' },
  { size: 'large', label: 'Large (130%)' },
]

/** Convenience for tray.ts: radio items with the given tier pre-checked. */
export function sizeSubmenu(
  current: SizeOption,
  onPick: (size: SizeOption) => void,
): MenuItemConstructorOptions[] {
  return SIZE_MENU.map(({ size, label }) => ({
    type: 'radio' as const,
    label,
    checked: size === current,
    click: () => onPick(size),
  }))
}
