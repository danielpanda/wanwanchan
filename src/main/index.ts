import { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, type Rectangle } from 'electron'
import { join } from 'node:path'
import { createSetupWindow, registerAccessibilityIpc } from './accessibility.ts'
import { startAiServer } from './ai-server.ts'
import {
  COMPANION_SETTINGS_CHANGED,
  COMPANION_TRIGGER_ACTION,
  DRAG_BEGIN_CHANNEL,
  DRAG_END_CHANNEL,
  EVOLUTION_BEGIN_CHANNEL,
  EVOLUTION_END_CHANNEL,
} from './companion-channels.ts'
import { openCompanionWindow, registerCompanionIpc, type CompanionDeps } from './companion-window.ts'
import { clampDrag, spriteBox } from './drag.ts'
import { isAccessibilityTrusted, startInputHook } from './input-hook.ts'
import { loadSettings, saveSettings, type Position } from './settings.ts'
import { layoutFor, SIZE_CHANNEL, windowSizeFor, type SizeOption } from './sizes.ts'
import { SKIN_CHANNEL, type SkinOption } from './skins.ts'
import { createTray, refreshTray, type TrayDeps } from './tray.ts'

/** Ghost-mode dim (issue 06): visibly translucent, still readable. */
const GHOST_OPACITY = 0.7
/** Position persistence settles once, 500ms after the last move (issue 06). */
const POSITION_SETTLE_MS = 500
/** Custom pointer drag follows the cursor at 60Hz (ADR 0002). */
const DRAG_TICK_MS = 16
/** Reset Position anchor: 16px off the primary display's work-area corner. */
const DEFAULT_MARGIN = 16
/** Evolution cutscene fills ~85% of the work area, integer-scaled to 256px. */
const EVOLUTION_WORK_AREA_RATIO = 0.85

// Module-level refs keep the tray (and window) alive; GC would unhook them.
let tray: Tray | null = null
let stopInputHook: (() => void) | null = null
let setupWin: BrowserWindow | null = null

function createWindow(size: SizeOption): BrowserWindow {
  const { width, height } = windowSizeFor(size)
  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.webContents.on('console-message', (_event, level, message) => {
      console.log(`[renderer:${level}] ${message}`)
    })
  }

  // Above normal windows, below system alerts and permission dialogs.
  win.setAlwaysOnTop(true, 'floating')

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  return win
}

/** Ghost mode (issue 06): click-through + dimmed to GHOST_OPACITY. */
function applyGhostMode(win: BrowserWindow, on: boolean): void {
  // forward: true keeps mousemove flowing for future hover/petting overlays —
  // clicks themselves already fall through to whatever app is underneath.
  win.setIgnoreMouseEvents(on, { forward: true })
  win.setOpacity(on ? GHOST_OPACITY : 1)
}

/** A saved position is only worth restoring while a display still shows it. */
function onScreen(pos: Position, win: BrowserWindow): boolean {
  const { width, height } = win.getBounds()
  const { workArea } = screen.getDisplayMatching({ x: pos.x, y: pos.y, width, height })
  return (
    pos.x >= workArea.x &&
    pos.y >= workArea.y &&
    pos.x + width <= workArea.x + workArea.width &&
    pos.y + height <= workArea.y + workArea.height
  )
}

app.whenReady().then(() => {
  // Faceless shell: no Dock icon, no Cmd+Tab entry.
  app.dock?.hide()
  registerAccessibilityIpc()

  const settingsDir = app.getPath('userData')
  const settings = loadSettings(settingsDir)
  const win = createWindow(settings.size)

  if (settings.position && onScreen(settings.position, win)) {
    win.setPosition(settings.position.x, settings.position.y)
  }
  // Ghost mode survives restarts (issue 06): re-arm before first paint. The
  // global input hook is unaffected — the pet keeps reacting underneath.
  if (settings.ghostMode) applyGhostMode(win, true)

  // Start local AI Agent Webhook server
  const aiServer = startAiServer(settings.aiServerPort, () => win)

  // Debounced position persistence: one write per 500ms settle, not one per
  // move event. `pendingPos` stays un-flushed until the timer (or will-quit)
  // lands it, so quitting mid-settle still restores the last resting spot.
  let posTimer: NodeJS.Timeout | null = null
  let pendingPos: Position | null = null
  const flushPosition = (): void => {
    if (!pendingPos) return
    settings.position = pendingPos
    pendingPos = null
    saveSettings(settings, settingsDir)
  }
  win.on('moved', () => {
    const [x, y] = win.getPosition()
    // The restore-time setPosition lands here too; a no-op move is not a write.
    if (settings.position?.x === x && settings.position?.y === y) return
    pendingPos = { x, y }
    if (posTimer) clearTimeout(posTimer)
    posTimer = setTimeout(flushPosition, POSITION_SETTLE_MS)
  })

  const setGhost = (on: boolean): void => {
    settings.ghostMode = on
    applyGhostMode(win, on)
    // Click-through swallows pointerup, so an in-flight drag must stop here.
    if (on) endDrag()
    saveSettings(settings, settingsDir)
    if (tray) refreshTray(tray, trayDeps, isAccessibilityTrusted(), on, settings.size, settings.skin)
  }

  /** Resize around a planted bottom-center: the pet's feet stay put (issue 07). */
  const setSize = (size: SizeOption): void => {
    win.webContents.send(SIZE_CHANNEL, size)
    if (size === settings.size) return
    // A resized window invalidates the active drag's box and grab; stop it.
    endDrag()
    const b = win.getBounds()
    const { width, height } = windowSizeFor(size)
    win.setBounds({
      x: Math.round(b.x + (b.width - width) / 2),
      y: b.y + b.height - height,
      width,
      height,
    })
    settings.size = size
    saveSettings(settings, settingsDir)
    if (tray) refreshTray(tray, trayDeps, isAccessibilityTrusted(), settings.ghostMode, size, settings.skin)
  }

  /** Skins share anchors and frame counts, so swapping is a sheet-swap only. */
  const setSkin = (skin: SkinOption): void => {
    win.webContents.send(SKIN_CHANNEL, skin)
    if (skin === settings.skin) return
    settings.skin = skin
    saveSettings(settings, settingsDir)
    if (tray) refreshTray(tray, trayDeps, isAccessibilityTrusted(), settings.ghostMode, settings.size, skin)
  }

  /** Default anchor: bottom-right of the primary display's work area (spec §11.2). */
  const resetPosition = (): void => {
    const { width, height } = win.getBounds()
    const wa = screen.getPrimaryDisplay().workArea
    win.setPosition(wa.x + wa.width - width - DEFAULT_MARGIN, wa.y + wa.height - height - DEFAULT_MARGIN)
  }

  /** Evolution cutscene (issue 14): transient near-fullscreen resize + restore. */
  let evolutionBounds: Rectangle | null = null
  const enterEvolution = (): void => {
    if (evolutionBounds) return
    // The cutscene resizes the window; a running drag would fight the bounds.
    endDrag()
    evolutionBounds = win.getBounds()
    const wa = screen.getPrimaryDisplay().workArea
    const maxW = Math.floor(wa.width * EVOLUTION_WORK_AREA_RATIO)
    const maxH = Math.floor(wa.height * EVOLUTION_WORK_AREA_RATIO)
    // 256px frames stay crisp: the window is an integer multiple of the frame.
    const scale = Math.max(1, Math.min(Math.floor(maxW / 256), Math.floor(maxH / 256)))
    const size = 256 * scale
    win.setBounds({
      x: wa.x + Math.floor((wa.width - size) / 2),
      y: wa.y + Math.floor((wa.height - size) / 2),
      width: size,
      height: size,
    })
  }
  const exitEvolution = (): void => {
    if (!evolutionBounds) return
    win.setBounds(evolutionBounds)
    evolutionBounds = null
  }
  ipcMain.on(EVOLUTION_BEGIN_CHANNEL, enterEvolution)
  ipcMain.on(EVOLUTION_END_CHANNEL, exitEvolution)

  // Custom pointer drag (ADR 0002): main follows the cursor at 60Hz and clamps
  // the sprite box to the work area of the display under the cursor. The
  // renderer owns the gesture and sends only begin/end with a window-local grab.
  let dragTimer: NodeJS.Timeout | null = null
  const endDrag = (): void => {
    if (!dragTimer) return
    clearInterval(dragTimer)
    dragTimer = null
    // Persist directly: the renderer's release is the source of truth, not a
    // debounced `moved` event that may never fire.
    const [x, y] = win.getPosition()
    settings.position = { x, y }
    pendingPos = null
    if (posTimer) clearTimeout(posTimer)
    saveSettings(settings, settingsDir)
  }
  ipcMain.on(DRAG_BEGIN_CHANNEL, (_event, { offsetX, offsetY }) => {
    // Ghost mode is click-through (no presses reach the renderer) and the
    // evolution cutscene resizes the window — both make following wrong.
    if (settings.ghostMode || evolutionBounds) return
    endDrag()
    const { drawSize, headroom } = layoutFor(settings.size)
    const { width, height } = win.getBounds()
    const box = spriteBox(width, height, drawSize, headroom)
    const grab = { x: offsetX, y: offsetY }
    dragTimer = setInterval(() => {
      const cursor = screen.getCursorScreenPoint()
      const wa = screen.getDisplayNearestPoint(cursor).workArea
      const { x, y } = clampDrag(cursor, grab, box, wa)
      win.setPosition(x, y)
    }, DRAG_TICK_MS)
  })
  ipcMain.on(DRAG_END_CHANNEL, endDrag)
  win.on('closed', () => {
    if (dragTimer) clearInterval(dragTimer)
    dragTimer = null
  })

  const companionDeps: CompanionDeps = {
    getSettings: () => settings,
    saveSettings: (updated) => {
      Object.assign(settings, updated)
      saveSettings(settings, settingsDir)
    },
    onSettingsChanged: (updated) => {
      win.webContents.send(COMPANION_SETTINGS_CHANGED, updated)
      if (updated.size !== settings.size) setSize(updated.size)
      if (updated.skin !== settings.skin) setSkin(updated.skin)
    },
    onTriggerAction: (action, payload) => {
      win.webContents.send(COMPANION_TRIGGER_ACTION, { action, payload })
    },
    getPetWindow: () => win,
  }

  const trayDeps: TrayDeps = {
    onGrantAccessibility: () => openSetup(),
    onToggleGhost: (on) => setGhost(on),
    onSetSize: (size) => setSize(size),
    onSetSkin: (skin) => setSkin(skin),
    onResetPosition: () => resetPosition(),
    onOpenCompanion: () => openCompanionWindow(companionDeps),
  }
  tray = createTray(trayDeps, isAccessibilityTrusted(), settings.ghostMode, settings.size, settings.skin)

  registerCompanionIpc(companionDeps)

  // Shortcut configurable via settings.json (issue 06); the tray checkbox is
  // the fallback when another app already owns the combo — without it a
  // persisted ghost mode could never be turned off.
  if (!globalShortcut.register(settings.shortcut, () => setGhost(!settings.ghostMode))) {
    console.error(`[wanwan] shortcut "${settings.shortcut}" unavailable — toggle ghost mode from the tray`)
  }

  // Hook after the first paint: the renderer only registers its state-update
  // listener once its module has run, and sends before that are dropped.
  const startHooks = (): void => {
    stopInputHook?.()
    stopInputHook = startInputHook(win)
    win.webContents.send(SIZE_CHANNEL, settings.size)
    win.webContents.send(SKIN_CHANNEL, settings.skin)
    win.webContents.send(COMPANION_SETTINGS_CHANGED, settings)
    if (tray) refreshTray(tray, trayDeps, isAccessibilityTrusted(), settings.ghostMode, settings.size, settings.skin)
    if (!stopInputHook) console.log('[wanwan] no accessibility trust — idle-only mode')
  }
  win.webContents.on('did-finish-load', startHooks)
  win.on('closed', () => {
    stopInputHook?.()
    stopInputHook = null
  })

  if (!isAccessibilityTrusted()) setupWin = openSetup()

  function openSetup(): BrowserWindow {
    if (setupWin && !setupWin.isDestroyed()) {
      setupWin.focus()
      return setupWin
    }
    const setup = createSetupWindow({
      onGranted: () => {
        if (!setupWin?.isDestroyed()) setupWin?.close()
        setupWin = null
        startHooks()
      },
    })
    setup.on('closed', () => {
      if (setupWin === setup) setupWin = null
    })
    setupWin = setup
    return setup
  }

  app.on('will-quit', () => {
    if (posTimer) clearTimeout(posTimer)
    flushPosition()
    globalShortcut.unregisterAll()
    aiServer.stop()
  })
})

app.on('will-quit', () => stopInputHook?.())
app.on('window-all-closed', () => app.quit())
