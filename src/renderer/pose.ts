// Pose selection: which sheet the character draws this frame (spec §9).
// Pure, DOM-free; see pose.test.ts.

export type Expression = 'happy' | 'laugh' | 'confused'

export type Pose =
  | 'sleepTransition'
  | 'sleep'
  | 'overheat'
  | 'typing'
  | 'idle'
  | Expression

export interface PoseInput {
  sleepPhase: 'transition' | 'wake' | 'loop' | null
  isTyping: boolean
  overheated: boolean
  isPetting: boolean
  agentStatus: 'idle' | 'thinking' | 'done'
  /** Expression sheets this skin provides; missing ones fall through. */
  expressions: ReadonlySet<Expression>
}

/** Expression strips are 2 frames looping at this rate. */
export const EXPRESSION_FRAME_MS = 400

export function selectPose(p: PoseInput): Pose {
  if (p.sleepPhase === 'transition' || p.sleepPhase === 'wake') return 'sleepTransition'
  if (p.sleepPhase === 'loop') return 'sleep'
  if (p.isTyping && p.overheated) return 'overheat'
  if (p.isPetting && p.expressions.has('laugh')) return 'laugh'
  if (p.agentStatus === 'done' && p.expressions.has('happy')) return 'happy'
  if (p.agentStatus === 'thinking' && p.expressions.has('confused')) return 'confused'
  return p.isTyping ? 'typing' : 'idle'
}

export function expressionFrame(nowMs: number): number {
  return Math.floor(nowMs / EXPRESSION_FRAME_MS) % 2
}
