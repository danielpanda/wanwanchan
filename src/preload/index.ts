// Preload bridge. contextIsolation is on, so the renderer only ever sees the
// functions exposed here — never ipcRenderer itself.
import { contextBridge, ipcRenderer } from 'electron'
import {
  OPEN_PREFS_CHANNEL,
  RECHECK_CHANNEL,
} from '../main/accessibility-channels'
import {
  COMPANION_GET_SETTINGS,
  COMPANION_OPEN_SETTINGS,
  COMPANION_SAVE_SETTINGS,
  COMPANION_SETTINGS_CHANGED,
  COMPANION_TRIGGER_ACTION,
  AI_STATUS_CHANNEL,
  EVOLUTION_BEGIN_CHANNEL,
  EVOLUTION_END_CHANNEL,
  DRAG_BEGIN_CHANNEL,
  DRAG_END_CHANNEL,
} from '../main/companion-channels'
import type { AgentPayload } from '../main/ai-server'
import type { Settings } from '../main/settings'
import { STATE_UPDATE_CHANNEL, type InputState } from '../main/input-state'
import { SIZE_CHANNEL, type SizeOption } from '../main/sizes'
import { SKIN_CHANNEL, type SkinOption } from '../main/skins'

export interface WanWanAPI {
  onStateUpdate(callback: (state: InputState) => void): void
  onSizeChange(callback: (size: SizeOption) => void): void
  onSkinChange(callback: (skin: SkinOption) => void): void
  openAccessibilityPrefs(): void
  recheckAccessibility(): Promise<boolean>
  openCompanionHub(): void
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<boolean>
  triggerAction(action: string, payload?: unknown): void
  onSettingsChanged(callback: (settings: Settings) => void): void
  onTriggerAction(callback: (action: string, payload?: unknown) => void): void
  onAiStatus(callback: (payload: AgentPayload) => void): void
  beginEvolution(): void
  endEvolution(): void
  beginDrag(offsetX: number, offsetY: number): void
  endDrag(): void
}

let currentSize: SizeOption | null = null
let currentSkin: SkinOption | null = null
let sizeListener: ((size: SizeOption) => void) | null = null
let skinListener: ((skin: SkinOption) => void) | null = null

ipcRenderer.on(SIZE_CHANNEL, (_event, size: SizeOption) => {
  currentSize = size
  sizeListener?.(size)
})

ipcRenderer.on(SKIN_CHANNEL, (_event, skin: SkinOption) => {
  currentSkin = skin
  skinListener?.(skin)
})

const api: WanWanAPI = {
  onStateUpdate: (callback) => {
    ipcRenderer.on(STATE_UPDATE_CHANNEL, (_event, state: InputState) => callback(state))
  },
  onSizeChange: (callback) => {
    sizeListener = callback
    if (currentSize !== null) callback(currentSize)
  },
  onSkinChange: (callback) => {
    skinListener = callback
    if (currentSkin !== null) callback(currentSkin)
  },
  openAccessibilityPrefs: () => ipcRenderer.send(OPEN_PREFS_CHANNEL),
  recheckAccessibility: () => ipcRenderer.invoke(RECHECK_CHANNEL) as Promise<boolean>,

  openCompanionHub: () => ipcRenderer.send(COMPANION_OPEN_SETTINGS),
  getSettings: () => ipcRenderer.invoke(COMPANION_GET_SETTINGS) as Promise<Settings>,
  saveSettings: (settings: Settings) => ipcRenderer.invoke(COMPANION_SAVE_SETTINGS, settings) as Promise<boolean>,
  triggerAction: (action: string, payload?: unknown) => {
    ipcRenderer.send(COMPANION_TRIGGER_ACTION, { action, payload })
  },
  onSettingsChanged: (callback) => {
    ipcRenderer.on(COMPANION_SETTINGS_CHANGED, (_event, settings: Settings) => callback(settings))
  },
  onTriggerAction: (callback) => {
    ipcRenderer.on(COMPANION_TRIGGER_ACTION, (_event, { action, payload }) => callback(action, payload))
  },
  onAiStatus: (callback) => {
    ipcRenderer.on(AI_STATUS_CHANNEL, (_event, payload: AgentPayload) => callback(payload))
  },
  beginEvolution: () => ipcRenderer.send(EVOLUTION_BEGIN_CHANNEL),
  endEvolution: () => ipcRenderer.send(EVOLUTION_END_CHANNEL),
  beginDrag: (offsetX: number, offsetY: number) => ipcRenderer.send(DRAG_BEGIN_CHANNEL, { offsetX, offsetY }),
  endDrag: () => ipcRenderer.send(DRAG_END_CHANNEL),
}

contextBridge.exposeInMainWorld('wanwan', api)
