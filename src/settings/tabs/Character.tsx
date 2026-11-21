import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  deleteCharacter, importCharacter, listCharacters, loadUserCharacter, openCharactersDir, readTextFile,
  saveCharacterConfig, saveCharacterImage, loadCharacterOriginal, type CharacterInfo,
} from "../../shared/api";
import { STATES, STATE_LABELS, type AnimationDef, type PetState, type SpriteConfig } from "../../shared/types";
import { alphaOf, animationsFromGuess, guessGrid, suggestRender } from "../../shared/detect";
import { gridAnimations, loadImage, normalizeConfig, resolveAnim, drawFrame, type LoadedSprite } from "../../pet/sprite";
import { processImport, type ImportOptions } from "../../shared/imageio";
import { Group, Page, Row, Select, Slider, Toggle } from "../ui";
import type { TabProps } from "./types";

interface Loaded { cfg: SpriteConfig; img: HTMLImageElement }

async function loadForEditing(id: string): Promise<Loaded> {
  if (id === "cat") {
    const cfg = normalizeConfig(await (await fetch("/characters/cat/sprite.json")).json());
    return { cfg, img: await loadImage("/characters/cat/sheet.png") };
  }
  const c = await loadUserCharacter(id);
  return { cfg: normalizeConfig(c.config), img: await loadImage(c.image) };
}

function AnimPreview({ cfg, img, state, fps }: { cfg: SpriteConfig; img: HTMLImageElement; state: PetState; fps: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const a = resolveAnim(cfg, state, fps);
    const sc = cfg.frameHeight >= 150 ? 150 / cfg.frameHeight : Math.max(1, Math.floor(150 / cfg.frameHeight));
    c.width = Math.max(1, Math.round(cfg.frameWidth * sc)); c.height = Math.max(1, Math.round(cfg.frameHeight * sc));
    const ctx = c.getContext("2d")!;
    const sprite: LoadedSprite = { cfg, img, cols: Math.max(1, Math.floor(img.naturalWidth / cfg.frameWidth)) };
    if (!a) { ctx.clearRect(0, 0, c.width, c.height); return; }
    let i = 0;
    const paint = () => drawFrame(ctx, sprite, a.frames[i % a.frames.length], c.width, c.height, false);
    paint();
    if (a.frames.length < 2) return;
    const t = window.setInterval(() => { i++; paint(); }, 1000 / a.fps);
    return () => clearInterval(t);
  }, [cfg, img, state, fps]);
  return <canvas ref={ref} className="pixel preview-bg rounded-lg" style={{ maxWidth: 200, maxHeight: 200 }} />;
}

function SheetView({ cfg, img }: { cfg: SpriteConfig; img: HTMLImageElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = Math.min(4, 480 / img.naturalWidth);
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,40,120,.6)"; ctx.lineWidth = 1; ctx.fillStyle = "rgba(255,40,120,.9)";
    ctx.font = "9px ui-monospace, Menlo, monospace";
    const cols = Math.max(1, Math.floor(img.naturalWidth / cfg.frameWidth));
    const rows = Math.max(1, Math.floor(img.naturalHeight / cfg.frameHeight));
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        const x = q * cfg.frameWidth * k, y = r * cfg.frameHeight * k;
        ctx.strokeRect(x + 0.5, y + 0.5, cfg.frameWidth * k - 1, cfg.frameHeight * k - 1);
        if (cfg.frameWidth * k >= 22) ctx.fillText(String(r * cols + q), x + 2, y + 9);
      }
  }, [cfg.frameWidth, cfg.frameHeight, img]);
  return <canvas ref={ref} className="pixel preview-bg rounded-lg" style={{ maxWidth: "100%" }} />;
}

/** Build a sensible config for a freshly imported image: detect the frame grid and a good display size. */
async function autoConfig(img: HTMLImageElement, name: string): Promise<SpriteConfig> {
  const { w, h, alpha } = await alphaOf(img);
  const g = guessGrid(w, h, alpha);
  const { animations, states } = animationsFromGuess(g);
  return normalizeConfig({ name, frameWidth: g.frameWidth, frameHeight: g.frameHeight, animations, states, ...suggestRender(g.frameHeight) });
}

const num = { width: 58 } as const;

export function CharacterTab({ settings: s, update }: TabProps) {
  const [chars, setChars] = useState<CharacterInfo[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<SpriteConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewState, setPreviewState] = useState<PetState>("idle");
  const [msg, setMsg] = useState("");
  const [opt, setOpt] = useState<ImportOptions>({ clean: true, animate: true });
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const builtin = s.character === "cat";

  const refresh = useCallback(() => listCharacters().then(setChars).catch(() => {}), []);
  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let alive = true;
    loadForEditing(s.character)
      .then((l) => { if (alive) { setLoaded(l); setDraft(l.cfg); setDirty(false); setJsonText(JSON.stringify(l.cfg, null, 2)); setMsg(""); } })
      .catch((e) => alive && setMsg(String(e)));
    return () => { alive = false; };
  }, [s.character, reloadKey]);

  const edit = (next: SpriteConfig) => { setDraft(next); setDirty(true); setJsonText(JSON.stringify(next, null, 2)); };

  /** Clean the image, rebuild/animate it, store it and switch to it. */
  async function applyPipeline(id: string, imageSrc: string, name: string, setScale: boolean) {
    const res = await processImport(await loadImage(imageSrc), name, opt);
    await saveCharacterImage(id, res.png);
    await saveCharacterConfig(id, res.config);
    await refresh();
    if (setScale) update({ character: id, scale: res.suggestedScale });
    else setReloadKey((k) => k + 1);
    setMsg(`Done: ${res.notes.join(", ")}.`);
  }

  async function doImport() {
    const path = await open({ multiple: false, filters: [{ name: "PNG image", extensions: ["png"] }] });
    if (typeof path !== "string") return;
    setBusy(true);
    try {
      const name = (path.split("/").pop() ?? "character").replace(/\.png$/i, "").slice(0, 40);
      const r = await importCharacter(path, name);
      await applyPipeline(r.id, (await loadUserCharacter(r.id)).image, name, true);
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function reprocess() {
    setBusy(true);
    try { await applyPipeline(s.character, await loadCharacterOriginal(s.character), draft?.name ?? "Custom", false); }
    catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function save() {
    if (!draft) return;
    try {
      const cfg = normalizeConfig(draft);
      await saveCharacterConfig(s.character, cfg);
      setDraft(cfg); setDirty(false); setMsg("Saved.");
    } catch (e) { setMsg(String(e)); }
  }

  async function importJson() {
    const path = await open({ multiple: false, filters: [{ name: "Sprite config", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try { edit(normalizeConfig(JSON.parse(await readTextFile(path)))); setMsg("JSON loaded. Review, then Save & apply."); }
    catch (e) { setMsg(`Invalid JSON: ${e}`); }
  }

  const animNames = useMemo(() => Object.keys(draft?.animations ?? {}), [draft]);
  const setAnim = (name: string, patch: Partial<AnimationDef>) => draft && edit({ ...draft, animations: { ...draft.animations, [name]: { ...draft.animations[name], ...patch } } });

  return (
    <Page title="Character">
      <Group>
        <Row label="Character" desc="Pick the default cat or one of your own.">
          <Select value={s.character} onChange={(v) => update({ character: v })} options={chars.map((c) => ({ value: c.id, label: c.name }))} />
        </Row>
        <Row label="Import sprite" desc="A PNG or a sprite sheet. Cleanup and animation run automatically.">
          <button className="btn primary" disabled={busy} onClick={doImport}>{busy ? "Working…" : "Import PNG…"}</button>
        </Row>
        <Row label="Import options" desc="Remove background + restore crisp pixels. Single images get generated animations (bounce, lean, squash, hearts…).">
          <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={opt.clean} onChange={(e) => setOpt({ ...opt, clean: e.target.checked })} />clean up</label>
          <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={opt.animate} onChange={(e) => setOpt({ ...opt, animate: e.target.checked })} />animate</label>
          {!builtin && <button className="btn" disabled={busy} onClick={reprocess}>Re-process</button>}
        </Row>
        <Row label="Characters folder" desc="Drop folders with sheet.png + sprite.json here, no app changes needed.">
          <button className="btn" onClick={() => openCharactersDir()}>Show in Finder</button>
          {!builtin && <button className="btn danger" onClick={async () => { await deleteCharacter(s.character); await refresh(); }}>Delete</button>}
          {!builtin && <button className="btn" onClick={() => update({ character: "cat" })}>Reset to default</button>}
        </Row>
      </Group>

      <Group title="Appearance & motion">
        <Row label="Pixel scale"><Slider value={s.scale} min={1} max={5} step={1} format={(v) => `${v}×`} onChange={(v) => update({ scale: v })} /></Row>
        <Row label="Animation FPS" desc="Auto uses the speed defined by each animation.">
          <Toggle value={s.fps === null} onChange={(auto) => update({ fps: auto ? null : 8 })} />
          <Slider value={s.fps ?? 8} min={1} max={24} disabled={s.fps === null} format={(v) => (s.fps === null ? "Auto" : `${v}`)} onChange={(v) => update({ fps: v })} />
        </Row>
        <Row label="Movement speed"><Slider value={s.speed} min={10} max={300} step={5} format={(v) => `${v}px/s`} onChange={(v) => update({ speed: v })} /></Row>
        <Row label="Position X" desc="Horizontal position on the display."><Slider value={Math.round(s.position.x * 100)} min={0} max={100} format={(v) => `${v}%`} onChange={(v) => update({ position: { x: v / 100 } })} /></Row>
        <Row label="Position Y"><Slider value={Math.round(s.position.y * 100)} min={5} max={100} format={(v) => `${v}%`} onChange={(v) => update({ position: { y: v / 100 } })} /></Row>
      </Group>

      <Group title="Preview">
        <div className="p-4 flex gap-4 items-start">
          {loaded && draft && <AnimPreview cfg={draft} img={loaded.img} state={previewState} fps={s.fps} />}
          <div className="flex-1 min-w-0">
            <div className="desc mb-1" style={{ color: "var(--sub)" }}>Animation state</div>
            <Select value={previewState} onChange={setPreviewState} options={STATES.map((st) => ({ value: st, label: STATE_LABELS[st] }))} />
            <div className="desc mt-2" style={{ color: "var(--sub)" }}>
              {draft && (resolveAnim(draft, previewState, s.fps) ? `Plays “${resolveAnim(draft, previewState, s.fps)!.name}”` : "No animation mapped")}
            </div>
          </div>
        </div>
      </Group>

      {!builtin && draft && loaded && (
        <>
          <Group title="Sprite sheet">
            <Row label="Frame size" desc={`Sheet is ${loaded.img.naturalWidth}×${loaded.img.naturalHeight}px.`}>
              <input className="field" style={num} type="number" min={1} value={draft.frameWidth} onChange={(e) => edit({ ...draft, frameWidth: Math.max(1, Number(e.target.value) || 1) })} />
              <span>×</span>
              <input className="field" style={num} type="number" min={1} value={draft.frameHeight} onChange={(e) => edit({ ...draft, frameHeight: Math.max(1, Number(e.target.value) || 1) })} />
            </Row>
            <Row label="Auto-detect" desc="Re-detect frame size, rows and display size from the image.">
              <button className="btn primary" onClick={async () => { edit({ ...(await autoConfig(loaded.img, draft.name)), name: draft.name }); setMsg("Detected. Save & apply to use it."); }}>Detect</button>
            </Row>
            <Row label="Display size" desc="Multiplier for big images (1 = native pixels). Smooth scaling is for non-pixel-art.">
              <input className="field" style={{ width: 70 }} type="number" step={0.05} min={0.02} max={4} value={draft.renderScale}
                onChange={(e) => edit({ ...draft, renderScale: Math.min(4, Math.max(0.02, Number(e.target.value) || 1)) })} />
              <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={draft.smooth} onChange={(e) => edit({ ...draft, smooth: e.target.checked })} />smooth</label>
            </Row>
            <Row label="Auto-split rows" desc="One animation per row of the sheet (row1, row2, …).">
              <button className="btn" onClick={() => {
                const anims = gridAnimations(loaded.img.naturalWidth, loaded.img.naturalHeight, draft.frameWidth, draft.frameHeight, 6);
                edit({ ...draft, animations: anims, states: { idle: "row1" } });
              }}>Split</button>
            </Row>
            <div className="p-3"><SheetView cfg={draft} img={loaded.img} /></div>
          </Group>

          <Group title="Animations">
            {animNames.map((n) => {
              const a = draft.animations[n];
              return (
                <div className="row" key={n}>
                  <span className="w-20 truncate" title={n}>{n}</span>
                  <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--sub)" }}>
                    {a.frames ? (
                      <input className="field" style={{ width: 118 }} value={a.frames.join(",")} title="frame indices"
                        onChange={(e) => setAnim(n, { frames: e.target.value.split(",").map((x) => parseInt(x, 10)).filter((x) => x >= 0) })} />
                    ) : (
                      <>
                        start<input className="field" style={num} type="number" min={0} value={a.start ?? 0} onChange={(e) => setAnim(n, { start: Math.max(0, Number(e.target.value) || 0) })} />
                        count<input className="field" style={num} type="number" min={1} value={a.count ?? 1} onChange={(e) => setAnim(n, { count: Math.max(1, Number(e.target.value) || 1) })} />
                      </>
                    )}
                    fps<input className="field" style={{ width: 50 }} type="number" min={1} max={60} value={a.fps} onChange={(e) => setAnim(n, { fps: Math.max(1, Number(e.target.value) || 1) })} />
                    <label className="flex items-center gap-1"><input type="checkbox" checked={a.loop !== false} onChange={(e) => setAnim(n, { loop: e.target.checked })} />loop</label>
                    <button className="btn danger" onClick={() => {
                      const { [n]: _gone, ...rest } = draft.animations;
                      const states = Object.fromEntries(Object.entries(draft.states).filter(([, v]) => v !== n));
                      edit({ ...draft, animations: rest, states });
                    }}>✕</button>
                  </div>
                </div>
              );
            })}
            <div className="row">
              <span className="desc">Frame numbers are shown on the sheet above.</span>
              <button className="btn" onClick={() => {
                let i = animNames.length + 1; while (draft.animations[`anim${i}`]) i++;
                edit({ ...draft, animations: { ...draft.animations, [`anim${i}`]: { start: 0, count: 1, fps: 6, loop: true } } });
              }}>Add animation</button>
            </div>
          </Group>

          <Group title="Map animations to states">
            {STATES.map((st) => (
              <Row key={st} label={STATE_LABELS[st]}>
                <Select
                  value={draft.states[st] ?? ""}
                  onChange={(v) => { const states = { ...draft.states }; if (v) states[st] = v; else delete states[st]; edit({ ...draft, states }); }}
                  options={[{ value: "", label: st === "idle" ? "(first animation)" : "(fall back to idle)" }, ...animNames.map((n) => ({ value: n, label: n }))]}
                />
              </Row>
            ))}
          </Group>

          <Group title="Random idle animations">
            <div className="p-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {animNames.map((n) => (
                <label key={n} className="flex items-center gap-1.5 text-[12.5px]">
                  <input type="checkbox" checked={draft.quirks.includes(n)}
                    onChange={(e) => edit({ ...draft, quirks: e.target.checked ? [...draft.quirks, n] : draft.quirks.filter((q) => q !== n) })} />{n}
                </label>
              ))}
            </div>
            <div className="px-3 pb-3 desc" style={{ color: "var(--sub)" }}>Ticked animations are played now and then while the character idles, on top of the mapped states above.</div>
          </Group>

          <Group title="Advanced: sprite.json">
            <div className="p-3">
              <textarea className="field w-full" rows={9} spellCheck={false} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}
                value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
              <div className="flex gap-2 mt-2">
                <button className="btn" onClick={() => { try { edit(normalizeConfig(JSON.parse(jsonText))); setMsg("JSON applied to editor."); } catch (e) { setMsg(`Invalid JSON: ${e}`); } }}>Apply JSON</button>
                <button className="btn" onClick={importJson}>Import file…</button>
                <button className="btn" onClick={() => navigator.clipboard.writeText(jsonText).then(() => setMsg("Copied to clipboard."))}>Copy</button>
              </div>
            </div>
          </Group>

          <div className="flex items-center gap-3 mt-4">
            <button className="btn primary" disabled={!dirty} onClick={save}>Save &amp; apply</button>
            {dirty && <span className="desc" style={{ color: "var(--sub)" }}>Unsaved changes</span>}
          </div>
        </>
      )}
      {msg && <div className="mt-3 text-[12px]" style={{ color: "var(--sub)" }}>{msg}</div>}
    </Page>
  );
}
