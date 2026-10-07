// Canvas render loop. IDLE + TYPING + OVERHEAT + SLEEP + TAMAGOTCHI EXPANSION:
// Petting & purr, Pomodoro floating badge, Grow-big stretch/water pop-ups,
// speech bubbles with name personalization, and AI agent thinking/hop reactions.
import type { InputState } from '../main/input-state.ts'
import type { Settings } from '../main/settings.ts'
import { BREATH_DY, createIdleAnim, idleFrame, tickIdle } from './idle.ts'
import {
  createTypingAnim,
  isNewStrike,
  strike,
  tickTyping,
  typingFrame,
  TYPING_POSE_DY,
} from './typing.ts'
import { expressionFrame, selectPose, type Expression } from './pose.ts'
import {
  createSteamAnim,
  OVERHEAT_KPS,
  steamAlpha,
  steamFrameIndex,
  tickSteam,
} from './steam.ts'
import {
  createSleepAnim,
  createZzzAnim,
  fallAsleep,
  SLEEP_AFTER_MS,
  sleepFrame,
  startWake,
  tickSleep,
  tickZzz,
  zzzGlyphs,
} from './sleep.ts'
import { createPupilOffset, getEyeAnchors, pupilTarget, tickPupils } from './eyes.ts'
import { FRAME_SIZE, layoutFor, type SizeOption } from '../main/sizes.ts'
import type { SkinOption } from '../main/skins.ts'
import { configureSound, playEvolution, playHappyHop, playPurr, playReminderChime, playStretchSlide, playWaterBubble } from './sound.ts'
import { createPettingState, getHeadBounds, isInsideHead, tickPetting } from './petting.ts'
import { createParticleSystem, drawParticles, emitBubble, emitHeart, emitStar, tickParticles } from './particles.ts'
import { createSpeechBubble, drawSpeechBubble, showSpeechBubble, tickSpeechBubble } from './speech-bubble.ts'
import { createTimerBadgeState, drawTimerBadge, skipPomodoroPhase, startPomodoro, stopPomodoro, tickTimerBadge, togglePausePomodoro } from './timer-badge.ts'
import { createGrowAnimState, dismissGrowAnim, tickGrowAnim, triggerGrowAnim } from './grow-anim.ts'
import { createEvolutionAnim, dismissEvolution, evolutionActive, evolutionAlpha, evolutionFrame, tickEvolution, triggerEvolution } from './evolution.ts'
import { createDrag, DIZZY_BUBBLE_TEXT, dizzyBubble, dragFrame, dragTransform, springLimits, tickDrag } from './drag.ts'
import {
  createAgentAnimState,
  drawThoughtBubble,
  handleAgentPayload,
  THINKING_PUPIL_OFFSET,
  tickAgentAnim,
} from './agent-anim.ts'

import agumonIdleSheetUrl from '../../assets/sprites/agumon/idle.png'
import agumonTypingSheetUrl from '../../assets/sprites/agumon/typing.png'
import agumonOverheatSheetUrl from '../../assets/sprites/agumon/overheat.png'
import agumonSleepTransitionSheetUrl from '../../assets/sprites/agumon/sleep-transition.png'
import agumonSleepSheetUrl from '../../assets/sprites/agumon/sleep.png'
import agumonPupilsSheetUrl from '../../assets/sprites/agumon/pupils.png'
import agumonHappySheetUrl from '../../assets/sprites/agumon/happy.png'
import agumonLaughSheetUrl from '../../assets/sprites/agumon/laugh.png'
import agumonConfusedSheetUrl from '../../assets/sprites/agumon/confused.png'
import agumonDragSheetUrl from '../../assets/sprites/agumon/drag.png'
import agumonEvolution0Url from '../../assets/sprites/agumon/evolution-0.png'
import agumonEvolution1Url from '../../assets/sprites/agumon/evolution-1.png'
import agumonEvolution2Url from '../../assets/sprites/agumon/evolution-2.png'
import agumonEvolution3Url from '../../assets/sprites/agumon/evolution-3.png'
import agumonEvolution4Url from '../../assets/sprites/agumon/evolution-4.png'
import agumonEvolution5Url from '../../assets/sprites/agumon/evolution-5.png'
import agumonEvolution6Url from '../../assets/sprites/agumon/evolution-6.png'
import agumonEvolution7Url from '../../assets/sprites/agumon/evolution-7.png'
import agumonEvolution8Url from '../../assets/sprites/agumon/evolution-8.png'
import steamSheetUrl from '../../assets/sprites/steam.png'

// ponytail: drag sheets are sliced at 1x and the art draws ~0.7x idle, so one
// scale fits agumon only; make it per-skin (or re-slice larger) when another skin gets drag art.
const DRAG_SHEET_SCALE = 1.35
// Scaled drag art (head top y=9) fills the headroom at this stretch on every size tier.
const DRAG_SHEET_MAX_STRETCH = 1.15

function loadSheet(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`sprite sheet failed to load: ${url}`))
    img.src = url
  })
}

export async function start(canvas: HTMLCanvasElement): Promise<void> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  const idle = createIdleAnim()
  const typing = createTypingAnim()
  const steam = createSteamAnim()
  const sleep = createSleepAnim()
  const zzz = createZzzAnim()
  const pupils = createPupilOffset()

  // Tamagotchi subsystems
  const petting = createPettingState()
  const particles = createParticleSystem()
  const speechBubble = createSpeechBubble()
  const timerBadge = createTimerBadgeState()
  const grow = createGrowAnimState()
  const evolution = createEvolutionAnim()
  const agentAnim = createAgentAnimState()
  const drag = createDrag()

  let userSettings: Settings | null = null
  let userName = ''

  let input: InputState | null = null
  let lastActivityAt = 0
  let size: SizeOption = 'normal'
  let skin: SkinOption = 'agumon'
  let evolutionWasActive = false

  // Custom pointer drag (ADR 0002). The draw box refreshes every frame; the
  // gesture below reads it to decide whether a press lands on the sprite.
  let dragBox = { x: 0, y: 0, size: 0 }
  let dragPointerId: number | null = null
  let dragStartX = 0
  let dragStartY = 0
  let dragActive = false

  /** Stretch reminder: Agumon evolves, every other skin keeps the in-place grow. */
  const triggerStretch = (): void => {
    if (skin === 'agumon') {
      triggerEvolution(evolution)
      window.wanwan?.beginEvolution?.()
      playEvolution()
    } else {
      triggerGrowAnim(grow, 'stretch')
      playStretchSlide()
    }
  }

  // Timers for periodic stretch / water checks
  let lastStretchCheckAt = performance.now()
  let lastWaterCheckAt = performance.now()
  let lastReminderMinute = ''

  const badgeHitbox = document.getElementById('badge-hitbox')
  const headHitbox = document.getElementById('head-hitbox')

  // Hitbox interactions
  badgeHitbox?.addEventListener('click', () => {
    togglePausePomodoro(timerBadge)
  })
  badgeHitbox?.addEventListener('dblclick', () => {
    skipPomodoroPhase(timerBadge, (mode) => {
      const salutation = userName ? `, ${userName}` : ''
      if (mode === 'break') {
        playHappyHop()
        showSpeechBubble(speechBubble, `Focus done${salutation}! Break time! ☕`)
      } else {
        playReminderChime()
        showSpeechBubble(speechBubble, `Break over${salutation}! Let's focus! 🍅`)
      }
    })
  })

  // Double click pet to open Companion Hub
  canvas.addEventListener('dblclick', () => {
    window.wanwan?.openCompanionHub?.()
  })

  // Click while growing dismisses the pop-up early
  canvas.addEventListener('click', () => {
    if (grow.phase === 'growing' || grow.phase === 'holding') {
      dismissGrowAnim(grow)
    } else if (evolutionActive(evolution)) {
      dismissEvolution(evolution)
    }
  })

  // Custom pointer drag: press inside the draw box → capture; >4px → beginDrag.
  const endPointerDrag = (): void => {
    if (dragPointerId === null) return
    const id = dragPointerId
    dragPointerId = null
    // pointerup already auto-releases capture; releasePointerCapture would throw.
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
    if (dragActive) {
      dragActive = false
      canvas.style.cursor = ''
      if (headHitbox) headHitbox.style.cursor = 'grab'
      window.wanwan?.endDrag?.()
    }
  }
  const beginPointerDrag = (e: PointerEvent): void => {
    if (e.button !== 0) return
    if (dragPointerId !== null) return
    if (
      e.clientX < dragBox.x ||
      e.clientX > dragBox.x + dragBox.size ||
      e.clientY < dragBox.y ||
      e.clientY > dragBox.y + dragBox.size
    ) {
      return
    }
    dragPointerId = e.pointerId
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragActive = false
    canvas.setPointerCapture(e.pointerId)
  }
  canvas.addEventListener('pointerdown', beginPointerDrag)
  // The head hitbox sits above the canvas (grab cursor); forward its presses.
  headHitbox?.addEventListener('pointerdown', beginPointerDrag)
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointerId) return
    if (dragActive) return
    if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) <= 4) return
    if (evolutionActive(evolution)) return
    dragActive = true
    canvas.style.cursor = 'grabbing'
    if (headHitbox) headHitbox.style.cursor = 'grabbing'
    if (sleep.phase !== null) startWake(sleep)
    window.wanwan?.beginDrag?.(Math.round(dragStartX), Math.round(dragStartY))
  })
  canvas.addEventListener('pointerup', endPointerDrag)
  canvas.addEventListener('pointercancel', endPointerDrag)
  canvas.addEventListener('lostpointercapture', endPointerDrag)

  // IPC subscriptions
  window.wanwan?.onSizeChange?.((next) => {
    size = next
  })
  window.wanwan?.onSkinChange?.((next) => {
    skin = next
  })
  window.wanwan?.onSettingsChanged?.((updated) => {
    userSettings = updated
    userName = updated.userName || ''
    configureSound({ enabled: updated.soundEnabled, volume: updated.soundVolume })

    if (updated.pomodoro?.enabled && timerBadge.mode === 'idle') {
      startPomodoro(timerBadge, updated.pomodoro.focusMinutes, updated.pomodoro.breakMinutes)
    } else if (!updated.pomodoro?.enabled && timerBadge.mode !== 'idle') {
      stopPomodoro(timerBadge)
    }
  })

  window.wanwan?.onAiStatus?.((payload) => {
    handleAgentPayload(agentAnim, payload, () => {
      // AI done callback
      playHappyHop()
      const salutation = userName ? `, ${userName}` : ''
      const msg = payload.message || `AI task completed${salutation}! 🎉`
      showSpeechBubble(speechBubble, msg, 4000)
    })
  })

  window.wanwan?.onTriggerAction?.((action, payload) => {
    const salutation = userName ? `, ${userName}` : ''
    switch (action) {
      case 'test-sound':
        playHappyHop()
        break
      case 'test-stretch':
        triggerStretch()
        showSpeechBubble(speechBubble, `Time to stretch${salutation}! 🧘`)
        break
      case 'test-water':
        triggerGrowAnim(grow, 'water')
        playWaterBubble()
        emitBubble(particles, canvas.clientWidth / 2, canvas.clientHeight / 2)
        showSpeechBubble(speechBubble, `Stay hydrated${salutation}! 💧`)
        break
      case 'test-reminder': {
        playReminderChime()
        const text = typeof payload === 'string' && payload ? payload : 'Reminder!'
        showSpeechBubble(speechBubble, `${salutation ? userName + ': ' : ''}${text} ⏰`)
        break
      }
      case 'start-pomodoro': {
        const opts = payload as { focus: number; break: number } | undefined
        startPomodoro(timerBadge, opts?.focus ?? 25, opts?.break ?? 5)
        playReminderChime()
        showSpeechBubble(speechBubble, `Focus session started${salutation}! 🍅`)
        break
      }
      case 'stop-pomodoro':
        stopPomodoro(timerBadge)
        showSpeechBubble(speechBubble, `Pomodoro stopped.`)
        break
      case 'test-ai-thinking':
        handleAgentPayload(agentAnim, { status: 'thinking', agent: 'test-agent' })
        break
      case 'test-ai-done':
        handleAgentPayload(agentAnim, { status: 'done', agent: 'test-agent' }, () => {
          playHappyHop()
          showSpeechBubble(speechBubble, `Task completed${salutation}! 🎉`)
        })
        break
      case 'test-ai-idle':
        handleAgentPayload(agentAnim, { status: 'idle' })
        break
    }
  })

  window.wanwan?.onStateUpdate?.((next) => {
    const now = performance.now()
    if (isNewStrike(input, next)) {
      strike(typing, next.lastKeyside)
      if (sleep.phase !== null) startWake(sleep)
    }
    if (
      input === null ||
      next.keySeq !== input.keySeq ||
      next.cursorX !== input.cursorX ||
      next.cursorY !== input.cursorY
    ) {
      lastActivityAt = now
    }
    input = next
  })

  // Load initial settings
  window.wanwan?.getSettings?.()?.then((loaded) => {
    if (loaded) {
      userSettings = loaded
      userName = loaded.userName || ''
      configureSound({ enabled: loaded.soundEnabled, volume: loaded.soundVolume })
    }
  })

  interface SheetSet {
    idle: HTMLImageElement
    typing: HTMLImageElement
    overheat: HTMLImageElement
    sleepTransition: HTMLImageElement
    sleep: HTMLImageElement
    pupils: HTMLImageElement
    /** Optional per-skin Expression Sheets; missing ones fall back to base poses. */
    expressions: Partial<Record<Expression, HTMLImageElement>>
    /** Optional Drag Frames (issue 17); skins without them draw idle frame 0. */
    drag?: HTMLImageElement
  }
  const loadSet = (
    idleUrl: string,
    typingUrl: string,
    overheatUrl: string,
    sleepTransitionUrl: string,
    sleepUrl: string,
    pupilsUrl: string,
    expressionUrls: Partial<Record<Expression, string>> = {},
  ): Promise<SheetSet> =>
    Promise.all([
      Promise.all(
        Object.entries(expressionUrls).map(async ([k, url]) => [k, await loadSheet(url)] as const),
      ).then((entries) => Object.fromEntries(entries) as SheetSet['expressions']),
      loadSheet(idleUrl),
      loadSheet(typingUrl),
      loadSheet(overheatUrl),
      loadSheet(sleepTransitionUrl),
      loadSheet(sleepUrl),
      loadSheet(pupilsUrl),
    ]).then(([expressions, idle, typing, overheat, sleepTransition, sleep, pupils]) => ({
      expressions,
      idle,
      typing,
      overheat,
      sleepTransition,
      sleep,
      pupils,
    }))

  const [agumonSet, steamSheet, evolutionSheet] = await Promise.all([
    loadSet(
      agumonIdleSheetUrl,
      agumonTypingSheetUrl,
      agumonOverheatSheetUrl,
      agumonSleepTransitionSheetUrl,
      agumonSleepSheetUrl,
      agumonPupilsSheetUrl,
      { happy: agumonHappySheetUrl, laugh: agumonLaughSheetUrl, confused: agumonConfusedSheetUrl },
    ).then(async (s) => ({ ...s, drag: await loadSheet(agumonDragSheetUrl) })),
    loadSheet(steamSheetUrl),
    // Assemble 9 individual evolution frames into a horizontal strip canvas.
    Promise.all([
      agumonEvolution0Url, agumonEvolution1Url, agumonEvolution2Url,
      agumonEvolution3Url, agumonEvolution4Url, agumonEvolution5Url,
      agumonEvolution6Url, agumonEvolution7Url, agumonEvolution8Url,
    ].map(loadSheet)).then(imgs => {
      const c = document.createElement('canvas')
      c.width = 256 * 9; c.height = 256
      const cx = c.getContext('2d')!
      imgs.forEach((img, i) => cx.drawImage(img, i * 256, 0))
      return c
    }),
  ])
  const sheets: Record<SkinOption, SheetSet> = {
    agumon: agumonSet,
  }

  const dpr = window.devicePixelRatio || 1
  let cssW = 0
  let cssH = 0
  const measure = (): void => {
    cssW = canvas.clientWidth
    cssH = canvas.clientHeight
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  measure()
  window.addEventListener('resize', measure)

  let last = performance.now()

  const render = (now: number): void => {
    const dt = now - last
    last = now

    const isTyping = (input?.kps ?? 0) > 0
    const overheated = (input?.kps ?? 0) >= OVERHEAT_KPS

    // Inactivity sleep
    if (sleep.phase === null && input !== null && now - lastActivityAt >= SLEEP_AFTER_MS) {
      fallAsleep(sleep)
    }

    // Tick base animation models
    tickIdle(idle, dt)
    tickTyping(typing, dt)
    tickSteam(steam, dt, overheated)
    tickSleep(sleep, dt)
    if (sleep.phase === 'loop') tickZzz(zzz, dt)

    // Layout
    const { scale, drawSize, headroom } = layoutFor(size)
    const drawX = Math.round((cssW - drawSize) / 2)
    const drawY = Math.max(headroom, cssH - drawSize)
    // Keep the drag gesture's target box in sync with what is drawn.
    dragBox = { x: drawX, y: drawY, size: drawSize }

    // Head bounds for petting
    const headBounds = getHeadBounds(drawX, drawY, drawSize, scale)

    // Cursor position relative to this canvas
    const localCursorX = (input?.cursorX ?? 0) - window.screenX
    const localCursorY = (input?.cursorY ?? 0) - window.screenY

    // Mochi Drag (issue 16): feed the cursor snapshot into the phase/spring
    // state machine. `dragActive` is the renderer's held signal; release drives
    // fall → squash → dizzy → idle. Velocity comes from the SCREEN cursor, not
    // the window-relative position: main follows the cursor, so `cursor - window`
    // is the (constant) grab offset while the screen cursor itself carries the
    // real drag speed.
    const limits = springLimits(size)
    const entered = tickDrag(drag, {
      held: dragActive,
      cursorX: input?.cursorX ?? 0,
      cursorY: input?.cursorY ?? 0,
      dtMs: dt,
      maxStretch: sheets[skin].drag ? Math.min(limits.maxStretch, DRAG_SHEET_MAX_STRETCH) : limits.maxStretch,
      minSquash: limits.minSquash,
    })
    // Landing cues (issue 18): lift is silent; the landing splats.
    if (entered === 'squash') playWaterBubble()
    else if (entered === 'dizzy' && dizzyBubble(drag.shook, userName)) {
      showSpeechBubble(speechBubble, DIZZY_BUBBLE_TEXT, 2000)
    }

    // Tick petting detector (paused for the whole drag sequence: a held or
    // landing pet is not being petted).
    if (drag.phase === 'idle') {
      tickPetting(petting, localCursorX, localCursorY, headBounds, dt, now, () => {
        playPurr()
        emitHeart(particles, localCursorX, localCursorY - 10)
        if (sleep.phase !== null) startWake(sleep)
        if (userName && Math.random() < 0.3) {
          showSpeechBubble(speechBubble, `*purrrr* ❤️`, 2000)
        }
      })

      if (petting.isPetting && Math.random() < 0.12) {
        emitHeart(particles, localCursorX + (Math.random() - 0.5) * 16, localCursorY - 8)
      }
    }

    // Position no-drag interactive overlay hitboxes
    if (headHitbox) {
      headHitbox.style.display = 'block'
      headHitbox.style.left = `${headBounds.minX}px`
      headHitbox.style.top = `${headBounds.minY}px`
      headHitbox.style.width = `${headBounds.maxX - headBounds.minX}px`
      headHitbox.style.height = `${headBounds.maxY - headBounds.minY}px`
    }

    // Tick Pomodoro badge
    tickTimerBadge(timerBadge, dt, (completedMode) => {
      const salutation = userName ? `, ${userName}` : ''
      if (completedMode === 'focus') {
        playHappyHop()
        showSpeechBubble(speechBubble, `Great focus${salutation}! Time for break! ☕`, 5000)
      } else {
        playReminderChime()
        showSpeechBubble(speechBubble, `Break finished${salutation}! Ready to focus? 🍅`, 5000)
      }
    })

    if (badgeHitbox) {
      if (timerBadge.mode !== 'idle') {
        badgeHitbox.style.display = 'block'
        badgeHitbox.style.left = `${timerBadge.bounds.x}px`
        badgeHitbox.style.top = `${timerBadge.bounds.y}px`
        badgeHitbox.style.width = `${timerBadge.bounds.w}px`
        badgeHitbox.style.height = `${timerBadge.bounds.h}px`
      } else {
        badgeHitbox.style.display = 'none'
      }
    }

    // Tick grow and AI animations
    tickGrowAnim(grow, dt)
    tickEvolution(evolution, dt)
    tickAgentAnim(agentAnim, dt)
    tickSpeechBubble(speechBubble, dt)
    tickParticles(particles, dt)

    // Restore the window once the evolution fade completes.
    if (evolutionWasActive && !evolutionActive(evolution)) {
      window.wanwan?.endEvolution?.()
    }
    evolutionWasActive = evolutionActive(evolution)

    // Periodic stretch check
    if (userSettings?.stretch?.enabled) {
      const intervalMs = (userSettings.stretch.intervalMinutes || 45) * 60 * 1000
      if (now - lastStretchCheckAt >= intervalMs) {
        lastStretchCheckAt = now
        triggerStretch()
        showSpeechBubble(speechBubble, `Time to stretch${userName ? ', ' + userName : ''}! 🧘`)
      }
    }

    // Periodic drink water check
    if (userSettings?.water?.enabled) {
      const intervalMs = (userSettings.water.intervalMinutes || 60) * 60 * 1000
      if (now - lastWaterCheckAt >= intervalMs) {
        lastWaterCheckAt = now
        triggerGrowAnim(grow, 'water')
        playWaterBubble()
        emitBubble(particles, drawX + drawSize / 2, drawY + drawSize / 2)
        showSpeechBubble(speechBubble, `Stay hydrated${userName ? ', ' + userName : ''}! 💧`)
      }
    }

    // Periodic custom reminders check
    if (userSettings?.reminders && userSettings.reminders.length > 0) {
      const d = new Date()
      const currentHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      if (currentHHMM !== lastReminderMinute) {
        lastReminderMinute = currentHHMM
        for (const rem of userSettings.reminders) {
          if (rem.enabled && rem.time === currentHHMM) {
            playReminderChime()
            showSpeechBubble(speechBubble, `${userName ? userName + ': ' : ''}${rem.message} ⏰`)
            break
          }
        }
      }
    }

    // Clear buffer
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.imageSmoothingEnabled = false

    // Evolution cutscene: transparent bg (assets are pre-cut), full-window frame.
    if (evolutionActive(evolution)) {
      const frame = evolutionFrame(evolution)
      const fx = evolution.glitchX + evolution.shakeX
      const fy = evolution.shakeY
      const side = Math.min(cssW, cssH)
      const dx = Math.round((cssW - side) / 2) + fx
      const dy = Math.round((cssH - side) / 2) + fy
      ctx.globalAlpha = evolutionAlpha(evolution)
      ctx.drawImage(
        evolutionSheet,
        frame * 256,
        0,
        256,
        256,
        dx,
        dy,
        side,
        side,
      )
      ctx.globalAlpha = 1
      // Stretch reminder bubble, anchored above the (unshaken) frame so it stays steady.
      drawSpeechBubble(ctx, speechBubble, cssW / 2, Math.round((cssH - side) / 2) + 8, cssW)
      requestAnimationFrame(render)
      return
    }

    // Character pose selection. A drag overrides the typing/overheat pose (steam
    // still runs — tickSteam above is driven by `overheated`, not the pose).
    const skinSet = sheets[skin]
    const dragging = drag.phase !== 'idle'
    const pose = selectPose({
      sleepPhase: sleep.phase,
      isTyping: dragging ? false : isTyping,
      overheated: dragging ? false : overheated,
      isPetting: dragging ? false : petting.isPetting,
      agentStatus: agentAnim.status,
      expressions: new Set(Object.keys(skinSet.expressions) as Expression[]),
    })
    let sheet: HTMLImageElement
    let frame: number
    let isExpression = false
    if (dragging) {
      // Drag Frames (issue 17) map logical→sheet frame = logical - 2; skins
      // without a drag sheet fall back to idle frame 0 under the same spring.
      sheet = skinSet.drag ?? skinSet.idle
      frame = skinSet.drag ? dragFrame(drag) - 2 : 0
    } else if (pose === 'sleepTransition' || pose === 'sleep') {
      sheet = skinSet[pose]
      frame = sleepFrame(sleep)
    } else if (pose === 'overheat' || pose === 'typing') {
      sheet = skinSet[pose]
      frame = typingFrame(typing)
    } else if (pose === 'idle') {
      sheet = skinSet.idle
      frame = idleFrame(idle)
    } else {
      // selectPose only returns an expression the skin has
      sheet = skinSet.expressions[pose]!
      frame = expressionFrame(now)
      isExpression = true
    }

    // Character drawing with in-place grow and hop offset
    ctx.save()
    const hopY = agentAnim.hopActive ? agentAnim.hopDy : 0
    if (grow.phase !== 'idle') {
      const anchorX = drawX + drawSize / 2
      const anchorY = drawY + drawSize
      ctx.translate(anchorX, anchorY)
      ctx.scale(grow.scaleX, grow.scaleY)
      ctx.translate(-anchorX, -anchorY)
    }

    // Mochi Drag jelly: stretch/squash + lean about the bottom-center anchor.
    // `dragTransform` is identity (scaleX=stretchY=1, lean=0, drop=0) while idle,
    // so the save/translate/scale/restore is a no-op cost on the non-drag path.
    if (dragging) {
      const t = dragTransform(drag)
      const anchorX = drawX + drawSize / 2
      const anchorY = drawY + drawSize
      ctx.translate(anchorX, anchorY + t.dropPx)
      ctx.rotate(t.leanRad)
      ctx.scale(t.scaleX, t.stretchY)
      if (skinSet.drag) ctx.scale(DRAG_SHEET_SCALE, DRAG_SHEET_SCALE)
      ctx.translate(-anchorX, -anchorY)
    }

    ctx.drawImage(
      sheet,
      frame * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      drawX,
      drawY + hopY,
      drawSize,
      drawSize,
    )

    // Pupils Layer: only when eyes open, not asleep, not overheated, and not in purring squint!
    const isPurringSquint = petting.isPetting
    if (
      !dragging &&
      sleep.phase === null &&
      !overheated &&
      !isPurringSquint &&
      !isExpression &&
      idle.blinkElapsed === null &&
      input !== null
    ) {
      // If AI agent is thinking, gaze is directed upward thoughtfully!
      const target = agentAnim.status === 'thinking'
        ? THINKING_PUPIL_OFFSET
        : pupilTarget(
          input.cursorX,
          input.cursorY,
          window.screenX,
          window.screenY,
          cssW,
          cssH,
        )

      tickPupils(pupils, target, dt)
      const poseDy = isTyping ? TYPING_POSE_DY : BREATH_DY[idle.breathIndex]
      for (const [ex, ey] of getEyeAnchors(skin)) {
        ctx.drawImage(
          skinSet.pupils,
          0,
          0,
          FRAME_SIZE,
          FRAME_SIZE,
          drawX + (ex + pupils.x) * scale - drawSize / 2,
          drawY + hopY + (ey + poseDy + pupils.y) * scale - drawSize / 2,
          drawSize,
          drawSize,
        )
      }
    }

    // Overheat steam
    for (const p of steam.particles) {
      ctx.globalAlpha = steamAlpha(p)
      ctx.drawImage(
        steamSheet,
        steamFrameIndex(p) * FRAME_SIZE,
        0,
        FRAME_SIZE,
        FRAME_SIZE,
        drawX + p.x * scale - drawSize / 2,
        drawY + hopY + p.y * scale - drawSize / 2,
        drawSize,
        drawSize,
      )
    }

    // Sleep Zzz
    if (sleep.phase === 'loop') {
      ctx.fillStyle = '#e6e6ec'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const g of zzzGlyphs(zzz)) {
        ctx.globalAlpha = g.alpha
        ctx.font = `bold ${Math.round(g.size * scale)}px ui-monospace, monospace`
        ctx.fillText('Z', drawX + g.x * scale, drawY + hopY + g.y * scale)
      }
    }

    ctx.restore()

    // Draw thought cloud when AI is thinking
    if (agentAnim.status === 'thinking') {
      drawThoughtBubble(ctx, agentAnim, drawX + drawSize / 2, drawY + 8 * scale)
    }

    // Draw floating pixel particles (hearts, stars, bubbles)
    drawParticles(ctx, particles, scale)

    // Draw Pomodoro floating pixel badge
    if (timerBadge.mode !== 'idle') {
      drawTimerBadge(ctx, timerBadge, drawX + drawSize / 2, drawY - 2)
    }

    // Draw speech bubble (greetings, reminders, purrs)
    drawSpeechBubble(ctx, speechBubble, drawX + drawSize / 2, drawY + 8 * scale, cssW)

    ctx.globalAlpha = 1

    requestAnimationFrame(render)
  }

  requestAnimationFrame(render)
}
