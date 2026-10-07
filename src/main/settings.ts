// Persisted settings (issue 06 + Tamagotchi expansion): ghost mode, its shortcut,
// resting position, user profile, timers (pomodoro, stretch, water), reminders, and audio.
// Deliberately electron-free — sanitize() stays unit-testable under node --test
// (importing 'electron' outside the app resolves to the binary path string).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSizeOption, type SizeOption } from './sizes.ts'
import { isSkinOption, type SkinOption } from './skins.ts'

export interface Position {
  x: number
  y: number
}

export interface PomodoroSettings {
  enabled: boolean
  focusMinutes: number
  breakMinutes: number
}

export interface StretchSettings {
  enabled: boolean
  intervalMinutes: number
}

export interface WaterSettings {
  enabled: boolean
  intervalMinutes: number
}

export interface CustomReminder {
  id: string
  time: string
  message: string
  enabled: boolean
}

export interface Settings {
  ghostMode: boolean
  shortcut: string
  position: Position | null
  /** Character size tier (issue 07); the renderer maps it to a pixel scale. */
  size: SizeOption
  /** Character skin; the renderer swaps the whole sprite-sheet set. */
  skin: SkinOption
  userName: string
  soundEnabled: boolean
  soundVolume: number
  nativeNotifications: boolean
  pomodoro: PomodoroSettings
  stretch: StretchSettings
  water: WaterSettings
  reminders: CustomReminder[]
  aiServerPort: number
}

export const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+D'

export const DEFAULTS: Settings = {
  ghostMode: false,
  shortcut: DEFAULT_SHORTCUT,
  position: null,
  size: 'normal',
  skin: 'agumon',
  userName: '',
  soundEnabled: true,
  soundVolume: 0.7,
  nativeNotifications: false,
  pomodoro: {
    enabled: false,
    focusMinutes: 25,
    breakMinutes: 5,
  },
  stretch: {
    enabled: false,
    intervalMinutes: 45,
  },
  water: {
    enabled: false,
    intervalMinutes: 60,
  },
  reminders: [],
  aiServerPort: 3721,
}

function sanitizePomodoro(raw: unknown): PomodoroSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const focus = Number(o.focusMinutes)
  const brk = Number(o.breakMinutes)
  return {
    enabled: o.enabled === true,
    focusMinutes: Number.isFinite(focus) && focus > 0 && focus <= 180 ? Math.round(focus) : DEFAULTS.pomodoro.focusMinutes,
    breakMinutes: Number.isFinite(brk) && brk > 0 && brk <= 60 ? Math.round(brk) : DEFAULTS.pomodoro.breakMinutes,
  }
}

function sanitizeStretch(raw: unknown): StretchSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const interval = Number(o.intervalMinutes)
  return {
    enabled: o.enabled === true,
    intervalMinutes: Number.isFinite(interval) && interval > 0 && interval <= 240 ? Math.round(interval) : DEFAULTS.stretch.intervalMinutes,
  }
}

function sanitizeWater(raw: unknown): WaterSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const interval = Number(o.intervalMinutes)
  return {
    enabled: o.enabled === true,
    intervalMinutes: Number.isFinite(interval) && interval > 0 && interval <= 240 ? Math.round(interval) : DEFAULTS.water.intervalMinutes,
  }
}

function sanitizeReminders(raw: unknown): CustomReminder[] {
  if (!Array.isArray(raw)) return []
  const result: CustomReminder[] = []
  for (const item of raw) {
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>
      if (typeof o.id === 'string' && typeof o.time === 'string' && typeof o.message === 'string') {
        result.push({
          id: o.id.trim() || String(Date.now()),
          time: o.time.trim(),
          message: o.message.trim(),
          enabled: o.enabled !== false,
        })
      }
    }
  }
  return result
}

/**
 * Coerces a parsed settings.json (absent, truncated or hand-edited) into full
 * settings. Anything malformed falls back field-by-field rather than poisoning
 * the whole file — a hand-edited typo must not resurrect default ghost mode.
 */
export function sanitize(raw: unknown): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const pos = o.position as Record<string, unknown> | null | undefined
  const position =
    pos !== null &&
    pos !== undefined &&
    Number.isInteger(pos.x) &&
    Number.isInteger(pos.y)
      ? { x: pos.x as number, y: pos.y as number }
      : null

  const soundVolumeRaw = Number(o.soundVolume)
  const soundVolume = Number.isFinite(soundVolumeRaw) && soundVolumeRaw >= 0 && soundVolumeRaw <= 1
    ? soundVolumeRaw
    : DEFAULTS.soundVolume

  const portRaw = Number(o.aiServerPort)
  const aiServerPort = Number.isInteger(portRaw) && portRaw >= 1024 && portRaw <= 65535
    ? portRaw
    : DEFAULTS.aiServerPort

  return {
    ghostMode: o.ghostMode === true,
    shortcut:
      typeof o.shortcut === 'string' && o.shortcut.trim() ? o.shortcut.trim() : DEFAULT_SHORTCUT,
    position,
    size: isSizeOption(o.size) ? o.size : 'normal',
    skin: isSkinOption(o.skin) ? o.skin : 'agumon',
    userName: typeof o.userName === 'string' ? o.userName.trim() : '',
    soundEnabled: o.soundEnabled !== false,
    soundVolume,
    nativeNotifications: o.nativeNotifications === true,
    pomodoro: sanitizePomodoro(o.pomodoro),
    stretch: sanitizeStretch(o.stretch),
    water: sanitizeWater(o.water),
    reminders: sanitizeReminders(o.reminders),
    aiServerPort,
  }
}

export function loadSettings(userDataDir: string): Settings {
  try {
    return sanitize(JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')))
  } catch {
    // Missing or unreadable file: first launch, or corruption — defaults are safe.
    return { ...DEFAULTS }
  }
}

export function saveSettings(settings: Settings, userDataDir: string): void {
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify(settings, null, 2))
}
