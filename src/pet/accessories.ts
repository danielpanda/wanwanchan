/** Tiny pixel accessories drawn on top of a character's head (needs per-frame head anchors). */

const PALETTE: Record<string, string> = {
  D: "#7a3a55", R: "#ff6e96", K: "#ffd25a", B: "#3b2a4a", Y: "#ffd646", O: "#a06e1e", G: "#ff5a78",
  W: "#ffffff", S: "#e2506e", L: "#5ad2ff",
};

interface Art { rows: string[]; dx: number; dy: number }

/** dx/dy: offset of the art's top-left from the head centre, in frame pixels. */
export const ART: Record<string, Art> = {
  bow: { dx: 5, dy: -9, rows: [".DD.DD.", "DRRDRRD", "DRRKRRD", "DRRDRRD", ".DD.DD."] },
  glasses: {
    dx: -7, dy: -2,
    rows: ["BBBBB....BBBBB", "B...B....B...B", "B...BBBBBB...B", "B...B....B...B", "B...B....B...B", "BBBBB....BBBBB"],
  },
  scarf: {
    dx: -8, dy: 8,
    rows: ["DSSSSSSSSSSSSSSD", "SSWSSWSSWSSWSSWS", "DSSSSSSSSSSSSSSD"],
  },
  crown: { dx: -4, dy: -12, rows: ["Y...Y...Y", "YY.YYY.YY", "YYYYYYYYY", "YGYYLYYGY", "OOOOOOOOO"] },
};

const cache = new Map<string, HTMLCanvasElement>();

function artCanvas(id: string): HTMLCanvasElement | null {
  const a = ART[id];
  if (!a) return null;
  let c = cache.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = Math.max(...a.rows.map((r) => r.length));
    c.height = a.rows.length;
    const ctx = c.getContext("2d")!;
    a.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === ".") return;
      ctx.fillStyle = PALETTE[ch] ?? "#000";
      ctx.fillRect(x, y, 1, 1);
    }));
    cache.set(id, c);
  }
  return c;
}

/**
 * Draw accessories for one frame. `k` = canvas pixels per frame pixel, `anchor` = head centre in frame pixels.
 * When the sprite is mirrored the art is mirrored around the canvas centre as well.
 */
export function drawAccessories(
  ctx: CanvasRenderingContext2D, ids: string[], anchor: { x: number; y: number }, k: number, canvasW: number, flip: boolean,
) {
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.save(); ctx.translate(canvasW, 0); ctx.scale(-1, 1); }
  for (const id of ids) {
    const c = artCanvas(id), a = ART[id];
    if (!c || !a) continue;
    ctx.drawImage(c, (anchor.x + a.dx) * k, (anchor.y + a.dy) * k, c.width * k, c.height * k);
  }
  if (flip) ctx.restore();
}
