import { AGENT_LABEL } from "../shared/messages";
import { ago, type Run } from "./history";

const STATE: Record<Run["state"], { tag: string; id: string; en: string }> = {
  thinking: { tag: "...", id: "Berpikir", en: "Thinking" },
  working: { tag: "RUN", id: "Bekerja", en: "Working" },
  waiting: { tag: "WAIT", id: "Menunggu kamu", en: "Waiting for you" },
  completed: { tag: "OK", id: "Selesai", en: "Done" },
  error: { tag: "ERR", id: "Gagal", en: "Failed" },
  idle: { tag: "END", id: "Berakhir", en: "Ended" },
};

const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export interface PanelDeps {
  onOpenRun(run: Run): void;
  onSubmit(text: string): void;
  suggest(text: string): string[];
  onPick(app: string): void;
  onChip(key: "focus" | "sit" | "jump" | "settings"): void;
  onClose(): void;
}

/** Quick panel: recent agent runs, quick actions, and a box to ask the pet to open an app. */
export class Panel {
  private el = document.createElement("div");
  private list = document.createElement("div");
  private input = document.createElement("input");
  private hint = document.createElement("div");
  private sugg = document.createElement("div");
  private runs: Run[] = [];
  private lang: "id" | "en" = "id";
  visible = false;

  constructor(private d: PanelDeps) {
    const st = document.createElement("style");
    st.textContent = `
      #pm-panel{position:fixed;left:0;top:0;display:none;width:278px;padding:10px;background:#fffdf7;color:#3b2a2f;border:2px solid #5c363a;border-radius:12px;
        box-shadow:0 3px 0 #5c363a,0 8px 20px rgba(0,0,0,.3);font:600 12px/1.35 ui-rounded,-apple-system,sans-serif;z-index:20;user-select:none;-webkit-user-select:none}
      #pm-panel .hd{display:flex;justify-content:space-between;align-items:center;font-weight:800;margin-bottom:6px}
      #pm-panel .hd button{border:none;background:none;font-size:13px;cursor:pointer;color:#8a6a6e}
      #pm-panel .runs{max-height:180px;overflow:auto;margin-bottom:8px}
      #pm-panel .run{display:flex;gap:7px;align-items:center;padding:5px 6px;border-radius:8px}
      #pm-panel .run.go{cursor:pointer}#pm-panel .run.go:hover{background:#ffe9cf}
      #pm-panel .run .tag{font:800 9.5px ui-monospace,Menlo,monospace;padding:1px 4px;border-radius:4px;background:#f0e4d8;color:#5c363a}
      #pm-panel .run .t{flex:1;min-width:0}#pm-panel .run .s{font-weight:600;color:#8a6a6e;font-size:11px}
      #pm-panel .empty{padding:6px;color:#8a6a6e;font-weight:600}
      #pm-panel .chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
      #pm-panel .chips button,#pm-panel .sugg button{border:2px solid #5c363a;background:#fff;border-radius:8px;padding:1px 8px;font:700 11px ui-rounded,-apple-system,sans-serif;color:#3b2a2f;cursor:pointer}
      #pm-panel .chips button:hover,#pm-panel .sugg button:hover{background:#ffb067}
      #pm-panel input{width:100%;box-sizing:border-box;border:2px solid #5c363a;border-radius:9px;padding:5px 8px;font:600 12px ui-rounded,-apple-system,sans-serif;background:#fff;color:#3b2a2f;outline:none;-webkit-user-select:text;user-select:text}
      #pm-panel input:focus{border-color:#ff8a3d}
      #pm-panel .hint{margin-top:5px;color:#8a6a6e;font-weight:600;min-height:14px}
      #pm-panel .sugg{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}`;
    document.head.appendChild(st);
    this.el.id = "pm-panel";
    this.el.innerHTML = `<div class="hd"><b class="ttl"></b><button class="x" title="Close">✕</button></div>`;
    this.list.className = "runs";
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const [key, label] of [["focus", "Focus"], ["sit", "Sit"], ["jump", "Jump"], ["settings", "Settings"]] as const) {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = () => d.onChip(key);
      chips.appendChild(b);
    }
    this.input.spellcheck = false;
    this.input.autocomplete = "off";
    this.hint.className = "hint";
    this.sugg.className = "sugg";
    this.el.append(this.list, chips, this.input, this.hint, this.sugg);
    this.el.querySelector<HTMLButtonElement>(".x")!.onclick = () => this.hide();
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.input.addEventListener("input", () => this.showSuggestions(this.input.value));
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.hide();
      else if (e.key === "Enter" && this.input.value.trim()) d.onSubmit(this.input.value);
    });
    document.body.appendChild(this.el);
  }

  show(runs: Run[], lang: "id" | "en") {
    this.visible = true;
    this.el.style.display = "block";
    this.input.placeholder = lang === "id" ? "Minta aku buka aplikasi… (buka Cursor)" : "Ask me to open an app… (open Cursor)";
    this.input.value = "";
    this.hint.textContent = "";
    this.sugg.replaceChildren();
    this.render(runs, lang);
    setTimeout(() => this.input.focus(), 60);
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.style.display = "none";
    this.d.onClose();
  }

  render(runs: Run[], lang: "id" | "en") {
    this.runs = runs; this.lang = lang;
    this.el.querySelector<HTMLElement>(".ttl")!.textContent = lang === "id" ? "Agent terbaru" : "Recent agents";
    const now = Date.now();
    this.list.replaceChildren();
    if (!runs.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = lang === "id" ? "Belum ada aktivitas agent. Hubungkan tool di Settings → AI Integration." : "No agent activity yet. Connect tools in Settings → AI Integration.";
      this.list.appendChild(e);
    }
    for (const r of runs.slice(0, 8)) {
      const row = document.createElement("div");
      row.className = "run" + (r.bid ? " go" : "");
      const end = r.end;
      const info = end === undefined ? fmtDur(now - r.start) : end - r.start >= 2000 ? `${fmtDur(end - r.start)} · ${ago(now - end, lang)}` : ago(now - end, lang);
      row.innerHTML = `<span class="tag">${STATE[r.state].tag}</span><div class="t"><div>${AGENT_LABEL[r.agent] ?? r.agent}</div><div class="s"></div></div>${r.bid ? "<span>↗</span>" : ""}`;
      row.querySelector<HTMLElement>(".s")!.textContent = `${STATE[r.state][lang]} · ${info}`;
      if (r.bid) row.onclick = () => this.d.onOpenRun(r);
      this.list.appendChild(row);
    }
  }

  setHint(text: string) { this.hint.textContent = text; }

  showSuggestions(text: string, forced?: string[]) {
    const names = forced ?? this.d.suggest(text);
    this.sugg.replaceChildren();
    for (const n of names.slice(0, 5)) {
      const b = document.createElement("button");
      b.textContent = n;
      b.onclick = () => this.d.onPick(n);
      this.sugg.appendChild(b);
    }
  }

  position(cx: number, top: number, bottom: number, W: number) {
    if (!this.visible) return;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    const left = Math.min(Math.max(8, cx - w / 2), Math.max(8, W - w - 8));
    const above = top - h - 12 >= 6;
    this.el.style.transform = `translate3d(${Math.round(left)}px,${Math.round(above ? top - h - 12 : bottom + 12)}px,0)`;
  }

  contains(x: number, y: number): boolean {
    if (!this.visible) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  get currentRuns() { return this.runs; }
  get language() { return this.lang; }
}
