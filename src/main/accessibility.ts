// Guided accessibility grant flow (spec §13.2): a framed setup window with
// instructions, a button that opens System Settings on the right pane, and a
// re-check that starts the input hooks the moment macOS reports trust.
import { BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { isAccessibilityTrusted } from './input-hook'

import { OPEN_PREFS_CHANNEL, RECHECK_CHANNEL } from './accessibility-channels'
export { OPEN_PREFS_CHANNEL, RECHECK_CHANNEL }

/** Deep link to the Privacy → Accessibility pane. */
const PREFS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'

/** Called once, when the setup window's re-check reports trust. */
export interface SetupWindowHooks {
  onGranted: () => void
}

let ipcRegistered = false
let currentHooks: SetupWindowHooks | null = null

export function registerAccessibilityIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  ipcMain.on(OPEN_PREFS_CHANNEL, () => shell.openExternal(PREFS_URL))
  ipcMain.handle(RECHECK_CHANNEL, () => {
    const trusted = isAccessibilityTrusted()
    if (trusted && currentHooks) currentHooks.onGranted()
    return trusted
  })
}

/**
 * The instruction window. Framed (the close button is the decline path) and
 * small; it loads the same preload so its buttons can reach the channels
 * above. Only one exists at a time — index.ts guards that.
 */
export function createSetupWindow(hooks: SetupWindowHooks): BrowserWindow {
  currentHooks = hooks
  const setup = new BrowserWindow({
    width: 380,
    height: 340,
    title: 'WanWan-chan — Accessibility',
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) setup.loadURL(`${devUrl}/setup/index.html`)
  else setup.loadFile(join(__dirname, '../renderer/setup/index.html'))
  return setup
}
