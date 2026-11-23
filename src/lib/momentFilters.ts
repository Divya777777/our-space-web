// Moment filters: one tap each, no sliders, never a beauty filter.
// Pure pixel maths on RGBA, so the website (canvas) and the phone app (jpeg-js) make exactly the same photo.
// Same file in web/src/lib/momentFilters.ts and mobile/src/lib/momentFilters.ts — keep them identical.

export type FilterId = 'original' | 'warm' | 'film' | 'mono' | 'night' | 'dreamy' | 'polaroid' | 'kira' | 'spell' | 'cinema';
export type Img = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
type Rgb = [number, number, number];
type Op = ['sepia' | 'saturate' | 'hue' | 'contrast' | 'brightness', number];
type Recipe = {
  ops: Op[];
  tint?: { color: Rgb; alpha: number; mode?: 'normal' | 'multiply' };
  glow?: { color: Rgb; alpha: number; cx: number; cy: number; radius: number };
  gradient?: { top: Rgb; topAlpha: number; bottom: Rgb; bottomAlpha: number };
  vignette?: { color: Rgb; alpha: number; start: number };
  grain?: number;
  letterbox?: number;
  frame?: boolean;
  sparkles?: boolean;
};
export type FilterDef = { id: FilterId; name: string; plus: boolean; note: string };

export const FILTERS: FilterDef[] = [
  { id: 'original', name: 'Original', plus: false, note: 'As shot.' },
  { id: 'warm', name: 'Warm', plus: false, note: 'Golden skin tones, cosy rooms.' },
  { id: 'film', name: 'Film', plus: false, note: 'Faded blacks and fine grain.' },
  { id: 'mono', name: 'Mono', plus: false, note: 'Black and white, a little punch.' },
  { id: 'night', name: 'Night', plus: false, note: 'Navy tint in Our Space colours.' },
  { id: 'dreamy', name: 'Dreamy', plus: true, note: 'Soft lavender glow.' },
  { id: 'polaroid', name: 'Polaroid', plus: true, note: 'White instant-photo frame.' },
  { id: 'kira', name: 'Kira Kira', plus: true, note: 'Pastel sky and sparkles.' },
  { id: 'spell', name: 'Spellbound', plus: true, note: 'Candle gold with a vignette.' },
  { id: 'cinema', name: 'Cinema', plus: true, note: 'Letterbox bars.' },
];

const RECIPES: Record<FilterId, Recipe> = {
  original: { ops: [] },
  warm: { ops: [['sepia', 0.22], ['saturate', 1.35], ['brightness', 1.05]], tint: { color: [255, 170, 90], alpha: 0.12 } },
  film: { ops: [['contrast', 0.88], ['brightness', 1.08], ['saturate', 0.78], ['sepia', 0.18]], grain: 8 },
  mono: { ops: [['saturate', 0], ['contrast', 1.15]] },
  night: { ops: [['brightness', 0.82], ['saturate', 0.7], ['contrast', 1.05]], tint: { color: [40, 50, 140], alpha: 0.32 } },
  dreamy: { ops: [['brightness', 1.08], ['saturate', 1.15]], glow: { color: [200, 182, 255], alpha: 0.4, cx: 0.5, cy: 0.4, radius: 0.75 } },
  polaroid: { ops: [['contrast', 1.05], ['saturate', 0.9], ['sepia', 0.1]], frame: true },
  kira: { ops: [['saturate', 1.45], ['brightness', 1.1], ['hue', -12]], gradient: { top: [255, 170, 210], topAlpha: 0.25, bottom: [140, 200, 255], bottomAlpha: 0.2 }, sparkles: true },
  spell: { ops: [['sepia', 0.45], ['saturate', 1.2], ['brightness', 0.92]], vignette: { color: [40, 10, 30], alpha: 0.7, start: 0.4 } },
  cinema: { ops: [['contrast', 1.12], ['saturate', 0.85]], letterbox: 0.11 },
};

export const filterById = (id: string): FilterDef => FILTERS.find(f => f.id === id) || FILTERS[0];

// 3×4 colour matrices (r' = m0 r + m1 g + m2 b + m3, on 0–255), the same maths as CSS filter functions.
type M = number[];
const ID: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function opMatrix([kind, a]: Op): M {
  switch (kind) {
    case 'sepia': { const k = 1 - Math.min(1, a); return [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0]; }
    case 'saturate': return [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0, 0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0, 0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0];
    case 'hue': {
      const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0];
    }
    case 'contrast': { const o = 255 * (0.5 - 0.5 * a); return [a, 0, 0, o, 0, a, 0, o, 0, 0, a, o]; }
    case 'brightness': return [a, 0, 0, 0, 0, a, 0, 0, 0, 0, a, 0];
  }
}
/** b applied first, then a. */
function compose(a: M, b: M): M {
  const out: M = new Array(12).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) out[row * 4 + col] = a[row * 4] * b[col] + a[row * 4 + 1] * b[4 + col] + a[row * 4 + 2] * b[8 + col];
    out[row * 4 + 3] = a[row * 4] * b[3] + a[row * 4 + 1] * b[7] + a[row * 4 + 2] * b[11] + a[row * 4 + 3];
  }
  return out;
}
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** A filtered copy of the photo (Polaroid makes it a little bigger: the frame). */
export function applyFilter(src: Img, id: FilterId): Img {
  const recipe = RECIPES[id] || RECIPES.original;
  const { width: w, height: h } = src;
  const d = new Uint8ClampedArray(src.data.length);
  d.set(src.data);
  let m = ID;
  for (const op of recipe.ops) m = compose(opMatrix(op), m);
  const identity = recipe.ops.length === 0;
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const diag = Math.hypot(0.5, 0.5);
  for (let y = 0; y < h; y++) {
    const fy = y / (h - 1 || 1);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (!identity) {
        const nr = m[0] * r + m[1] * g + m[2] * b + m[3];
        const ng = m[4] * r + m[5] * g + m[6] * b + m[7];
        const nb = m[8] * r + m[9] * g + m[10] * b + m[11];
        r = clamp(nr); g = clamp(ng); b = clamp(nb);
      }
      if (recipe.tint) {
        const { color: c, alpha: a, mode } = recipe.tint;
        if (mode === 'multiply') { r = r * (1 - a) + (r * c[0] / 255) * a; g = g * (1 - a) + (g * c[1] / 255) * a; b = b * (1 - a) + (b * c[2] / 255) * a; }
        else { r = r * (1 - a) + c[0] * a; g = g * (1 - a) + c[1] * a; b = b * (1 - a) + c[2] * a; }
      }
      if (recipe.gradient) {
        const q = recipe.gradient;
        const a = q.topAlpha * (1 - fy) + q.bottomAlpha * fy;
        const c0 = q.top[0] * (1 - fy) + q.bottom[0] * fy, c1 = q.top[1] * (1 - fy) + q.bottom[1] * fy, c2 = q.top[2] * (1 - fy) + q.bottom[2] * fy;
        r = r * (1 - a) + c0 * a; g = g * (1 - a) + c1 * a; b = b * (1 - a) + c2 * a;
      }
      if (recipe.glow) {
        const q = recipe.glow;
        const dist = Math.hypot(x / w - q.cx, fy - q.cy) / q.radius;
        const a = dist < 1 ? q.alpha * (1 - dist) : 0;
        if (a > 0) { // screen blend
          r = r + (255 - r) * (q.color[0] / 255) * a; g = g + (255 - g) * (q.color[1] / 255) * a; b = b + (255 - b) * (q.color[2] / 255) * a;
        }
      }
      if (recipe.vignette) {
        const q = recipe.vignette;
        const dist = Math.hypot(x / w - 0.5, fy - 0.5) / diag;
        const t = dist <= q.start ? 0 : Math.min(1, (dist - q.start) / (1 - q.start));
        const a = q.alpha * t * t;
        r = r * (1 - a) + q.color[0] * a; g = g * (1 - a) + q.color[1] * a; b = b * (1 - a) + q.color[2] * a;
      }
      if (recipe.grain) { const n = (rnd() - 0.5) * 2 * recipe.grain; r += n; g += n; b += n; }
      d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
    }
  }
  let out: Img = { width: w, height: h, data: d };
  if (recipe.letterbox) {
    const bar = Math.round(h * recipe.letterbox);
    for (let y = 0; y < h; y++) if (y < bar || y >= h - bar) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; }
  }
  if (recipe.sparkles) sparkle(out);
  if (recipe.frame) out = polaroid(out);
  return out;
}

function sparkle(img: Img) {
  const { width: w, height: h, data: d } = img;
  const stars: [number, number, number][] = [[0.16, 0.12, 0.05], [0.82, 0.2, 0.035], [0.7, 0.08, 0.025], [0.1, 0.42, 0.03], [0.88, 0.5, 0.045], [0.3, 0.27, 0.02]];
  for (const [sx, sy, sr] of stars) {
    const cx = Math.round(sx * w), cy = Math.round(sy * h), R = Math.max(4, Math.round(sr * w));
    const thin = Math.max(1, R * 0.16);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const arm = (p: number, q: number) => Math.max(0, 1 - Math.abs(p) / R) * Math.max(0, 1 - Math.abs(q) / thin);
      const a = Math.min(1, Math.max(arm(dx, dy), arm(dy, dx)) * 1.4) * 0.92;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      d[i] = d[i] + (255 - d[i]) * a; d[i + 1] = d[i + 1] + (244 - d[i + 1]) * a; d[i + 2] = d[i + 2] + (251 - d[i + 2]) * a;
    }
  }
}

function polaroid(img: Img): Img {
  const side = Math.round(img.width * 0.045), bottom = Math.round(img.width * 0.17);
  const W = img.width + side * 2, H = img.height + side + bottom;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { out[i * 4] = 247; out[i * 4 + 1] = 243; out[i * 4 + 2] = 234; out[i * 4 + 3] = 255; }
  for (let y = 0; y < img.height; y++) out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + side) * W + side) * 4);
  return { width: W, height: H, data: out };
}

/** Smaller copy (box average when shrinking a lot, so thumbnails stay smooth). Never enlarges. */
export function resize(src: Img, maxW: number, maxH: number): Img {
  const scale = Math.min(1, maxW / src.width, maxH / src.height);
  if (scale >= 1) return src;
  const W = Math.max(1, Math.round(src.width * scale)), H = Math.max(1, Math.round(src.height * scale));
  const out = new Uint8ClampedArray(W * H * 4);
  const fx = src.width / W, fy = src.height / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { const i = (yy * src.width + xx) * 4; r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++; }
      const o = (y * W + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

/** "Dual": the selfie as a small rounded picture with a white edge in the top-left corner of the main photo. */
export function insetSelfie(main: Img, selfie: Img): Img {
  const d = new Uint8ClampedArray(main.data.length); d.set(main.data);
  const iw = Math.round(main.width * 0.3), ih = Math.round(iw * (selfie.height / selfie.width));
  const small = resize(selfie, iw, ih);
  const ox = Math.round(main.width * 0.04), oy = Math.round(main.width * 0.04);
  const border = Math.max(3, Math.round(main.width * 0.008)), radius = Math.round(iw * 0.14);
  const inside = (x: number, y: number, w: number, h: number, r: number) => {
    const cx = x < r ? r : x > w - r ? w - r : x, cy = y < r ? r : y > h - r ? h - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const W = small.width + border * 2, H = small.height + border * 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = ox + x, ty = oy + y;
    if (tx >= main.width || ty >= main.height || !inside(x, y, W, H, radius + border)) continue;
    const o = (ty * main.width + tx) * 4;
    const sx = x - border, sy = y - border;
    if (sx >= 0 && sy >= 0 && sx < small.width && sy < small.height && inside(sx, sy, small.width, small.height, radius)) {
      const i = (sy * small.width + sx) * 4; d[o] = small.data[i]; d[o + 1] = small.data[i + 1]; d[o + 2] = small.data[i + 2];
    } else { d[o] = 244; d[o + 1] = 241; d[o + 2] = 234; }
    d[o + 3] = 255;
  }
  return { width: main.width, height: main.height, data: d };
}
