// Character skins (issue: agumon). Mirrors sizes.ts: Electron-free so main,
// preload and renderer share one source of truth, testable under node --test.
import type { MenuItemConstructorOptions } from 'electron'

export type SkinOption = 'agumon'

/** Main→renderer push when the tray Skin submenu picks a character. */
export const SKIN_CHANNEL = 'wanwan:skin'

export function isSkinOption(value: unknown): value is SkinOption {
  return value === 'agumon'
}

/** Tray submenu entries in menu order, so tray.ts and the tests agree. */
export const SKIN_MENU: ReadonlyArray<{ skin: SkinOption; label: string }> = [
  { skin: 'agumon', label: 'Agumon' },
]

/** Convenience for tray.ts: radio items with the given skin pre-checked. */
export function skinSubmenu(
  current: SkinOption,
  onPick: (skin: SkinOption) => void,
): MenuItemConstructorOptions[] {
  return SKIN_MENU.map(({ skin, label }) => ({
    type: 'radio' as const,
    label,
    checked: skin === current,
    click: () => onPick(skin),
  }))
}
