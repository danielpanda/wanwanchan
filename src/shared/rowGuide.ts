/** Guide + copy-paste AI prompt for drawing one animation row (strip) per state. */
import { defaultTiming } from "./strip";
import { STATE_LABELS, type PetState } from "./types";

/**
 * Per state: overall motion plus one pose per frame. The frame list length is the recommended frame
 * count (loop length = frames ÷ fps, so fast states like walk/run get 8).
 */
export const ROW_POSES: Record<PetState, { motion: string; frames: string[] }> = {
  idle: { motion: "standing still, gentle breathing: the body rises and sinks slightly", frames: [
    "standing relaxed, neutral pose, ears relaxed",
    "chest rises slightly, body a tiny bit taller",
    "back to the neutral pose",
    "chest sinks slightly, body a tiny bit lower",
  ] },
  blink: { motion: "standing still and blinking once", frames: [
    "eyes fully open",
    "eyes half closed",
    "eyes fully closed",
    "eyes half open",
  ] },
  walk: { motion: "walk cycle to the right, legs alternating, slight body bob", frames: [
    "right front paw and left back paw forward on the ground, the other two legs pushing back",
    "weight settles down, body at its lowest",
    "left front leg lifts and swings forward under the chest, body rising",
    "body at its highest, left front and right back legs swinging forward",
    "left front paw and right back paw forward on the ground, the other two legs pushing back",
    "weight settles down, body at its lowest",
    "right front leg lifts and swings forward under the chest, body rising",
    "body at its highest, right front and left back legs swinging forward",
  ] },
  run: { motion: "fast gallop to the right, body stretching long and bunching up", frames: [
    "fully stretched in the air: front legs reaching far forward, back legs stretched far back",
    "front paws touch the ground, body still long",
    "front legs pass under the chest, back legs swing forward",
    "bunched up in the air: all four paws tucked under the belly, back rounded",
    "back paws land under the belly",
    "back legs push off hard, front legs start reaching forward, body lengthening",
    "body almost fully stretched, front legs reaching out, head low and forward",
    "back legs leave the ground, ears blown back by speed",
  ] },
  sit: { motion: "sitting calmly, small breathing or tail movement", frames: [
    "sitting upright, front paws together",
    "chest rises slightly, tail curls",
    "back to neutral, tail tip flicks",
    "chest sinks slightly",
  ] },
  sleep: { motion: "curled up lying down asleep, eyes closed, slow breathing", frames: [
    "curled up asleep, eyes closed, chest low",
    "chest rises slightly",
    "chest at its highest, peaceful face",
    "chest lowering again",
  ] },
  look: { motion: "standing, turning the head to look around curiously", frames: [
    "head facing right",
    "head turned toward the viewer, curious eyes",
    "head tilted to one side, one ear raised",
    "head turned toward the viewer again",
  ] },
  typing: { motion: "sitting, tapping with the front paws as if typing on a keyboard (no keyboard drawn)", frames: [
    "left front paw raised, right paw down, focused eyes",
    "both front paws down",
    "right front paw raised, left paw down",
    "both front paws down, tiny satisfied smile",
  ] },
  jump: { motion: "one jump in place: crouch, take off, mid-air, land", frames: [
    "crouching low, legs bent, ears back, ready to spring",
    "pushing off: back legs extending, front paws leaving the ground",
    "rising: body stretched upward, raised higher in the cell, legs trailing",
    "peak mid-air at the top of the cell, legs tucked, happy face",
    "falling: front legs reaching down to land",
    "landing on all four paws with a small squash",
  ] },
  happy: { motion: "happy bounce with a big smile and small hearts around", frames: [
    "standing, big smile, small hearts around",
    "slight crouch with a squash, tail wagging to one side",
    "hopping up off the ground, ears up, hearts floating higher",
    "landing, tail wagging to the other side",
  ] },
  thinking: { motion: "sitting, paw on chin, thinking, small thought dots above the head", frames: [
    "sitting, paw on chin, eyes looking up",
    "one small dot appears above the head",
    "two small dots above the head",
    "three small dots above the head, head tilted",
  ] },
  drag: { motion: "being lifted up by the scruff (no hand visible), body dangling, legs hanging down, surprised face", frames: [
    "dangling, legs hanging straight down, surprised face",
    "legs paddling to the left",
    "dangling, legs kicking slightly",
    "legs paddling to the right",
  ] },
  drop: { motion: "landing on the ground with a squash, then recovering", frames: [
    "just touching the ground, legs reaching down",
    "squashed flat and wide from the impact",
    "bouncing up, stretched tall",
    "back to normal standing, slightly dizzy",
  ] },
  error: { motion: "worried, sweat drop, ears down, shaking slightly", frames: [
    "worried face, ears down, one sweat drop",
    "shaking slightly to the left",
    "worried face, sweat drop larger",
    "shaking slightly to the right",
  ] },
  groom: { motion: "licking a front paw and washing the face", frames: [
    "sitting, raising one front paw",
    "licking the paw, tongue out, eyes closed",
    "wiping the paw over the face",
    "paw lowering, content face",
  ] },
  stretch: { motion: "big full-body stretch: front legs forward, back raised, then standing tall", frames: [
    "standing normally",
    "front legs sliding forward, chest lowering",
    "full stretch: chest down, front legs stretched far forward, rear and tail up, eyes closed",
    "shifting forward, back legs stretching out behind",
    "rising, body straightening",
    "standing tall, satisfied face",
  ] },
  yawn: { motion: "big yawn with the mouth wide open and squinting eyes", frames: [
    "sitting, sleepy eyes",
    "mouth opening, eyes squinting",
    "mouth wide open, eyes closed, head tilted back",
    "mouth closing, drowsy face",
  ] },
  wiggle: { motion: "crouched low, wiggling the hips, ready to pounce", frames: [
    "crouched low, chest down, rear up, hips to the left",
    "hips centered",
    "hips to the right",
    "hips centered, eyes locked on a target",
  ] },
  scroll: { motion: "sitting, unrolling and reading a long paper scroll with the front paws", frames: [
    "sitting, holding a rolled paper scroll with the front paws",
    "the scroll unrolls a little",
    "the scroll unrolled further, reading it",
    "paws rolling the scroll back up",
  ] },
  peek: { motion: "crouching low, peeking curiously with big eyes", frames: [
    "hiding low, only the top of the head and the eyes peeking up",
    "head rising slightly, big curious eyes",
    "head tilted, ears perked",
    "lowering back down",
  ] },
};

/** Two-legged characters: overrides for states where legs, hands or posture differ. */
export const BIPED_POSES: Partial<Record<PetState, { motion: string; frames: string[] }>> = {
  walk: { motion: "upright walk cycle to the right on two legs, arms swinging opposite to the legs, slight body bob", frames: [
    "right foot forward with the heel touching the ground, left leg back, left arm forward",
    "weight on the right leg, knee bent, body at its lowest",
    "left leg lifts and passes the right leg, body rising",
    "body at its highest, left leg swinging forward",
    "left foot forward with the heel touching the ground, right leg back, right arm forward",
    "weight on the left leg, knee bent, body at its lowest",
    "right leg lifts and passes the left leg, body rising",
    "body at its highest, right leg swinging forward",
  ] },
  run: { motion: "fast upright run cycle to the right, leaning forward, arms pumping", frames: [
    "right foot lands under the body, leaning forward, arms pumping",
    "right knee bends to absorb the weight, body at its lowest",
    "right leg pushes off, left knee drives forward and high",
    "both feet off the ground, legs spread front and back",
    "left foot lands under the body",
    "left knee bends to absorb the weight, body at its lowest",
    "left leg pushes off, right knee drives forward and high",
    "both feet off the ground, legs spread front and back, hair or ears blown back",
  ] },
  sit: { motion: "sitting on the ground, legs in front, calm breathing", frames: [
    "sitting on the ground, legs in front, hands resting on the lap",
    "chest rises slightly",
    "back to neutral, small head tilt",
    "chest sinks slightly",
  ] },
  sleep: { motion: "lying curled up on the side asleep, eyes closed, slow breathing", frames: [
    "lying curled up on the side, hands under the cheek, eyes closed, chest low",
    "chest rises slightly",
    "chest at its highest, peaceful face",
    "chest lowering again",
  ] },
  typing: { motion: "sitting, typing with both hands as if on a keyboard (no keyboard drawn)", frames: [
    "left hand raised, right hand down, focused eyes",
    "both hands down",
    "right hand raised, left hand down",
    "both hands down, tiny satisfied smile",
  ] },
  jump: { motion: "one jump in place on two legs: crouch, take off, mid-air, land", frames: [
    "crouching, knees bent, arms swung back, ready to spring",
    "pushing off: legs straightening, arms swinging up, feet leaving the ground",
    "rising: body stretched upward, raised higher in the cell, legs straight",
    "peak mid-air at the top of the cell, knees tucked, both arms up, happy face",
    "falling: legs reaching down to land, arms out for balance",
    "landing on both feet with knees bent and a small squash",
  ] },
  happy: { motion: "happy bounce with a big smile and small hearts around", frames: [
    "standing, big smile, small hearts around",
    "slight crouch with a squash, arms down",
    "hopping up off the ground, both arms raised, hearts floating higher",
    "landing, arms swinging down, big smile",
  ] },
  thinking: { motion: "sitting, hand on chin, thinking, small thought dots above the head", frames: [
    "sitting, hand on chin, eyes looking up",
    "one small dot appears above the head",
    "two small dots above the head",
    "three small dots above the head, head tilted",
  ] },
  drag: { motion: "being lifted up from behind by the back of the collar (no hand visible), legs dangling, surprised face", frames: [
    "dangling, legs hanging straight down, arms limp, surprised face",
    "legs kicking to the left, arms flailing",
    "dangling, legs swinging slightly",
    "legs kicking to the right, arms flailing",
  ] },
  drop: { motion: "landing on both feet with a squash, then recovering", frames: [
    "just touching the ground, legs reaching down, arms up",
    "squashed short and wide from the impact, knees bent",
    "bouncing up, stretched tall",
    "back to normal standing, slightly dizzy",
  ] },
  groom: { motion: "rubbing the face and tidying the hair or fur with both hands", frames: [
    "sitting, raising both hands to the face",
    "rubbing the eyes with the hands",
    "smoothing the hair or fur on top of the head",
    "hands lowering, content face",
  ] },
  stretch: { motion: "big upright stretch: arms overhead on tiptoes, then standing tall", frames: [
    "standing normally",
    "arms rising in front of the body",
    "arms fully overhead, standing on tiptoes, eyes closed",
    "leaning to one side, arms still overhead",
    "arms lowering, body straightening",
    "standing tall, satisfied face",
  ] },
  wiggle: { motion: "crouched low with knees bent, wiggling the hips, ready to pounce", frames: [
    "crouched low, knees bent, hands forward, hips to the left",
    "hips centered",
    "hips to the right",
    "hips centered, eyes locked on a target",
  ] },
  scroll: { motion: "sitting, unrolling and reading a long paper scroll with both hands", frames: [
    "sitting, holding a rolled paper scroll with both hands",
    "the scroll unrolls a little",
    "the scroll unrolled further, reading it",
    "hands rolling the scroll back up",
  ] },
};

export type BodyType = "four" | "two";

/** Poses for a state and body type; `frames.length` is the recommended frame count. */
export const posesFor = (state: PetState, body: BodyType) => (body === "two" && BIPED_POSES[state]) || ROW_POSES[state];

export const ROW_STYLES = {
  pixel: { label: "Pixel art", line: (cell: number) => `cute pixel art, drawn as a ${Math.round(cell / 4)}×${Math.round(cell / 4)} px sprite and upscaled exactly 4× with nearest-neighbor, crisp hard square pixels, no anti-aliasing, no blur, limited palette, dark 1-pixel outline` },
  cartoon: { label: "Cartoon", line: () => "cute clean 2D cartoon, bold dark outline, flat cel shading, no soft glow" },
  chibi: { label: "Chibi anime", line: () => "cute chibi anime style, big head and small body (about 2 heads tall), large shiny eyes, clean bold outline, flat cel shading, no soft glow" },
} as const;

/** Drop comma clauses about a tail or ears the character doesn't have. */
function trimParts(text: string, tail: boolean, ears: boolean): string {
  return text.split(", ").filter((c) => (tail || !/\btail\b/.test(c)) && (ears || !/\bears?\b/.test(c))).join(", ");
}

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
  style: keyof typeof ROW_STYLES;
  /** Four-legged animal or two-legged character. */
  body: BodyType;
  tail: boolean;
  /** Animal ears (a human has none). */
  ears: boolean;
  /** Worn item kept identical in every frame, e.g. "a red scarf". Empty for none. */
  accessory: string;
}

export function rowPrompt(o: RowPromptOpts): string {
  const n = Math.max(1, Math.round(o.frames)), cell = o.cell, bg = ROW_BG[o.bg];
  const loop = defaultTiming(o.state).loop ? "The frames form a smooth seamless loop." : "The frames play once, in order.";
  const raw = posesFor(o.state, o.body);
  const trim = (t: string) => trimParts(t, o.tail, o.ears);
  const pose = { motion: trim(raw.motion), frames: raw.frames.map(trim) };
  const poses = n === pose.frames.length
    ? pose.frames.map((f, i) => `Frame ${i + 1}: ${f}.`).join("\n")
    : `Key poses in order, spread across the ${n} frames: ${pose.frames.join(" → ")}.`;
  const traits = [
    o.body === "two" ? "Stands and walks upright on two legs." : "Stands and walks on four legs.",
    o.tail ? "" : "No tail.",
    o.ears ? "" : "No animal ears.",
    o.accessory.trim() ? `Wears ${o.accessory.trim()} in every frame, same position, size and colors.` : "",
  ].filter(Boolean).join(" ");
  const ref = o.state === "idle" ? "" : " Match the character in the attached reference image exactly.";
  const style = ROW_STYLES[o.style].line(cell);
  return [
    "Create a 2D game sprite strip for a desktop pet.",
    "",
    `Layout: ONE single horizontal row of exactly ${n} animation frames, left to right, nothing else in the image. Image size ${n * cell}×${cell} px (aspect ratio ${n}:1). Each frame is a ${cell}×${cell} px square cell. The character is centered in its cell with about 15% empty background on every side; frames never touch or overlap each other or the image edge.`,
    "",
    `Animation (${STATE_LABELS[o.state]}): ${pose.motion}. ${loop} Every frame is a distinct pose, evenly spaced in time.`,
    poses,
    "",
    `Character: ${o.character.trim() || "a cute chubby french bulldog"}. ${traits} Identical design, colors, proportions and size in every frame. Full body visible, facing right, feet on the same baseline in every frame (except mid-air poses).${ref}`,
    "",
    `Background: perfectly flat solid ${bg.name} ${bg.hex} chroma-key background. No gradient, no shadow, no ground, no glow, no texture, no noise. Do not use ${bg.name} anywhere on the character.`,
    "",
    `Style: ${style}. No text, no labels, no numbers, no grid lines, no frame borders, no watermark.`,
  ].join("\n");
}
