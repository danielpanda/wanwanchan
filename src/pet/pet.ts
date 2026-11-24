import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { DEFAULT_SETTINGS, type Settings, withDefaults } from "../shared/types";
import { fetchUrlText, focusApp, focusPet, listApps, loadUserCharacter, openApp, openUrl } from "../shared/api";
import { AGENT_LABEL, pick } from "../shared/messages";
import { ACCESSORIES, award, levelOf, unlocked, type XpKind } from "../shared/bond";
import { drawAccessories } from "./accessories";
import { MusicFx } from "./music";
import { Bubble } from "./bubble";
import { CalendarSync } from "./calendar";
import { FocusController, type FocusAction } from "./focus";
import { AgentHistory } from "./history";
import { fuzzy, parseCommand, targetOf } from "./launcher";
import { Notifier } from "./notify";
import { Panel } from "./panel";
import {
  AGENT_ANIM, aggregateAgents, PRIORITY, StateMachine, TypingMeter, type AgentStateName,
} from "./fsm";
import {
  buildSprite, builtinCharacters, drawFrame, hasAnim, loadBuiltin, loadBuiltinCat, missingStates, resolveAnim, type LoadedSprite, type ResolvedAnim,
} from "./sprite";

const AGENT_STALE_MS = 30 * 60_000;
const ERROR_MS = 8000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export async function startPet() {
  Object.assign(document.documentElement.style, { background: "transparent" });
  Object.assign(document.body.style, {
    margin: "0", overflow: "hidden", background: "transparent", userSelect: "none", webkitUserSelect: "none",
  });
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed", left: "0", top: "0", imageRendering: "pixelated", willChange: "transform", transformOrigin: "0 0",
    pointerEvents: "none", display: "none",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const bubble = new Bubble();
  const musicFx = new MusicFx();
  let musicOn = false, lastDanceFlip = 0;
  const history = new AgentHistory();
  let apps: string[] | null = null;
  const getApps = async () => (apps ??= await listApps().catch(() => []));
  let panelTick: number | undefined;
  const panel = new Panel({
    onOpenRun: (r) => { if (r.bid) focusApp(r.bid).catch(() => {}); },
    onSubmit: (t) => void runCommand(t),
    suggest: (t) => (apps ? fuzzy(targetOf(t), apps, 5) : []),
    onPick: (a) => void launch(a),
    onChip: (k) => { void runIntent({ type: "action", name: k }); },
    onClose: () => { window.clearInterval(panelTick); panelTick = undefined; },
  });
  // pinned note + waiting agent badge, floating above the head
  const note = document.createElement("div");
  Object.assign(note.style, {
    position: "fixed", left: "0", top: "0", display: "none", pointerEvents: "none", whiteSpace: "nowrap", maxWidth: "220px",
    overflow: "hidden", textOverflow: "ellipsis", padding: "2px 7px", borderRadius: "7px", background: "#fffdf7", color: "#3b2a2f",
    border: "2px solid #5c363a", font: '700 11px ui-rounded,"SF Pro Rounded",-apple-system,sans-serif', willChange: "transform",
  });
  document.body.appendChild(note);

  // ---------------------------------------------------------------- state
  let settings: Settings = DEFAULT_SETTINGS;
  let sprite: LoadedSprite | null = null;
  let spriteId = "";
  const sm = new StateMachine("idle");
  const meter = new TypingMeter();
  let running = true;

  let W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
  let pos = { ...DEFAULT_SETTINGS.position };
  let x = W * pos.x, y = H * pos.y; // feet-centre anchor, logical px
  let cw = 96, ch = 96;
  let facing: 1 | -1 = 1;

  let state = "idle";
  let anim: ResolvedAnim | null = null;
  let frameStart = 0, lastDrawKey = "", lastTransform = "";
  let lastStep = performance.now();

  let moveTarget: { x: number; y: number } | null = null;
  let jump: { start: number; dur: number } | null = null;
  let dragging = false, down: { x: number; y: number; id: number } | null = null, grab = { x: 0, y: 0 };
  let overChar = false;
  let cursor: { x: number; y: number } | null = null;
  let lastLookPos = { x: -1e4, y: -1e4 };
  let lastActivity = performance.now();
  let restKind: "sit" | "sleep" | null = null;
  let bond = DEFAULT_SETTINGS.bond;
  let bondTimer: number | undefined;
  let stay = false; // "sit & stay" requested by the user
  let lingerAt = Infinity;
  let lunge: { x0: number; x1: number; start: number; dur: number } | null = null;
  let clicks: number[] = [];
  let energy = { v: 0.6, t: performance.now() };
  let quirkTimer: number | undefined, hoverTimer: number | undefined;
  /** Stretch reminder: grow to fill the screen (out = growing / big, else shrinking back). */
  let giant: { out: boolean; start: number; dur: number } | null = null;
  let peekOut = false; // peek mode: came out for a reminder
  const peeking = () => settings.peekMode && !peekOut;

  let timer: number | null = null, raf: number | null = null;
  let restTimer: number | undefined, wanderTimer: number | undefined, saveTimer: number | undefined;
  const agents = new Map<string, { state: AgentStateName; ts: number }>();
  let agentTimer: number | undefined;
  const agentBid = new Map<string, string>(); // app that last reported each agent (for click-to-open)
  const agentStart = new Map<string, number>(); // when each agent started working (for "took 2m 14s")

  // ---------------------------------------------------------------- speech bubbles & reminders
  const notifier = new Notifier({
    settings: () => settings,
    typing: () => sm.has("typing", performance.now()),
    peeking,
    award: (k) => giveXp(k),
    open: (bid) => { focusApp(bid).catch(() => {}); },
    openUrl: (u) => { openUrl(u).catch(() => {}); },
    disableReminder: (id) => {
      const reminders = settings.notify.reminders.map((r) => (r.id === id ? { ...r, enabled: false } : r));
      invoke("set_settings", { patch: { notify: { reminders } } }).catch(() => {});
    },
    close: () => bubble.hide(),
    present: (text, o) => {
      const now = performance.now();
      const alert = o.buttons !== undefined; // reminders: perk up and wait for an answer
      if (alert && settings.peekMode) comeOut(true);
      if (alert) {
        const a = o.anim && sprite && hasAnim(sprite.cfg, o.anim) ? o.anim : "look";
        sm.hold("notify", a, PRIORITY.notify);
        if (a === "look") doJump(now);
        if (o.anim === "stretch") setGiant(true); // stretch together, full screen
      }
      bubble.show(text, {
        seconds: o.seconds, sound: o.sound, buttons: o.buttons, onClick: o.onClick,
        onClose: () => { sm.release("notify"); setGiant(false); if (peekOut) comeOut(false); o.onClose(); updateNote(); wake(); },
      });
      updateNote();
      place(now);
      wake();
    },
  });

  const calendar = new CalendarSync({
    settings: () => settings,
    fetchText: fetchUrlText,
    apply: (events) => notifier.setCalendar(events, settings.calendar.leadMin),
  });

  // ---------------------------------------------------------------- quick panel & "open <app>"
  function toggleSit(now: number) {
    stay = !stay;
    markActivity(now);
    if (stay) { moveTarget = null; sm.release("move"); lunge = null; sm.hold("stay", "sit", PRIORITY.stay); }
    else sm.release("stay");
    notifier.remark(stay ? "sit" : "stand");
    wake();
  }

  function showPanel() {
    if (!running) return;
    bubble.hide();
    const lang = settings.notify.language;
    void getApps();
    panel.show(history.list(Date.now()), lang);
    place();
    focusPet().catch(() => {});
    window.clearInterval(panelTick);
    panelTick = window.setInterval(() => panel.render(history.list(Date.now()), settings.notify.language), 1000);
  }
  const togglePanel = () => (panel.visible ? panel.hide() : showPanel());

  async function launch(app: string) {
    const lang = settings.notify.language;
    try {
      await openApp(app);
      panel.hide();
      notifier.say(lang === "id" ? `Membuka ${app}` : `Opening ${app}`);
      sm.pulse("react", "happy", PRIORITY.jump + 1, performance.now(), 1800);
      wake();
    } catch {
      panel.setHint(lang === "id" ? `Gagal membuka ${app}` : `Couldn't open ${app}`);
    }
  }

  async function runIntent(it: ReturnType<typeof parseCommand>, text = "") {
    const lang = settings.notify.language, now = performance.now();
    if (it.type === "app") return launch(it.app);
    if (it.type === "action") {
      panel.hide();
      if (it.name === "focus") focus.dispatch("toggle");
      else if (it.name === "sit") toggleSit(now);
      else if (it.name === "jump") { markActivity(now); doJump(now); }
      else if (it.name === "settings") invoke("open_settings").catch(() => {});
      else if (it.name === "panel") showPanel();
      return;
    }
    panel.setHint(it.suggestions.length
      ? (lang === "id" ? "Maksud kamu yang mana?" : "Which one did you mean?")
      : (lang === "id" ? `Aku belum bisa "${text.trim()}". Coba: buka <aplikasi>, fokus, duduk` : `I can't do "${text.trim()}" yet. Try: open <app>, focus, sit`));
    panel.showSuggestions(text, it.suggestions);
  }

  async function runCommand(text: string) { return runIntent(parseCommand(text, await getApps()), text); }

  // ---------------------------------------------------------------- focus (pomodoro)
  const focus = new FocusController({
    settings: () => settings,
    onChange: (snap, change) => {
      const now = performance.now(), lang = settings.notify.language;
      if (snap.phase === "work" && snap.running) sm.hold("focus", "typing", PRIORITY.focus);
      else sm.release("focus");
      if (change === "start") { notifier.notice(pick(lang, "focusStart")); doJump(now); }
      else if (change === "stop") notifier.notice(pick(lang, "focusStop"));
      else if (change && typeof change === "object") {
        if (change.ended === "work") {
          giveXp("focus");
          notifier.notice(pick(lang, change.next === "longBreak" ? "longBreak" : "breakStart"), "happy");
          sm.pulse("react", "happy", PRIORITY.jump + 1, now, 3000);
        } else {
          notifier.notice(pick(lang, "focusBack"));
        }
      }
      wake();
    },
  });

  // ---------------------------------------------------------------- layout
  const dev = (v: number) => Math.round(v * dpr) / dpr;

  function layout() {
    W = window.innerWidth; H = window.innerHeight; dpr = window.devicePixelRatio || 1;
    if (sprite) {
      const k = settings.scale * sprite.cfg.renderScale;
      cw = Math.max(4, Math.round(sprite.cfg.frameWidth * k));
      ch = Math.max(4, Math.round(sprite.cfg.frameHeight * k));
      canvas.style.imageRendering = sprite.cfg.smooth ? "auto" : "pixelated";
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
      canvas.width = Math.max(1, Math.round(cw * dpr)); canvas.height = Math.max(1, Math.round(ch * dpr));
    }
    lastDrawKey = ""; lastTransform = "";
    x = peeking() ? peekX() : W * pos.x; y = H * pos.y;
    clampPos(); place(); wake();
  }

  /** Peek mode: tucked into the right screen edge, about 40% visible. */
  const peekX = () => W + cw * 0.1;

  function clampPos() {
    x = Math.min(Math.max(x, cw / 2), Math.max(cw / 2, settings.peekMode ? peekX() : W - cw / 2));
    y = Math.min(Math.max(y, ch), Math.max(ch, H));
  }

  const dancing = () => musicOn && settings.musicDance && !dragging && sm.current(performance.now()).key === "music";
  const danceOffset = (now: number) => (dancing() ? Math.abs(Math.sin(now / 210)) * ch * 0.09 : 0);

  const jumpOffset = (now: number) => {
    if (!jump) return danceOffset(now);
    const t = (now - jump.start) / jump.dur;
    if (t >= 1) { jump = null; return 0; }
    return Math.sin(Math.PI * t) * ch * 0.42;
  };

  /** 0 = normal size, 1 = full-screen stretch. */
  function giantT(now: number) {
    if (!giant) return 0;
    const p = Math.min(1, (now - giant.start) / giant.dur);
    if (!giant.out && p >= 1) { giant = null; return 0; }
    const e = 1 - (1 - p) ** 3;
    return giant.out ? e : 1 - e;
  }

  /** On-screen box of the character (jump and giant stretch included). */
  function rect(now: number) {
    const t = giantT(now);
    const big = Math.max(1, Math.min((H * 0.82) / ch, (W * 0.9) / cw));
    const sc = 1 + (big - 1) * t;
    const foot = y - jumpOffset(now);
    const cx = x + (W / 2 - x) * t, bottom = foot + (H - foot) * t;
    return { cx, left: cx - (cw * sc) / 2, top: bottom - ch * sc, sc };
  }

  function setGiant(out: boolean) {
    if (!out && !giant) return;
    giant = { out, start: performance.now(), dur: out ? 900 : 600 };
    wake();
  }

  function place(now = performance.now()) {
    const r = rect(now);
    const t = `translate3d(${dev(r.left)}px,${dev(r.top)}px,0)${r.sc !== 1 ? ` scale(${r.sc.toFixed(4)})` : ""}`;
    if (t !== lastTransform) { canvas.style.transform = t; lastTransform = t; }
    focus.position(r.cx, r.top + ch * r.sc, W);
    if (musicFx.active) musicFx.position(r.cx, r.top, cw * r.sc);
    if (panel.visible) panel.position(r.cx, r.top, r.top + ch * r.sc, W);
    if (bubble.visible) bubble.position(r.cx, r.top, r.top + ch * r.sc, W);
    if (note.style.display !== "none") {
      const nw = note.offsetWidth, nh = note.offsetHeight;
      const left = Math.min(Math.max(4, r.cx - nw / 2), W - nw - 4);
      note.style.transform = `translate3d(${Math.round(left)}px,${Math.round(Math.max(4, r.top - nh - 4))}px,0)`;
    }
  }

  /** Pinned note and waiting agent badge. Hidden while a speech bubble is up. */
  function updateNote() {
    const parts: string[] = [];
    const pin = settings.notify.pinned.trim();
    if (pin) parts.push(pin);
    // agent badge: survives a dismissed bubble so pending decisions stay visible
    const live = [...agents].filter(([, a]) => performance.now() - a.ts <= AGENT_STALE_MS);
    const waiting = live.filter(([, a]) => a.state === "waiting").map(([k]) => AGENT_LABEL[k] ?? k);
    if (waiting.length) parts.unshift(`Waiting: ${waiting.join(", ")}`);
    const text = parts.join("  ");
    const show = running && !!text && !bubble.visible;
    if (note.textContent !== text) note.textContent = text;
    note.style.display = show ? "block" : "none";
    if (show) place();
  }

  function persistPosition() {
    if (settings.peekMode) return; // the edge spot is temporary
    pos = { x: x / W, y: y / H };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => invoke("save_position", { x: pos.x, y: pos.y }).catch(() => {}), 400);
  }

  // ---------------------------------------------------------------- animation
  function setState(next: string, now: number) {
    state = next;
    anim = sprite ? resolveAnim(sprite.cfg, next, settings.fps) : null;
    frameStart = now;
  }

  function frameIndex(now: number): number {
    if (!anim) return 0;
    const n = anim.frames.length;
    const f = Math.floor(((now - frameStart) * anim.fps) / 1000);
    return anim.frames[anim.loop ? f % n : Math.min(f, n - 1)];
  }

  const wornAccessories = () => {
    const ok = new Set(unlocked(bond.xp).map((a) => a.id));
    return settings.accessories.filter((id) => ok.has(id));
  };

  // ---------------------------------------------------------------- bond (affection)
  function giveXp(kind: XpKind) {
    const r = award(bond, kind, new Date());
    if (!r.gained && !r.levelUp) return;
    bond = r.state;
    emit("bond-changed", bond).catch(() => {});
    window.clearTimeout(bondTimer);
    bondTimer = window.setTimeout(() => invoke("save_bond", { bond }).catch(() => {}), 1500);
    if (r.levelUp) {
      const acc = ACCESSORIES.find((a) => a.level === r.levelUp);
      const lang = settings.notify.language;
      const extra = acc ? ` · ${lang === "id" ? "Terbuka" : "Unlocked"}: ${acc.name[lang]}` : "";
      if (acc && !settings.accessories.includes(acc.id)) invoke("set_settings", { patch: { accessories: [...settings.accessories, acc.id] } }).catch(() => {});
      sm.pulse("react", "happy", PRIORITY.jump + 1, performance.now(), 3200);
      notifier.say(`${pick(lang, "levelUp")} (Lv ${levelOf(bond.xp).level})${extra}`);
      lastDrawKey = "";
      wake();
    }
  }

  function draw(now: number) {
    if (!sprite || !anim) return;
    const frame = frameIndex(now);
    const flip = facing < 0;
    const worn = wornAccessories();
    const key = `${anim.name}|${frame}|${flip}|${canvas.width}|${worn.join(",")}`;
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    drawFrame(ctx, sprite, frame, canvas.width, canvas.height, flip);
    const anchor = sprite.cfg.anchors?.[frame];
    if (worn.length && anchor) drawAccessories(ctx, worn, anchor, canvas.width / sprite.cfg.frameWidth, canvas.width, flip);
  }

  function step(now: number) {
    if (!running || !sprite) return;
    const dt = Math.min(now - lastStep, 100);
    lastStep = now;
    const cur = sm.current(now).state;
    if (cur !== state) setState(cur, now);

    if (lunge) {
      const t = Math.min(1, (now - lunge.start) / lunge.dur);
      x = lunge.x0 + (lunge.x1 - lunge.x0) * (1 - (1 - t) * (1 - t));
      if (t >= 1) { lunge = null; persistPosition(); }
      clampPos();
    }
    if (now >= lingerAt && state === "walk" && moveTarget) {
      lingerAt = Infinity;
      const opts = ["sit", "look", "idle"].filter((n) => hasAnim(sprite!.cfg, n));
      sm.pulse("linger", opts[Math.floor(Math.random() * opts.length)], PRIORITY.linger, now, rand(1300, 2800));
    }
    if (moveTarget && (state === "walk" || state === "run")) {
      const v = (settings.speed * (state === "run" ? 2.6 : 1) * dt) / 1000;
      const dx = moveTarget.x - x, dy = moveTarget.y - y, dist = Math.hypot(dx, dy);
      if (Math.abs(dx) > 1) facing = dx > 0 ? 1 : -1;
      if (dist <= v + 0.5) {
        x = moveTarget.x; y = moveTarget.y;
        arrive();
      } else {
        x += (dx / dist) * v; y += (dy / dist) * v;
      }
      clampPos();
    }
    if (dancing()) {
      if (now - lastDanceFlip > 640) { lastDanceFlip = now; facing = facing > 0 ? -1 : 1; }
      if (!musicFx.active) musicFx.start();
    } else if (musicFx.active) musicFx.stop();
    place(now);
    draw(now);
  }

  function needsSmooth() {
    return (!!giant && performance.now() - giant.start < giant.dur + 50) || dragging || !!jump || !!lunge || dancing() || (!!moveTarget && (state === "walk" || state === "run"));
  }

  function schedule(now: number) {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    if (!running || document.hidden || !sprite) return;
    if (needsSmooth()) { raf = requestAnimationFrame(loop); return; }
    let delay: number | null = sm.nextExpiry(now);
    if (anim && anim.frames.length > 1 && (anim.loop || (now - frameStart) * anim.fps / 1000 < anim.frames.length)) {
      const per = 1000 / anim.fps;
      const toNext = per - ((now - frameStart) % per);
      delay = delay === null ? toNext : Math.min(delay, toNext);
    }
    if (delay !== null) timer = window.setTimeout(loop, Math.max(4, delay));
  }

  function loop() {
    timer = null; raf = null;
    const now = performance.now();
    step(now);
    schedule(now);
  }

  function wake() {
    if (!running) return;
    loop();
  }

  // ---------------------------------------------------------------- behaviours
  function arrive() {
    moveTarget = null;
    sm.release("move");
    persistPosition();
    scheduleWander();
    if (Math.random() < 0.4) window.setTimeout(runQuirk, 700); // settle down with a little something
  }

  function startMove(tx: number, ty: number, kind: "walk" | "run") {
    moveTarget = { x: tx, y: ty };
    lingerAt = kind === "walk" && Math.random() < 0.4 ? performance.now() + rand(1500, 3500) : Infinity;
    sm.hold("move", kind, PRIORITY.move);
  }

  function scheduleWander() {
    window.clearTimeout(wanderTimer);
    if (!running || !settings.randomMotion || settings.followCursor) return;
    const base = Math.max(3, settings.wanderEvery) * 1000;
    wanderTimer = window.setTimeout(wander, rand(0.5, 1.5) * base * (1.6 - getEnergy(performance.now())));
  }

  function wander() {
    const now = performance.now();
    const cur = sm.current(now).state;
    if (running && !stay && !settings.peekMode && settings.randomMotion && !settings.followCursor && !moveTarget && (cur === "idle" || cur === "blink")) {
      let dir = Math.random() < 0.5 ? -1 : 1;
      const dist = rand(80, 320);
      let tx = x + dir * dist;
      if (tx < cw / 2 + 8 || tx > W - cw / 2 - 8) { dir = -dir; tx = x + dir * dist; }
      tx = Math.min(Math.max(tx, cw / 2), W - cw / 2);
      if (Math.abs(tx - x) > 24 && hasAnim(sprite!.cfg, "walk")) {
        startMove(tx, y, Math.random() < 0.1 + 0.35 * getEnergy(performance.now()) && hasAnim(sprite!.cfg, "run") ? "run" : "walk");
        wake();
        return;
      }
    }
    scheduleWander();
  }

  function scheduleBlink() {
    window.setTimeout(() => {
      const now = performance.now();
      if (running && sprite && hasAnim(sprite.cfg, "blink") && sm.current(now).state === "idle") {
        const a = resolveAnim(sprite.cfg, "blink", settings.fps);
        if (a) sm.pulse("blink", "blink", PRIORITY.blink, now, (a.frames.length / a.fps) * 1000 + 30);
        wake();
      }
      scheduleBlink();
    }, rand(2500, 7000));
  }

  function updateRest() {
    window.clearTimeout(restTimer);
    if (!running) return;
    if (!settings.sleepMode) { sm.release("rest"); return; }
    const now = performance.now();
    const idle = (now - lastActivity) / 1000;
    let next: number | null;
    if (idle >= settings.sleepAfter) {
      if (restKind !== "sleep") transition("yawn", now);
      restKind = "sleep"; sm.hold("rest", "sleep", PRIORITY.rest); next = null;
    } else if (idle >= settings.sitAfter) {
      restKind = "sit"; sm.hold("rest", "sit", PRIORITY.rest); next = settings.sleepAfter - idle;
    } else { restKind = null; sm.release("rest"); next = settings.sitAfter - idle; }
    if (next !== null) restTimer = window.setTimeout(() => { updateRest(); wake(); }, next * 1000 + 50);
    wake();
  }

  function markActivity(now = performance.now()) {
    const gap = now - lastActivity;
    lastActivity = now;
    if (gap > 15 * 60_000 && running) notifier.welcomeBack();
    if (sm.has("rest", now)) {
      const was = restKind;
      sm.release("rest"); restKind = null;
      if (was === "sleep") { transition("stretch", now); bump(0.3); }
      updateRest();
    }
  }

  // ---------------------------------------------------------------- liveliness
  const getEnergy = (now: number) => 0.45 + (energy.v - 0.45) * Math.exp(-(now - energy.t) / 90000);
  const bump = (d: number) => { const now = performance.now(); energy = { v: Math.min(1, getEnergy(now) + d), t: now }; };
  const animMs = (st: string) => {
    const a = sprite && resolveAnim(sprite.cfg, st, settings.fps);
    return a ? (a.frames.length / a.fps) * 1000 : 0;
  };

  function transition(name: string, now: number) {
    if (sprite && hasAnim(sprite.cfg, name)) sm.pulse("transition", name, PRIORITY.transition, now, animMs(name) + 250);
  }

  function quirkPool(now: number) {
    const cfg = sprite!.cfg, e = getEnergy(now);
    const out: { name: string; w: number }[] = [];
    const add = (name: string, w: number) => { if (hasAnim(cfg, name)) out.push({ name, w }); };
    add("groom", 1 + (1 - e) * 2);
    add("stretch", 1);
    add("yawn", 0.3 + (1 - e) * 2.5);
    add("wiggle", 0.3 + e * 3);
    if (hasAnim(cfg, "look")) out.push({ name: "lookaround", w: 1 });
    for (const q of cfg.quirks) out.push({ name: `custom:${q}`, w: 1.5 });
    return out;
  }

  function runQuirk() {
    const now = performance.now();
    if (!running || !sprite || dragging || moveTarget || lunge || stay || settings.peekMode) return;
    if (!["idle", "blink", "sit"].includes(sm.current(now).state)) return;
    const pool = quirkPool(now);
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((n, q) => n + q.w, 0);
    const pick = pool.find((q) => (r -= q.w) <= 0) ?? pool[0];
    if (pick.name === "lookaround") {
      sm.pulse("quirk", "look", PRIORITY.quirk, now, 2600);
      facing = Math.random() < 0.5 ? 1 : -1;
      window.setTimeout(() => { facing = facing === 1 ? -1 : 1; lastDrawKey = ""; wake(); }, 1300);
    } else if (pick.name === "wiggle") {
      sm.pulse("quirk", "wiggle", PRIORITY.quirk, now, 900);
      window.setTimeout(pounce, 900);
    } else {
      const a = resolveAnim(sprite.cfg, pick.name, settings.fps);
      sm.pulse("quirk", pick.name, PRIORITY.quirk, now, a && a.loop ? 2400 : animMs(pick.name) + 250);
    }
    wake();
  }

  function pounce() {
    if (!running || !sprite || dragging || moveTarget) return;
    const now = performance.now();
    const dir = x < W * 0.2 ? 1 : x > W * 0.8 ? -1 : Math.random() < 0.5 ? -1 : 1;
    facing = dir === 1 ? 1 : -1;
    lunge = { x0: x, x1: Math.min(Math.max(x + dir * rand(50, 90), cw / 2), W - cw / 2), start: now, dur: 600 };
    doJump(now);
    bump(0.1);
    wake();
  }

  function scheduleQuirk() {
    window.clearTimeout(quirkTimer);
    if (!running) return;
    quirkTimer = window.setTimeout(() => { runQuirk(); scheduleQuirk(); }, rand(6000, 15000) * (1.5 - getEnergy(performance.now())));
  }

  function onClick(now: number) {
    clicks = clicks.filter((t) => now - t < 1300);
    clicks.push(now);
    giveXp("click");
    bump(0.12);
    if (clicks.length >= 3 && sprite && hasAnim(sprite.cfg, "happy")) {
      clicks = [];
      sm.pulse("react", "happy", PRIORITY.jump + 1, now, 2400);
      notifier.ouch();
      wake();
    } else doJump(now);
  }

  function updateFollow() {
    if (!settings.followCursor || !settings.mouseInteraction || !cursor || dragging || stay || settings.peekMode) return;
    const dx = cursor.x - x, dy = cursor.y - y, dist = Math.hypot(dx, dy);
    if (dist < 90) { if (moveTarget) { moveTarget = null; sm.release("move"); } return; }
    const k = (dist - 60) / dist;
    startMove(x + dx * k, y + dy * k, dist > 320 ? "run" : "walk");
    wake();
  }

  function doJump(now: number) {
    if (!sprite) return;
    const a = resolveAnim(sprite.cfg, "jump", settings.fps);
    const dur = a ? Math.max(550, (a.frames.length / a.fps) * 1000) : 600;
    if (sm.pulse("jump", "jump", PRIORITY.jump, now, dur, 350)) {
      jump = { start: now, dur };
      wake();
    }
  }

  // ---------------------------------------------------------------- hit testing / click-through
  function isOver(px: number, py: number, now = performance.now()): boolean {
    if (bubble.contains(px, py) || panel.contains(px, py)) return true;
    if (!sprite || canvas.style.display === "none") return false;
    const { left, top, sc } = rect(now);
    if (px < left || py < top || px >= left + cw * sc || py >= top + ch * sc) return false;
    try {
      const a = ctx.getImageData(
        Math.min(canvas.width - 1, Math.floor(((px - left) / sc) * dpr)),
        Math.min(canvas.height - 1, Math.floor(((py - top) / sc) * dpr)), 1, 1,
      ).data[3];
      return a > 24;
    } catch { return true; }
  }

  function updateOver(px: number, py: number) {
    const over = dragging || isOver(px, py);
    if (over !== overChar) {
      overChar = over;
      invoke("set_ignore_cursor", { ignore: !over }).catch(() => {});
      const onUi = bubble.contains(px, py) || panel.contains(px, py);
      document.body.style.cursor = over && !onUi ? "grab" : "default";
      window.clearTimeout(hoverTimer);
      if (over && !dragging && !onUi) {
        hoverTimer = window.setTimeout(() => {
          const now = performance.now();
          if (overChar && !dragging && settings.mouseInteraction && sprite && hasAnim(sprite.cfg, "happy")
            && sm.pulse("hover", "happy", PRIORITY.agentDone, now, 2200, 8000)) { bump(0.1); notifier.purr(); giveXp("pet"); wake(); }
        }, 1600);
      }
    }
  }

  function onCursor(cx: number, cy: number) {
    const now = performance.now();
    const moved = !cursor || Math.hypot(cx - cursor.x, cy - cursor.y) > 2;
    cursor = { x: cx, y: cy };
    updateOver(cx, cy);
    if (!moved || dragging) return;
    markActivity(now);
    if (!settings.mouseInteraction) return;
    if (settings.followCursor) { updateFollow(); return; }
    const near = Math.hypot(cx - x, cy - (y - ch / 2)) < 520;
    if (near && Math.hypot(cx - lastLookPos.x, cy - lastLookPos.y) > 14 && !moveTarget && !peeking()) {
      if (sm.pulse("look", "look", PRIORITY.look, now, 1800, 3500)) {
        lastLookPos = { x: cx, y: cy };
        facing = cx >= x ? 1 : -1;
        wake();
      }
    }
  }

  // ---------------------------------------------------------------- pointer (drag / click)
  window.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || giant || bubble.contains(e.clientX, e.clientY) || panel.contains(e.clientX, e.clientY) || !isOver(e.clientX, e.clientY)) return;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    grab = { x: x - e.clientX, y: y - e.clientY };
    try { document.documentElement.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });

  window.addEventListener("pointermove", (e) => {
    if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
      dragging = true;
      moveTarget = null; sm.release("move"); jump = null;
      sm.hold("drag", "drag", PRIORITY.drag);
      document.body.style.cursor = "grabbing";
      markActivity();
    }
    if (dragging) {
      x = e.clientX + grab.x; y = e.clientY + grab.y;
      clampPos();
      wake();
    } else {
      onCursor(e.clientX, e.clientY);
    }
  });

  window.addEventListener("pointerup", (e) => {
    const was = down;
    down = null;
    if (!was) return;
    try { document.documentElement.releasePointerCapture(was.id); } catch { /* ignore */ }
    const now = performance.now();
    if (dragging) {
      dragging = false;
      sm.release("drag");
      const a = sprite && resolveAnim(sprite.cfg, "drop", settings.fps);
      sm.pulse("drop", "drop", PRIORITY.drop, now, a ? Math.max(450, (a.frames.length / a.fps) * 1000 + 150) : 500);
      persistPosition();
      document.body.style.cursor = "grab";
      markActivity(now);
      if (peeking()) glide(peekX());
      wake();
      scheduleWander();
    } else if (settings.mouseInteraction) {
      markActivity(now);
      onClick(now);
    }
    updateOver(e.clientX, e.clientY);
  });

  // right-click or double-click the character to open the quick panel
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!panel.contains(e.clientX, e.clientY) && isOver(e.clientX, e.clientY)) togglePanel();
  });
  window.addEventListener("dblclick", (e) => {
    if (!bubble.contains(e.clientX, e.clientY) && !panel.contains(e.clientX, e.clientY) && isOver(e.clientX, e.clientY)) showPanel();
  });
  window.addEventListener("blur", () => { window.setTimeout(() => { if (panel.visible && !document.hasFocus()) panel.hide(); }, 200); });

  // ---------------------------------------------------------------- peek mode
  function glide(to: number) {
    lunge = { x0: x, x1: to, start: performance.now(), dur: 700 };
    facing = to >= x ? 1 : -1;
    wake();
  }

  function setPeek(on: boolean) {
    peekOut = false;
    moveTarget = null; sm.release("move");
    if (on) { sm.hold("peek", "peek", PRIORITY.stay); glide(peekX()); window.setTimeout(() => { facing = -1; lastDrawKey = ""; wake(); }, 750); }
    else { sm.release("peek"); glide(W * pos.x); scheduleWander(); }
  }

  /** Peek mode: step out for a reminder, then tuck back in. */
  function comeOut(out: boolean) {
    if (!settings.peekMode || peekOut === out) return;
    peekOut = out;
    if (out) { sm.release("peek"); glide(W - cw / 2 - 12); facing = -1; }
    else { sm.hold("peek", "peek", PRIORITY.stay); glide(peekX()); window.setTimeout(() => { facing = -1; lastDrawKey = ""; wake(); }, 750); }
  }

  // ---------------------------------------------------------------- agents
  function applyAgents() {
    window.clearTimeout(agentTimer);
    const now = performance.now();
    for (const [k, v] of agents) if (now - v.ts > AGENT_STALE_MS) agents.delete(k);
    const agg = aggregateAgents([...agents.values()].map((a) => a.state));
    if (agg === "idle" || agg === "completed") sm.release("agent");
    else sm.hold("agent", AGENT_ANIM[agg], PRIORITY.agent);
    if (agents.size) agentTimer = window.setTimeout(() => { applyAgents(); wake(); }, AGENT_STALE_MS + 100);
    updateNote();
  }

  function onAgentEvent(p: { agent: string; state: AgentStateName; detail?: string; bid?: string | null }) {
    if (!running) return;
    const a = settings.agent;
    const allowed = p.agent === "test" || (a.enabled && (a.agents[p.agent as keyof typeof a.agents] ?? a.agents.custom));
    if (!allowed) return;
    const now = performance.now();
    markActivity(now);
    if (p.bid) agentBid.set(p.agent, p.bid);
    const bid = p.bid ?? agentBid.get(p.agent);
    history.record({ agent: p.agent, state: p.state, bid }, Date.now());
    if (panel.visible) panel.render(history.list(Date.now()), settings.notify.language);
    if ((p.state === "thinking" || p.state === "working") && !agentStart.has(p.agent)) agentStart.set(p.agent, now);
    const took = agentStart.has(p.agent) ? (now - agentStart.get(p.agent)!) / 1000 : undefined;
    // PermissionRequest fires at once, Notification(permission_prompt) ~6 s later: one bubble is enough
    const repeat = p.state === "waiting" && agents.get(p.agent)?.state === "waiting";
    if (p.state === "completed" || p.state === "error" || p.state === "idle") agentStart.delete(p.agent);
    if (p.state !== "waiting") notifier.agentResumed(p.agent);
    if (p.state === "completed") {
      giveXp("agent");
      agents.set(p.agent, { state: "idle", ts: now });
      sm.pulse("agentDone", "happy", PRIORITY.agentDone, now, 3200);
      bump(0.2);
    } else {
      agents.set(p.agent, { state: p.state, ts: now });
      if (p.state === "error") {
        window.setTimeout(() => {
          if (agents.get(p.agent)?.state === "error") { agents.set(p.agent, { state: "idle", ts: performance.now() }); applyAgents(); wake(); }
        }, ERROR_MS);
      }
    }
    applyAgents();
    if ((p.state === "completed" || p.state === "error" || p.state === "waiting") && !repeat) notifier.agent(p.state, p.agent, took, p.detail, bid);
    wake();
  }

  // ---------------------------------------------------------------- settings / lifecycle
  async function loadCharacter(id: string) {
    bubble.setVoice(null);
    try {
      if ((await builtinCharacters()).some((b) => b.id === id)) sprite = await loadBuiltin(id);
      else {
        const c = await loadUserCharacter(id);
        sprite = await buildSprite(c.config, c.image);
        bubble.setVoice(c.sound ?? null);
        const missing = missingStates(sprite.cfg);
        if (missing.length) { console.warn(`character "${id}" is missing states: ${missing.join(", ")}`); sprite = await loadBuiltinCat(); }
      }
    } catch (err) {
      console.warn("character load failed, using default", err);
      sprite = await loadBuiltinCat(); id = "cat";
    }
    spriteId = id;
  }

  async function applySettings(next: Settings, first = false) {
    const prev = settings;
    if (next.bond.xp > bond.xp) bond = next.bond; // other windows never move it backwards
    settings = next;
    lastDrawKey = "";
    const wasRunning = running;
    running = next.enabled;
    if (!running) {
      pause();
      return;
    }
    if (first || next.character !== spriteId) await loadCharacter(next.character);
    if (first || !wasRunning || next.scale !== prev.scale || next.character !== prev.character) {
      canvas.style.display = "block";
    }
    const posChanged = Math.abs(next.position.x - pos.x) > 1e-4 || Math.abs(next.position.y - pos.y) > 1e-4;
    if (posChanged) pos = { ...next.position };
    if (next.peekMode !== prev.peekMode || first) {
      const before = x;
      layout();
      if (next.peekMode) { x = first ? peekX() : before; setPeek(true); }
      else if (!first) { x = before; setPeek(false); }
    } else layout();
    if (!wasRunning || first) resume();
    anim = sprite ? resolveAnim(sprite.cfg, state, next.fps) : null;
    updateRest();
    syncMusic();
    scheduleWander();
    notifier.sync();
    calendar.configure();
    focus.render();
    updateNote();
    wake();
  }

  function pause() {
    running = false;
    if (timer !== null) clearTimeout(timer);
    if (raf !== null) cancelAnimationFrame(raf);
    timer = raf = null;
    window.clearTimeout(restTimer); window.clearTimeout(wanderTimer); window.clearTimeout(agentTimer); window.clearTimeout(quirkTimer);
    restTimer = undefined;
    canvas.style.display = "none";
    panel.hide();
    notifier.stop();
    calendar.stop();
    musicFx.stop();
    focus.dispatch("stop");
    updateNote();
  }

  let musicSaid = false;
  function syncMusic() {
    if (!musicOn) musicSaid = false;
    if (running && musicOn && settings.musicDance) {
      const say = () => notifier.chat(pick(settings.notify.language, "music"), settings.notify.reactions, true);
      if (!musicSaid) { musicSaid = true; say(); }
    }
    if (running && musicOn && settings.musicDance) {
      const a = sprite && ["wiggle", "happy"].find((n) => hasAnim(sprite!.cfg, n));
      sm.hold("music", a ?? "idle", PRIORITY.music);
    } else { sm.release("music"); musicFx.stop(); }
    wake();
  }

  function resume() {
    running = true;
    canvas.style.display = "block";
    lastActivity = performance.now();
    lastStep = lastActivity;
    updateRest();
    scheduleWander();
    scheduleQuirk();
  }

  // events from Rust
  await listen<{ x: number; y: number }>("cursor", (e) => onCursor(e.payload.x, e.payload.y));
  await listen("key", () => {
    if (!running || !settings.keyboardInteraction) return;
    const now = performance.now();
    meter.hit(now);
    notifier.onKey(Date.now());
    sm.pulse("typing", "typing", PRIORITY.typing, now, 1400);
    if (meter.isFast(now)) sm.pulse("excited", "happy", PRIORITY.excited, now, 1600);
    markActivity(now);
    if (meter.isFast(now)) bump(0.02);
    wake();
  });
  await listen("scroll", () => {
    if (!running || !settings.mouseInteraction || peeking() || dragging) return;
    const now = performance.now();
    sm.pulse("scroll", "scroll", PRIORITY.typing, now, 900);
    markActivity(now);
    wake();
  });
  await listen<boolean>("music", (e) => { musicOn = !!e.payload; syncMusic(); });
  await listen<Settings>("settings-changed", (e) => { void applySettings(withDefaults(e.payload)); });
  await listen<{ agent: string; state: AgentStateName; detail?: string; bid?: string | null }>("agent-event", (e) => onAgentEvent(e.payload));
  await listen<string>("character-changed", (e) => {
    if (e.payload === spriteId) { void loadCharacter(spriteId).then(() => { layout(); wake(); }); }
  });
  await listen<string>("pet-action", (e) => {
    if (e.payload.startsWith("focus:")) { if (running) focus.dispatch(e.payload.slice(6) as FocusAction); return; }
    if (!running) return;
    const now = performance.now();
    if (e.payload === "jump") { markActivity(now); doJump(now); }
    if (e.payload === "toggle-sit") toggleSit(now);
    if (e.payload === "panel") togglePanel();
    if (e.payload.startsWith("say:")) notifier.say(e.payload.slice(4, 300));
    if (e.payload === "stretch-test") notifier.notice(pick(settings.notify.language, "stretch"), "stretch");
    if (e.payload === "reset-position") { x = W * pos.x; y = H * pos.y; clampPos(); place(); wake(); }
  });
  await listen("pet-refit", () => { layout(); });
  window.addEventListener("resize", layout);
  document.addEventListener("visibilitychange", () => { if (document.hidden) schedule(performance.now()); else wake(); });

  const initial = withDefaults(await invoke("get_settings"));
  pos = { ...initial.position };
  bond = initial.bond;
  await applySettings(initial, true);
  scheduleBlink();
  // Greet at most once every 3 hours, so relaunching the app doesn't repeat it.
  const greetDue = () => {
    try {
      const last = Number(localStorage.getItem("ww-last-greet") ?? 0);
      if (Date.now() - last < 3 * 3600_000) return false;
      localStorage.setItem("ww-last-greet", String(Date.now()));
    } catch { /* storage unavailable: greet */ }
    return true;
  };
  window.setTimeout(() => { if (greetDue()) notifier.greet(); giveXp("daily"); }, 3500);
  // Debug hook for development builds
  if (import.meta.env.DEV) (window as any).__pet = { sm, get state() { return state; } };
}
