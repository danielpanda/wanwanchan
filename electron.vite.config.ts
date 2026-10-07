import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

// Three renderer pages: the pet, the accessibility setup window, and the companion hub.
// Empty main/preload keys: their src paths follow the electron-vite default
// convention, but a config that omits the sections skips building them.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          setup: resolve('src/renderer/setup/index.html'),
          companion: resolve('src/renderer/companion/index.html'),
        },
      },
    },
  },
})
