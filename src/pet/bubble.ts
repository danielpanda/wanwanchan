export interface BubbleButton { label: string; primary?: boolean; onClick: () => void }

/** Pixel-style speech bubble living in the (click-through) pet window. */
export class Bubble {
  private el: HTMLDivElement;
  private textEl: HTMLDivElement;
  private btns: HTMLDivElement;
  private typer: number | undefined;
  private hideTimer: number | undefined;
  private onClose: (() => void) | null = null;
  private onBody: (() => void) | null = null;
  private audio: AudioContext | null = null;
  private voice: HTMLAudioElement | null = null;
  visible = false;

  constructor() {
    const style = document.createElement("style");
    style.textContent = `
      #pm-bubble{position:fixed;left:0;top:0;display:none;max-width:230px;min-width:70px;padding:9px 11px 8px;background:#fffdf7;color:#3b2a2f;
        font:600 12.5px/1.35 ui-rounded,"SF Pro Rounded",-apple-system,sans-serif;white-space:pre-line;overflow-wrap:anywhere;border-radius:10px;border:2px solid #5c363a;
        box-shadow:0 3px 0 #5c363a,0 6px 14px rgba(0,0,0,.28);user-select:none;-webkit-user-select:none;cursor:default;will-change:transform;z-index:10}
      #pm-bubble::after{content:"";position:absolute;left:var(--tail,50%);width:9px;height:9px;background:#fffdf7;border:2px solid #5c363a;
        border-top:none;border-left:none;transform:translateX(-50%) rotate(45deg)}
      #pm-bubble[data-pos="above"]::after{bottom:-6px}
      #pm-bubble[data-pos="below"]::after{top:-6px;transform:translateX(-50%) rotate(225deg)}
      #pm-bubble .btns{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
      #pm-bubble button{font:700 11px ui-rounded,-apple-system,sans-serif;padding:2px 9px;border-radius:7px;border:2px solid #5c363a;background:#fff;color:#3b2a2f;cursor:pointer}
      #pm-bubble button.primary{background:#ffb067}
      #pm-bubble button:active{transform:translateY(1px)}
      #pm-bubble.pop{animation:pm-pop .22s cubic-bezier(.3,1.6,.5,1)}
      @keyframes pm-pop{from{opacity:0;scale:.6}to{opacity:1;scale:1}}`;
    document.head.appendChild(style);
    this.el = document.createElement("div");
    this.el.id = "pm-bubble";
    this.textEl = document.createElement("div");
    this.btns = document.createElement("div");
    this.btns.className = "btns";
    this.el.append(this.textEl, this.btns);
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      const go = this.onBody;
      this.hide();
      go?.();
    });
    document.body.appendChild(this.el);
  }

  show(text: string, opts: { buttons?: BubbleButton[]; seconds: number; sound?: boolean; onClose?: () => void; onClick?: () => void }) {
    this.hide();
    this.onClose = opts.onClose ?? null;
    this.onBody = opts.onClick ?? null;
    this.el.style.cursor = opts.onClick ? "pointer" : "default";
    this.btns.replaceChildren();
    for (const b of opts.buttons ?? []) {
      const el = document.createElement("button");
      el.textContent = b.label;
      if (b.primary) el.className = "primary";
      el.onclick = () => { b.onClick(); };
      this.btns.appendChild(el);
    }
    this.btns.style.display = opts.buttons?.length ? "flex" : "none";
    // typewriter reveal
    const chars = Array.from(text);
    this.textEl.textContent = "";
    let i = 0;
    this.typer = window.setInterval(() => {
      this.textEl.textContent = chars.slice(0, ++i).join("");
      if (i >= chars.length) { clearInterval(this.typer); this.typer = undefined; }
    }, 28);
    this.el.style.display = "block";
    this.el.classList.remove("pop"); void this.el.offsetWidth; this.el.classList.add("pop");
    this.visible = true;
    this.hideTimer = window.setTimeout(() => this.hide(), Math.max(2, opts.seconds) * 1000);
    if (opts.sound) this.blip();
    // reserve the final size immediately so the layout doesn't jump while typing
    this.textEl.style.minHeight = "";
    const probe = this.textEl.textContent;
    this.textEl.textContent = text;
    this.textEl.style.minHeight = `${this.textEl.offsetHeight}px`;
    this.textEl.style.minWidth = `${Math.min(210, this.textEl.offsetWidth)}px`;
    this.textEl.textContent = probe;
  }

  hide() {
    if (this.typer) clearInterval(this.typer);
    window.clearTimeout(this.hideTimer);
    this.typer = this.hideTimer = undefined;
    if (!this.visible) return;
    this.visible = false;
    this.el.style.display = "none";
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  /** Place above the character (or below when there is no room), pointing at its centre. */
  position(cx: number, top: number, bottom: number, W: number) {
    if (!this.visible) return;
    const bw = this.el.offsetWidth, bh = this.el.offsetHeight;
    const left = Math.min(Math.max(8, cx - bw / 2), Math.max(8, W - bw - 8));
    const above = top - bh - 12 >= 6;
    const y = above ? top - bh - 12 : bottom + 12;
    this.el.dataset.pos = above ? "above" : "below";
    this.el.style.setProperty("--tail", `${Math.min(bw - 14, Math.max(14, cx - left))}px`);
    this.el.style.transform = `translate3d(${Math.round(left)}px,${Math.round(y)}px,0)`;
  }

  contains(x: number, y: number): boolean {
    if (!this.visible) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 10;
  }

  /** Custom bubble sound of the current character (data URL); null = synthesized bark. */
  setVoice(url: string | null) { this.voice = url ? new Audio(url) : null; }

  /** Custom voice if the character has one, else a synthesized "woof-woof": short sawtooth barks with a falling pitch and a noise burst, low-passed. */
  private blip() {
    if (this.voice) { this.voice.currentTime = 0; void this.voice.play().catch(() => {}); return; }
    try {
      this.audio ??= new AudioContext();
      const a = this.audio;
      if (a.state === "suspended") void a.resume();
      const v = 0.9 + Math.random() * 0.2;
      const noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.12), a.sampleRate);
      const ch = noise.getChannelData(0);
      for (let k = 0; k < ch.length; k++) ch[k] = Math.random() * 2 - 1;
      for (const t of [a.currentTime, a.currentTime + 0.2]) {
        const dur = 0.13;
        const lp = a.createBiquadFilter();
        lp.type = "lowpass"; lp.Q.value = 4;
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(600, t + dur);
        const out = a.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        lp.connect(out).connect(a.destination);
        const o = a.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(560 * v, t);
        o.frequency.exponentialRampToValueAtTime(210 * v, t + dur);
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.02);
        const n = a.createBufferSource(), ng = a.createGain();
        n.buffer = noise; ng.gain.value = 0.35;
        n.connect(ng).connect(lp);
        n.start(t); n.stop(t + 0.05);
      }
    } catch { /* audio is optional */ }
  }
}
