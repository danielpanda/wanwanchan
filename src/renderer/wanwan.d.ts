import type { WanWanAPI } from '../preload/index.ts'

declare global {
  interface Window {
    /**
     * Exposed by the preload bridge. Optional: contextBridge has not run yet
     * when the renderer is opened outside Electron, and the app must still
     * render idle rather than throw.
     */
    wanwan?: WanWanAPI
  }
}
