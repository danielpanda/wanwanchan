import { start } from './renderer.ts'

const canvas = document.getElementById('pet')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('#pet canvas missing from index.html')
}

start(canvas).catch((err) => console.error('[wanwan] render loop failed:', err))
