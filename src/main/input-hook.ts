// Global input hook → 60Hz aggregated state snapshots over IPC.
// Raw keystrokes never leave this process: uiohook events only mutate the
// tracker, and a timer ships the aggregate (spec §9.1).
import { systemPreferences, type BrowserWindow } from 'electron'
import {
  createTracker,
  recordCursor,
  recordKey,
  sameState,
  snapshot,
  STATE_UPDATE_CHANNEL,
  type InputState,
} from './input-state'

/** 60Hz. 16ms rather than 16.67 — a whole-ms timer is what setInterval honours. */
const TICK_MS = 16

/**
 * macOS only grants global input hooks to trusted clients. `false` = check
 * without popping the system prompt; the guided grant flow lands in issue 05.
 */
export function isAccessibilityTrusted(): boolean {
  if (process.platform !== 'darwin') return true
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/**
 * Starts hooking global input and streaming snapshots to `win`.
 * Returns a stop function, or null when input hooking is unavailable — the
 * caller stays alive in idle-only mode (spec §13.2 step 4).
 */
export function startInputHook(win: BrowserWindow): (() => void) | null {
  if (!isAccessibilityTrusted()) return null

  // Required lazily: importing the native addon at module load would throw on
  // an unsupported platform even when we never intend to hook.
  let uIOhook: typeof import('uiohook-napi').uIOhook
  try {
    uIOhook = require('uiohook-napi').uIOhook
    uIOhook.start()
  } catch (err) {
    // One line, once. A hook that cannot start is a permanent condition, and
    // the 60Hz loop would otherwise turn it into 60 log lines a second.
    console.error('[wanwan] global input hook unavailable, idle-only mode:', err)
    return null
  }

  const tracker = createTracker()
  const onKeydown = () => recordKey(tracker, Date.now())
  const onMousemove = (e: { x: number; y: number }) => recordCursor(tracker, e.x, e.y)
  uIOhook.on('keydown', onKeydown)
  uIOhook.on('mousemove', onMousemove)

  let last: InputState | null = null
  let stopped = false
  const tick = setInterval(() => {
    // A destroyed window is terminal, so stop rather than skip: the caller may
    // not have called stop() yet and this timer would tick on forever.
    if (win.isDestroyed()) {
      stop()
      return
    }
    const state = snapshot(tracker, Date.now())
    // Tick at 60Hz but only send on change: an untouched keyboard and a still
    // cursor produce an identical snapshot, and 60 redundant messages a second
    // wake the renderer for nothing. Every transition still ships within 16ms.
    if (last && sameState(last, state)) return
    last = state
    win.webContents.send(STATE_UPDATE_CHANNEL, state)
  }, TICK_MS)

  // Idempotent: both the caller and the destroyed-window branch can call it.
  function stop(): void {
    if (stopped) return
    stopped = true
    clearInterval(tick)
    uIOhook.off('keydown', onKeydown)
    uIOhook.off('mousemove', onMousemove)
    // Without this the libuiohook thread keeps the process alive past quit.
    uIOhook.stop()
  }

  return stop
}
