const NOTES = ["♪", "♫", "♬", "♩"];
const COLORS = ["#ff7eb6", "#7ec8ff", "#ffd36e", "#9be7a3", "#c9a2ff"];

/** Floating music notes that drift up from beside the character while music plays. */
export class MusicFx {
  private layer: HTMLDivElement;
  private timer: ReturnType<typeof setInterval> | undefined;
  private cx = 0;
  private top = 0;
  private w = 0;

  constructor() {
    const style = document.createElement("style");
    style.textContent = `@keyframes pm-note{0%{opacity:0;transform:translate(0,0) scale(.6) rotate(-10deg)}
      15%{opacity:1}100%{opacity:0;transform:translate(var(--dx),-64px) scale(1.15) rotate(14deg)}}`;
    document.head.appendChild(style);
    this.layer = document.createElement("div");
    Object.assign(this.layer.style, { position: "fixed", left: "0", top: "0", pointerEvents: "none", display: "none", zIndex: "2147483000" } as CSSStyleDeclaration);
    document.body.appendChild(this.layer);
  }

  get active() { return this.timer !== undefined; }

  start() {
    if (this.timer !== undefined) return;
    this.layer.style.display = "block";
    this.spawn();
    this.timer = setInterval(() => this.spawn(), 500);
  }

  stop() {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.layer.style.display = "none";
    this.layer.replaceChildren();
  }

  /** `cx` = character centre x, `top` = top edge y, `w` = character width (all CSS px). */
  position(cx: number, top: number, w: number) {
    this.cx = cx; this.top = top; this.w = w;
  }

  private spawn() {
    const n = document.createElement("div");
    const side = Math.random() < 0.5 ? -1 : 1;
    const size = Math.round(Math.min(26, Math.max(14, this.w * 0.28)));
    n.textContent = NOTES[Math.floor(Math.random() * NOTES.length)];
    Object.assign(n.style, {
      position: "fixed",
      left: `${this.cx + side * (this.w * 0.55) - size / 2 + (Math.random() - 0.5) * 8}px`,
      top: `${this.top + this.w * 0.35 + Math.random() * this.w * 0.4}px`,
      font: `700 ${size}px ui-rounded,-apple-system,sans-serif`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      textShadow: "0 1px 2px rgba(0,0,0,.35)",
      opacity: "0",
      animation: "pm-note 1.9s ease-out forwards",
    } as CSSStyleDeclaration);
    n.style.setProperty("--dx", `${side * (6 + Math.random() * 16)}px`);
    this.layer.appendChild(n);
    setTimeout(() => n.remove(), 2000);
  }
}
