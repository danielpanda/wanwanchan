import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { sizeSubmenu, type SizeOption } from './sizes.ts'
import { skinSubmenu, type SkinOption } from './skins.ts'
import { TRAY_LABELS } from './tray-labels.ts'

/** Tray actions the shell provides; keeps the menu build testable-ish. */
export interface TrayDeps {
  onGrantAccessibility: () => void
  onToggleGhost: (on: boolean) => void
  onSetSize: (size: SizeOption) => void
  onSetSkin: (skin: SkinOption) => void
  onResetPosition: () => void
  onOpenCompanion: () => void
}

/**
 * One-line state summary for the disabled status item (spec §11.2). Everything
 * the main process already knows; sleep/typing live renderer-side and would
 * need a back-channel not worth an IPC round-trip for a menu label.
 */
function statusSummary(accessibilityGranted: boolean, ghostMode: boolean): string {
  if (!accessibilityGranted) return 'idle-only · needs accessibility'
  if (ghostMode) return 'ghost mode'
  return 'active'
}

function buildMenu(
  deps: TrayDeps,
  accessibilityGranted: boolean,
  ghostMode: boolean,
  size: SizeOption,
  skin: SkinOption,
): Menu {
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: TRAY_LABELS.header(statusSummary(accessibilityGranted, ghostMode)), enabled: false },
    { type: 'separator' },
    {
      label: TRAY_LABELS.companionHub,
      click: () => deps.onOpenCompanion(),
    },
    { type: 'separator' },
  ]
  // Shown only while permission is missing (spec §13.2): once granted the
  // item disappears — re-checking a permission you already have is noise.
  if (!accessibilityGranted) {
    items.push({
      label: TRAY_LABELS.grantAccessibility,
      click: () => deps.onGrantAccessibility(),
    })
    items.push({ type: 'separator' })
  }
  // Fallback toggle: the shortcut can be owned by another app, and a tray
  // click is the only way out of a persisted click-through ghost mode.
  items.push({
    type: 'checkbox',
    label: TRAY_LABELS.clickThrough,
    checked: ghostMode,
    click: (item) => deps.onToggleGhost(item.checked),
  })
  items.push({
    label: TRAY_LABELS.size,
    submenu: sizeSubmenu(size, deps.onSetSize),
  })
  items.push({
    label: TRAY_LABELS.skin,
    submenu: skinSubmenu(skin, deps.onSetSkin),
  })
  items.push({ label: TRAY_LABELS.resetPosition, click: () => deps.onResetPosition() })
  items.push({ type: 'separator' })
  items.push({ label: TRAY_LABELS.quit, click: () => app.quit() })
  return Menu.buildFromTemplate(items)
}

export function createTray(
  deps: TrayDeps,
  accessibilityGranted: boolean,
  ghostMode: boolean,
  size: SizeOption,
  skin: SkinOption,
): Tray {
  const icon = nativeImage.createFromPath(
    join(app.getAppPath(), 'assets/tray/iconTemplate.png'),
  )
  // Template image: macOS renders it black/white to match light/dark menu bar.
  icon.setTemplateImage(true)

  const tray = new Tray(icon)
  tray.setToolTip('WanWan-chan')
  tray.setContextMenu(buildMenu(deps, accessibilityGranted, ghostMode, size, skin))
  return tray
}

/** Rebuilds the menu after the accessibility, ghost-mode, size or skin state changes. */
export function refreshTray(
  tray: Tray,
  deps: TrayDeps,
  accessibilityGranted: boolean,
  ghostMode: boolean,
  size: SizeOption,
  skin: SkinOption,
): void {
  tray.setContextMenu(buildMenu(deps, accessibilityGranted, ghostMode, size, skin))
}
