// Companion Hub window: settings, timers, reminders, and AI status dashboard.
import { BrowserWindow, ipcMain, Notification } from 'electron'
import { join } from 'node:path'
import {
  COMPANION_GET_SETTINGS,
  COMPANION_OPEN_SETTINGS,
  COMPANION_SAVE_SETTINGS,
  COMPANION_SETTINGS_CHANGED,
  COMPANION_TRIGGER_ACTION,
  AI_STATUS_CHANNEL,
} from './companion-channels.ts'
import type { Settings } from './settings.ts'

export interface CompanionDeps {
  getSettings: () => Settings
  saveSettings: (settings: Settings) => void
  onSettingsChanged: (settings: Settings) => void
  onTriggerAction: (action: string, payload?: unknown) => void
  getPetWindow: () => BrowserWindow | null
}

let companionWin: BrowserWindow | null = null
let ipcRegistered = false

export function registerCompanionIpc(deps: CompanionDeps): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(COMPANION_GET_SETTINGS, () => {
    return deps.getSettings()
  })

  ipcMain.handle(COMPANION_SAVE_SETTINGS, (_event, updated: Settings) => {
    deps.saveSettings(updated)
    deps.onSettingsChanged(updated)
    return true
  })

  ipcMain.on(COMPANION_OPEN_SETTINGS, () => {
    openCompanionWindow(deps)
  })

  ipcMain.on(COMPANION_TRIGGER_ACTION, (_event, { action, payload }) => {
    deps.onTriggerAction(action, payload)

    // Optional native notification for test or reminder trigger
    const settings = deps.getSettings()
    if (settings.nativeNotifications && (action === 'test-stretch' || action === 'test-water' || action === 'test-reminder')) {
      const title = action === 'test-stretch' ? '🧘 Time to Stretch!' : action === 'test-water' ? '💧 Drink Water!' : '⏰ Reminder'
      const name = settings.userName ? `${settings.userName}, ` : ''
      const body = typeof payload === 'string' && payload ? payload : `${name}WanWan-chan is reminding you!`
      new Notification({ title, body, silent: !settings.soundEnabled }).show()
    }
  })
}

export function openCompanionWindow(deps: CompanionDeps): BrowserWindow {
  registerCompanionIpc(deps)

  if (companionWin && !companionWin.isDestroyed()) {
    companionWin.focus()
    return companionWin
  }

  const win = new BrowserWindow({
    width: 520,
    height: 600,
    title: 'WanWan-chan — Companion Hub',
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) win.loadURL(`${devUrl}/companion/index.html`)
  else win.loadFile(join(__dirname, '../renderer/companion/index.html'))

  win.on('closed', () => {
    if (companionWin === win) companionWin = null
  })

  companionWin = win
  return win
}
