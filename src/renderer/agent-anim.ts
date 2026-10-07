// AI Agent reactive animations: Thinking Face (gaze + thought cloud) & Happy Hop (vertical bounce + stars)
import type { AgentPayload, AgentStatus } from '../main/ai-server.ts'

export interface AgentAnimState {
  status: AgentStatus
  agentName: string
  thoughtBubbleCycleMs: number
  hopActive: boolean
  hopDy: number
  hopVy: number
  hopElapsedMs: number
  doneTimerMs: number
}

/**
 * Pupil gaze offset when AI agent is thinking (source pixels within 64x64 frame).
 * - x: positive = gaze right, negative = gaze left
 * - y: positive = gaze down, negative = gaze up
 * Default: { x: 0.5, y: -0.5 } (looking up and to the right)
 */
export const THINKING_PUPIL_OFFSET = {
  x: 0.5,
  y: -0.5,
}

const GRAVITY = 320
const HOP_INITIAL_VY = -110
const HOP_DURATION_MS = 600
const DONE_STATE_TIMEOUT_MS = 4000

export function createAgentAnimState(): AgentAnimState {
  return {
    status: 'idle',
    agentName: '',
    thoughtBubbleCycleMs: 0,
    hopActive: false,
    hopDy: 0,
    hopVy: 0,
    hopElapsedMs: 0,
    doneTimerMs: 0,
  }
}

export function handleAgentPayload(
  state: AgentAnimState,
  payload: AgentPayload,
  onDone?: () => void,
): void {
  const prev = state.status
  state.status = payload.status
  if (payload.agent) state.agentName = payload.agent

  if (payload.status === 'thinking') {
    state.hopActive = false
    state.hopDy = 0
  } else if (payload.status === 'done') {
    state.doneTimerMs = 0
    triggerHop(state)
    if (prev !== 'done') {
      onDone?.()
    }
  }
}

export function triggerHop(state: AgentAnimState): void {
  state.hopActive = true
  state.hopDy = 0
  state.hopVy = HOP_INITIAL_VY
  state.hopElapsedMs = 0
}

export function tickAgentAnim(
  state: AgentAnimState,
  dtMs: number,
  onResetIdle?: () => void,
): void {
  // Animate thinking thought bubble
  if (state.status === 'thinking') {
    state.thoughtBubbleCycleMs = (state.thoughtBubbleCycleMs + dtMs) % 1500
  }

  // Animate Happy Hop parabolic physics with fixed sub-stepping for numerical stability
  if (state.hopActive) {
    let remainingMs = Math.min(2000, dtMs)
    const stepMs = 16
    while (remainingMs > 0) {
      const currentStep = Math.min(stepMs, remainingMs)
      remainingMs -= currentStep
      const dtSec = currentStep / 1000

      state.hopElapsedMs += currentStep
      state.hopDy += state.hopVy * dtSec
      state.hopVy += GRAVITY * dtSec

      // Floor contact
      if (state.hopDy >= 0) {
        state.hopDy = 0
        if (state.hopElapsedMs < HOP_DURATION_MS) {
          state.hopVy = -50
        } else {
          state.hopActive = false
          state.hopVy = 0
          break
        }
      }
    }
  }

  // Auto-reset from 'done' to 'idle' after duration
  if (state.status === 'done') {
    state.doneTimerMs += dtMs
    if (state.doneTimerMs >= DONE_STATE_TIMEOUT_MS) {
      state.status = 'idle'
      onResetIdle?.()
    }
  }
}

/** Draws pixel-art thought bubble 💭 with pulsing dots */
export function drawThoughtBubble(
  ctx: CanvasRenderingContext2D,
  state: AgentAnimState,
  anchorX: number,
  anchorY: number,
): void {
  if (state.status !== 'thinking') return

  ctx.save()

  // Wobble
  const wobble = Math.sin(state.thoughtBubbleCycleMs * 0.006) * 2
  const bubbleX = Math.round(anchorX + 18)
  const bubbleY = Math.round(anchorY - 26 + wobble)

  // 3 trailing circles
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(bubbleX - 12, bubbleY + 12, 4, 4)
  ctx.fillRect(bubbleX - 7, bubbleY + 7, 6, 6)

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(bubbleX - 11, bubbleY + 13, 2, 2)
  ctx.fillRect(bubbleX - 6, bubbleY + 8, 4, 4)

  // Main cloud bubble
  const w = 36
  const h = 18
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(bubbleX - 1, bubbleY - 1, w + 2, h + 2)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(bubbleX, bubbleY, w, h)

  // Animated dots ...
  const dotStage = Math.floor((state.thoughtBubbleCycleMs / 375) % 4)
  const dots = '.'.repeat(dotStage)

  ctx.fillStyle = '#0284c7'
  ctx.font = 'bold 12px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(dots || '·', bubbleX + w / 2, bubbleY + h / 2)

  ctx.restore()
}
