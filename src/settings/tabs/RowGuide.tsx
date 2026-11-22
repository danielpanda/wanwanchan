import { useState } from "react";
import { ROW_BG, rowPrompt } from "../../shared/rowGuide";
import { REQUIRED_STATES, STATES, STATE_LABELS, type PetState } from "../../shared/types";
import { Group, Select } from "../ui";

const TIPS: [string, string][] = [
  ["One image per state", "All frames side by side in ONE horizontal row. Nothing else in the image: no title, no grid, no frame borders."],
  ["Frames", "4 recommended (2–8). Rows may have different counts; the app detects them."],
  ["Size & ratio", "Square cells, 256×256 px recommended. 4 frames = 1024×256 px (ratio 4:1). Use the same cell size for every row so the character keeps one scale."],
  ["Spacing", "Character centered in its cell with ~15% empty margin (~40 px of 256) on each side. Sprites never touch each other or the edge: the empty gap is how frames are counted. If they touch, set “frames” in Row import manually."],
  ["Pose consistency", "Same size and proportions in every frame and every row, feet on the same baseline, facing right (the app mirrors it when walking left)."],
  ["Background", `Flat ${ROW_BG.green.hex} green or ${ROW_BG.magenta.hex} magenta. No gradient, shadow, floor, glow or noise. Use magenta when the character has green; green when it has pink or purple.`],
  ["Pixel art", "Draw at 64×64 and upscale with nearest-neighbor by a whole number (×4 = 256). The app restores the crisp native pixels. Other art is scaled to 160 px tall."],
  ["Workflow", "Generate Idle first. Attach that image as the reference when generating every other row, so it stays the same character."],
  ["File", "PNG or JPG, max 20 MB, max 8192 px per side. JPG from Gemini / ChatGPT works because the green / magenta key is removed with a tolerance; PNG gives the cleanest edges. Don't re-save a JPG several times."],
];

export function RowGuide() {
  const [character, setCharacter] = useState("a chubby brown and black french bulldog with a tan muzzle, upright bat ears and big round eyes");
  const [state, setState] = useState<PetState>("idle");
  const [frames, setFrames] = useState(4);
  const [bg, setBg] = useState<keyof typeof ROW_BG>("green");
  const [pixel, setPixel] = useState(true);
  const [copied, setCopied] = useState("");
  const opts = { character, frames, cell: 256, bg, pixel };
  const prompt = rowPrompt({ ...opts, state });

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => { setCopied(what); window.setTimeout(() => setCopied(""), 1800); });
  const allRequired = () =>
    REQUIRED_STATES.map((st) => `===== ${STATE_LABELS[st]} =====\n${rowPrompt({ ...opts, state: st })}`).join("\n\n");

  return (
    <Group title="Row guide & AI prompt">
      <details className="p-3">
        <summary className="cursor-pointer text-[12.5px] font-semibold">How to make a row image (read before generating)</summary>
        <ul className="mt-2 space-y-1.5 text-[12px]" style={{ color: "var(--sub)" }}>
          {TIPS.map(([k, v]) => <li key={k}><b style={{ color: "var(--text, inherit)" }}>{k}:</b> {v}</li>)}
        </ul>
      </details>
      <div className="px-3 pb-3 space-y-2">
        <div className="desc" style={{ color: "var(--sub)" }}>Prompt for ChatGPT, Gemini, Midjourney etc. Describe your character, pick a state, copy, paste.</div>
        <textarea className="field w-full" rows={2} maxLength={300} value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Describe your character" />
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Select value={state} onChange={setState} options={STATES.map((st) => ({ value: st, label: STATE_LABELS[st] }))} />
          <span>frames</span>
          <input className="field" style={{ width: 50 }} type="number" min={2} max={8} value={frames} onChange={(e) => setFrames(Math.max(2, Math.min(8, Number(e.target.value) || 4)))} />
          <Select value={bg} onChange={setBg} options={[{ value: "green", label: "Green #00FF00" }, { value: "magenta", label: "Magenta #FF00FF" }]} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={pixel} onChange={(e) => setPixel(e.target.checked)} />pixel art</label>
        </div>
        <textarea className="field w-full" rows={10} readOnly spellCheck={false} value={prompt} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }} />
        <div className="flex items-center gap-2">
          <button className="btn primary" onClick={() => copy(prompt, "prompt")}>Copy prompt</button>
          <button className="btn" onClick={() => copy(allRequired(), "all")}>Copy all required rows</button>
          {copied && <span className="desc" style={{ color: "var(--sub)" }}>Copied{copied === "all" ? ` ${REQUIRED_STATES.length} prompts` : ""}.</span>}
        </div>
      </div>
    </Group>
  );
}
