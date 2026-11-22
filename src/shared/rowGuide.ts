/** Guide + copy-paste AI prompt for drawing one animation row (strip) per state. */
import { defaultTiming } from "./strip";
import { STATE_LABELS, type PetState } from "./types";

export const ROW_POSES: Record<PetState, string> = {
  idle: "standing still, gentle breathing: the body rises and sinks slightly",
  blink: "standing still, eyes open, half closed, closed, open again",
  walk: "walk cycle to the right, legs alternating, slight body bob",
  run: "fast run cycle to the right, body stretched long, legs fully extended",
  sit: "sitting calmly, small breathing or tail movement",
  sleep: "curled up lying down asleep, eyes closed, slow breathing",
  look: "standing, turning the head to look around curiously",
  typing: "sitting, tapping and kneading with the front paws as if typing on a keyboard",
  jump: "jump in order: crouch, take off, mid-air, land",
  happy: "happy bounce with a big smile and small hearts around",
  thinking: "sitting, paw on chin, thinking, small thought dots above the head",
  drag: "being lifted up by the scruff, body dangling, legs hanging down, surprised face",
  drop: "landing on the ground with a squash, then recovering",
  error: "worried, sweat drop, ears down, shaking slightly",
  groom: "licking a front paw and washing the face",
  stretch: "big full-body stretch: front legs forward, back raised, then standing tall",
  yawn: "big yawn with the mouth wide open and squinting eyes",
  wiggle: "crouched low, wiggling the hips, ready to pounce",
  scroll: "sitting, rolling a long paper scroll with the front paws",
  peek: "crouching low, peeking curiously with big eyes",
};

export const ROW_BG = {
  green: { hex: "#00FF00", name: "pure green" },
  magenta: { hex: "#FF00FF", name: "pure magenta" },
} as const;

export interface RowPromptOpts {
  character: string;
  state: PetState;
  frames: number;
  /** Square frame cell size in px. */
  cell: number;
  bg: keyof typeof ROW_BG;
  pixel: boolean;
}

export function rowPrompt(o: RowPromptOpts): string {
  const n = Math.max(1, Math.round(o.frames)), cell = o.cell, bg = ROW_BG[o.bg];
  const loop = defaultTiming(o.state).loop ? "The frames form a smooth seamless loop." : "The frames play once, in order.";
  const ref = o.state === "idle" ? "" : " Match the character in the attached reference image exactly.";
  const style = o.pixel
    ? `cute pixel art, drawn as a ${Math.round(cell / 4)}×${Math.round(cell / 4)} px sprite and upscaled exactly 4× with nearest-neighbor, crisp hard square pixels, no anti-aliasing, no blur, limited palette, dark 1-pixel outline`
    : "cute clean 2D cartoon, bold dark outline, flat cel shading, no soft glow";
  return [
    "Create a 2D game sprite strip for a desktop pet.",
    "",
    `Layout: ONE single horizontal row of exactly ${n} animation frames, left to right, nothing else in the image. Image size ${n * cell}×${cell} px (aspect ratio ${n}:1). Each frame is a ${cell}×${cell} px square cell. The character is centered in its cell with about 15% empty background on every side; frames never touch or overlap each other or the image edge.`,
    "",
    `Animation (${STATE_LABELS[o.state]}): ${ROW_POSES[o.state]}. ${loop}`,
    "",
    `Character: ${o.character.trim() || "a cute chubby french bulldog"}. Identical design, colors, proportions and size in every frame. Full body visible, facing right, feet on the same baseline in every frame.${ref}`,
    "",
    `Background: perfectly flat solid ${bg.name} ${bg.hex} chroma-key background. No gradient, no shadow, no ground, no glow, no texture, no noise. Do not use ${bg.name} anywhere on the character.`,
    "",
    `Style: ${style}. No text, no labels, no numbers, no grid lines, no frame borders, no watermark.`,
  ].join("\n");
}
