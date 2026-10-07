// Lightweight pixel particle engine for floating hearts, stars, and droplets.

export type ParticleKind = 'heart' | 'star' | 'bubble'

export interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  alpha: number
  scale: number
  ageMs: number
  lifetimeMs: number
  color: string
}

export interface ParticleSystem {
  particles: Particle[]
}

export function createParticleSystem(): ParticleSystem {
  return { particles: [] }
}

export function emitHeart(sys: ParticleSystem, x: number, y: number): void {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8
  const speed = 25 + Math.random() * 20
  sys.particles.push({
    kind: 'heart',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: 1,
    scale: 1 + Math.random() * 0.4,
    ageMs: 0,
    lifetimeMs: 1200 + Math.random() * 400,
    color: Math.random() > 0.3 ? '#ff4d6d' : '#ff758f',
  })
}

export function emitStar(sys: ParticleSystem, x: number, y: number): void {
  const angle = Math.random() * Math.PI * 2
  const speed = 40 + Math.random() * 35
  sys.particles.push({
    kind: 'star',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 15,
    alpha: 1,
    scale: 1 + Math.random() * 0.5,
    ageMs: 0,
    lifetimeMs: 800 + Math.random() * 300,
    color: Math.random() > 0.4 ? '#ffd166' : '#06d6a0',
  })
}

export function emitBubble(sys: ParticleSystem, x: number, y: number): void {
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5
  const speed = 30 + Math.random() * 20
  sys.particles.push({
    kind: 'bubble',
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    alpha: 0.9,
    scale: 0.8 + Math.random() * 0.4,
    ageMs: 0,
    lifetimeMs: 1000 + Math.random() * 400,
    color: '#4cc9f0',
  })
}

export function tickParticles(sys: ParticleSystem, dtMs: number): void {
  const dtSec = dtMs / 1000
  for (let i = sys.particles.length - 1; i >= 0; i--) {
    const p = sys.particles[i]
    p.ageMs += dtMs
    if (p.ageMs >= p.lifetimeMs) {
      sys.particles.splice(i, 1)
      continue
    }
    p.x += p.vx * dtSec
    p.y += p.vy * dtSec
    // Gentle floating oscillation
    p.x += Math.sin(p.ageMs * 0.008) * 0.3

    const progress = p.ageMs / p.lifetimeMs
    p.alpha = 1 - progress * progress
  }
}

/** Draws pixel-art shaped particles */
export function drawParticles(ctx: CanvasRenderingContext2D, sys: ParticleSystem, scale: number): void {
  for (const p of sys.particles) {
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha))
    ctx.fillStyle = p.color

    const px = Math.round(p.x)
    const py = Math.round(p.y)
    const s = Math.max(1, Math.round(scale * p.scale))

    if (p.kind === 'heart') {
      // 5x5 pixel heart
      //  # #
      // #####
      // #####
      //  ###
      //   #
      drawPixel(ctx, px - 2 * s, py - 2 * s, s)
      drawPixel(ctx, px, py - 2 * s, s)
      drawPixel(ctx, px - 3 * s, py - s, 5 * s, s)
      drawPixel(ctx, px - 3 * s, py, 5 * s, s)
      drawPixel(ctx, px - 2 * s, py + s, 3 * s, s)
      drawPixel(ctx, px - s, py + 2 * s, s)
    } else if (p.kind === 'star') {
      // 4-point sparkle star
      drawPixel(ctx, px - s, py - 2 * s, s)
      drawPixel(ctx, px - 2 * s, py - s, 3 * s, s)
      drawPixel(ctx, px - s, py, s)
      drawPixel(ctx, px - s, py - 3 * s, s, 3 * s)
    } else {
      // Small 4x4 bubble
      drawPixel(ctx, px - s, py - s, 2 * s, 2 * s)
    }
    ctx.restore()
  }
}

function drawPixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h?: number,
): void {
  ctx.fillRect(x, y, w, h ?? w)
}
