import type { AnimationDef, PetState, SpriteConfig } from "../shared/types";
import { STATES } from "../shared/types";

export interface ResolvedAnim {
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
}

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.min(max, Math.max(min, n));
};

/** Validate/repair untrusted sprite JSON. Throws only when nothing usable can be built. */
export function normalizeConfig(raw: unknown): SpriteConfig {
  const r = (raw ?? {}) as Record<string, any>;
  const frameWidth = Math.round(num(r.frameWidth, 32, 1, 4096));
  const frameHeight = Math.round(num(r.frameHeight, 32, 1, 4096));
  const animations: Record<string, AnimationDef> = {};
  for (const [name, a] of Object.entries((r.animations ?? {}) as Record<string, any>)) {
    if (!a || typeof a !== "object" || name.length > 40) continue;
    const def: AnimationDef = { fps: num(a.fps, 6, 0.5, 60), loop: a.loop !== false };
    if (Array.isArray(a.frames) && a.frames.length) {
      def.frames = a.frames.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0).slice(0, 256);
      if (!def.frames!.length) continue;
    } else {
      def.start = Math.round(num(a.start, 0, 0, 100000));
      def.count = Math.round(num(a.count, 1, 1, 256));
    }
    animations[name] = def;
  }
  if (!Object.keys(animations).length) animations.idle = { start: 0, count: 1, fps: 4, loop: true };
  const states: SpriteConfig["states"] = {};
  for (const s of STATES) {
    const target = r.states?.[s];
    if (typeof target === "string" && animations[target]) states[s] = target;
  }
  const renderScale = Math.round(num(r.renderScale, 1, 0.02, 4) * 10000) / 10000;
  const quirks = Array.isArray(r.quirks)
    ? r.quirks.filter((q: unknown) => typeof q === "string" && !!animations[q as string]).slice(0, 16)
    : [];
  return {
    name: String(r.name ?? "Custom").slice(0, 60), frameWidth, frameHeight, animations, states,
    renderScale, smooth: typeof r.smooth === "boolean" ? r.smooth : renderScale < 0.5, quirks,
  };
}

export function resolveAnim(cfg: SpriteConfig, state: string, fpsOverride: number | null): ResolvedAnim | null {
  if (state.startsWith("custom:")) {
    const n = state.slice(7);
    if (!cfg.animations[n]) return null;
    return resolveAnim({ ...cfg, states: { idle: n } }, "idle", fpsOverride);
  }
  const st = state as PetState;
  const name =
    cfg.states[st] ??
    (cfg.animations[state] ? state : undefined) ??
    (state === "blink" ? undefined : cfg.states.idle ?? (cfg.animations.idle ? "idle" : Object.keys(cfg.animations)[0]));
  if (!name || !cfg.animations[name]) return null;
  const a = cfg.animations[name];
  const frames = a.frames ?? Array.from({ length: a.count ?? 1 }, (_, i) => (a.start ?? 0) + i);
  return { name, frames, fps: fpsOverride && fpsOverride > 0 ? fpsOverride : a.fps, loop: a.loop !== false };
}

export function hasAnim(cfg: SpriteConfig, state: string): boolean {
  if (state.startsWith("custom:")) return !!cfg.animations[state.slice(7)];
  return !!(cfg.states[state as PetState] || cfg.animations[state]);
}

/** Auto-split a sheet into one animation per row (row0, row1, ...). */
export function gridAnimations(imgW: number, imgH: number, fw: number, fh: number, fps = 6): Record<string, AnimationDef> {
  const cols = Math.max(1, Math.floor(imgW / fw));
  const rows = Math.max(1, Math.floor(imgH / fh));
  const out: Record<string, AnimationDef> = {};
  for (let r = 0; r < rows; r++) out[`row${r + 1}`] = { start: r * cols, count: cols, fps, loop: true };
  return out;
}

export interface LoadedSprite {
  cfg: SpriteConfig;
  img: HTMLImageElement;
  cols: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image failed to load"));
    img.src = src;
  });
}

export async function buildSprite(rawCfg: unknown, src: string): Promise<LoadedSprite> {
  const img = await loadImage(src);
  const cfg = normalizeConfig(rawCfg);
  return { cfg, img, cols: Math.max(1, Math.floor(img.naturalWidth / cfg.frameWidth)) };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D, sprite: LoadedSprite, frame: number,
  w: number, h: number, flip: boolean,
) {
  const { cfg, img, cols } = sprite;
  const sx = (frame % cols) * cfg.frameWidth;
  const sy = Math.floor(frame / cols) * cfg.frameHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = cfg.smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  if (flip) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  if (sx + cfg.frameWidth <= img.naturalWidth && sy + cfg.frameHeight <= img.naturalHeight) {
    ctx.drawImage(img, sx, sy, cfg.frameWidth, cfg.frameHeight, 0, 0, w, h);
  }
  ctx.restore();
}

export async function loadBuiltinCat(): Promise<LoadedSprite> {
  const cfg = await (await fetch("/characters/cat/sprite.json")).json();
  return buildSprite(cfg, "/characters/cat/sheet.png");
}
