// Retro pixel speech bubble renderer for WanWan-chan greetings and reminders.

export interface SpeechBubble {
  text: string
  visible: boolean
  ageMs: number
  durationMs: number
  alpha: number
  speakerName?: string
}

export function createSpeechBubble(): SpeechBubble {
  return {
    text: '',
    visible: false,
    ageMs: 0,
    durationMs: 4000,
    alpha: 0,
  }
}

export function showSpeechBubble(bubble: SpeechBubble, text: string, durationMs = 4500): void {
  bubble.text = text
  bubble.visible = true
  bubble.ageMs = 0
  bubble.durationMs = durationMs
  bubble.alpha = 1
}

export function hideSpeechBubble(bubble: SpeechBubble): void {
  bubble.visible = false
  bubble.alpha = 0
}

export function tickSpeechBubble(bubble: SpeechBubble, dtMs: number): void {
  if (!bubble.visible) return
  bubble.ageMs += dtMs
  if (bubble.ageMs >= bubble.durationMs) {
    hideSpeechBubble(bubble)
    return
  }

  // Fade out during last 400ms
  const timeLeft = bubble.durationMs - bubble.ageMs
  if (timeLeft < 400) {
    bubble.alpha = Math.max(0, timeLeft / 400)
  } else {
    bubble.alpha = 1
  }
}

/** Draws pixel speech bubble above the pet's head */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  bubble: SpeechBubble,
  anchorX: number,
  anchorY: number,
  canvasWidth: number,
): void {
  if (!bubble.visible || bubble.alpha <= 0 || !bubble.text) return

  ctx.save()
  ctx.globalAlpha = bubble.alpha

  const fontSize = 11
  ctx.font = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`

  // Wrap text up to max ~28 chars per line
  const words = bubble.text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const w of words) {
    const candidate = currentLine ? `${currentLine} ${w}` : w
    if (candidate.length > 24) {
      if (currentLine) lines.push(currentLine)
      currentLine = w
    } else {
      currentLine = candidate
    }
  }
  if (currentLine) lines.push(currentLine)

  let maxTextWidth = 0
  for (const line of lines) {
    const m = ctx.measureText(line).width
    if (m > maxTextWidth) maxTextWidth = m
  }

  const padX = 8
  const padY = 6
  const lineHeight = fontSize + 3
  const bubbleW = Math.round(maxTextWidth + padX * 2)
  const bubbleH = Math.round(lines.length * lineHeight + padY * 2)

  // Clamp bubbleX so it doesn't clip screen edges
  let bubbleX = Math.round(anchorX - bubbleW / 2)
  if (bubbleX < 6) bubbleX = 6
  if (bubbleX + bubbleW > canvasWidth - 6) bubbleX = canvasWidth - bubbleW - 6

  const bubbleY = Math.max(6, Math.round(anchorY - bubbleH - 8))

  // Pixel border & background
  ctx.fillStyle = '#1e1e24'
  ctx.fillRect(bubbleX - 2, bubbleY - 2, bubbleW + 4, bubbleH + 4)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH)

  // Speech bubble tail
  const tailX = Math.min(Math.max(bubbleX + 12, anchorX), bubbleX + bubbleW - 12)
  const tailY = bubbleY + bubbleH
  ctx.fillStyle = '#1e1e24'
  ctx.fillRect(tailX - 4, tailY, 8, 4)
  ctx.fillRect(tailX - 2, tailY + 4, 4, 3)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(tailX - 2, tailY, 4, 3)

  // Text
  ctx.fillStyle = '#18181b'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  lines.forEach((line, idx) => {
    ctx.fillText(line, bubbleX + padX, bubbleY + padY + idx * lineHeight)
  })

  ctx.restore()
}
