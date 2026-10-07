// Retro pixel-art pill badge floating next to Pet for Pomodoro focus/break loops.

export type PomodoroMode = 'idle' | 'focus' | 'break'

export interface TimerBadgeState {
  mode: PomodoroMode
  remainingSec: number
  focusSec: number
  breakSec: number
  paused: boolean
  accumMs: number
  bounds: { x: number; y: number; w: number; h: number }
}

export function createTimerBadgeState(): TimerBadgeState {
  return {
    mode: 'idle',
    remainingSec: 0,
    focusSec: 25 * 60,
    breakSec: 5 * 60,
    paused: false,
    accumMs: 0,
    bounds: { x: 0, y: 0, w: 0, h: 0 },
  }
}

export function startPomodoro(state: TimerBadgeState, focusMin = 25, breakMin = 5): void {
  state.mode = 'focus'
  state.focusSec = focusMin * 60
  state.breakSec = breakMin * 60
  state.remainingSec = state.focusSec
  state.paused = false
  state.accumMs = 0
}

export function stopPomodoro(state: TimerBadgeState): void {
  state.mode = 'idle'
  state.remainingSec = 0
  state.paused = false
}

export function togglePausePomodoro(state: TimerBadgeState): boolean {
  if (state.mode === 'idle') return false
  state.paused = !state.paused
  return state.paused
}

export function skipPomodoroPhase(
  state: TimerBadgeState,
  onPhaseChange?: (newMode: PomodoroMode) => void,
): void {
  if (state.mode === 'focus') {
    state.mode = 'break'
    state.remainingSec = state.breakSec
    state.accumMs = 0
    onPhaseChange?.('break')
  } else if (state.mode === 'break') {
    state.mode = 'focus'
    state.remainingSec = state.focusSec
    state.accumMs = 0
    onPhaseChange?.('focus')
  }
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

export function tickTimerBadge(
  state: TimerBadgeState,
  dtMs: number,
  onPhaseComplete?: (completedMode: PomodoroMode) => void,
): void {
  if (state.mode === 'idle' || state.paused) return

  state.accumMs += dtMs
  while (state.accumMs >= 1000) {
    state.accumMs -= 1000
    state.remainingSec--

    if (state.remainingSec <= 0) {
      const completed = state.mode
      if (completed === 'focus') {
        state.mode = 'break'
        state.remainingSec = state.breakSec
      } else {
        state.mode = 'focus'
        state.remainingSec = state.focusSec
      }
      onPhaseComplete?.(completed)
      break
    }
  }
}

export function hitTestTimerBadge(state: TimerBadgeState, x: number, y: number): boolean {
  if (state.mode === 'idle') return false
  const b = state.bounds
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

export function drawTimerBadge(
  ctx: CanvasRenderingContext2D,
  state: TimerBadgeState,
  anchorX: number,
  anchorY: number,
): void {
  if (state.mode === 'idle') return

  ctx.save()

  const isFocus = state.mode === 'focus'
  const icon = isFocus ? '🍅' : '☕'
  const status = isFocus ? 'FOCUS' : 'BREAK'
  const timeStr = formatTime(state.remainingSec)
  const text = `${icon} ${timeStr} ${status}`

  const fontSize = 10
  ctx.font = `bold ${fontSize}px ui-monospace, monospace`
  const textW = ctx.measureText(text).width

  const padX = 7
  const padY = 4
  const badgeW = Math.round(textW + padX * 2)
  const badgeH = Math.round(fontSize + padY * 2 + 2)

  const badgeX = Math.round(anchorX - badgeW / 2)
  const badgeY = Math.round(anchorY - badgeH)

  state.bounds = { x: badgeX, y: badgeY, w: badgeW, h: badgeH }

  // Pixel shadow / outline
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(badgeX - 1, badgeY - 1, badgeW + 2, badgeH + 2)

  // Badge background (distinct for focus vs break)
  ctx.fillStyle = isFocus ? '#b91c1c' : '#047857'
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH)

  // Inner highlight border
  ctx.strokeStyle = isFocus ? '#ef4444' : '#10b981'
  ctx.lineWidth = 1
  ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1)

  // Text
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(state.paused ? `⏸ ${timeStr}` : text, badgeX + badgeW / 2, badgeY + badgeH / 2)

  ctx.restore()
}
