import type { AdInputs, Brand } from "../types";
import { oemTitle } from "../oem";

/** Every ad is authored at 1080×1920 and scaled to whatever canvas it lands on. */
export const W = 1080;
export const H = 1920;

export type Assets = {
  logo: HTMLImageElement | null;
  car: HTMLImageElement | null;
  plate: HTMLVideoElement | HTMLImageElement | null;
  /** Second photo for templates that want two vehicles. */
  car2: HTMLImageElement | null;
  /** Pro-spot background scene and the car cut out of its photo. */
  scene?: HTMLImageElement | null;
  cut?: HTMLCanvasElement | null;
};

export type Scene = {
  ctx: CanvasRenderingContext2D;
  t: number;
  dur: number;
  brand: Brand;
  ad: AdInputs;
  a: Assets;
  font: string;
  /** Template params: hook copy, palette, per-engine knobs. */
  p: Record<string, unknown> & { hook?: string; mode?: "light" | "dark" | "brand" };
};

// ---------- maths ----------

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
export const easeIn = (k: number) => k * k * k;
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOutBack = (k: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
export const easeOutElastic = (k: number) =>
  k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;

export function rand(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- colour ----------

export function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [37, 99, 235];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export function shade(hex: string, amt: number) {
  const [r, g, b] = hexRgb(hex);
  const f = (c: number) => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function luminance(hex: string) {
  const [r, g, b] = hexRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const onColor = (hex: string) => (luminance(hex) > 0.45 ? "#0a0b0d" : "#ffffff");

export const INK = "#0a0b0d";
export const PAPER = "#ffffff";

export function theme(s: Scene) {
  const primary = s.brand.colors.primary;
  const mode = s.p.mode ?? "light";
  if (mode === "dark") return { mode, bg: "#08090c", fg: "#ffffff", sub: "rgba(255,255,255,.6)", card: "#14161c", primary };
  if (mode === "brand") return { mode, bg: primary, fg: onColor(primary), sub: rgba(onColor(primary), 0.7), card: shade(primary, -0.25), primary };
  return { mode, bg: "#ffffff", fg: INK, sub: "rgba(10,11,13,.55)", card: "#f3f4f6", primary };
}

// ---------- copy ----------

export function fill(str: string, s: Scene): string {
  const b = s.brand;
  return str
    .replaceAll("{dealer}", b.name)
    .replaceAll("{city}", b.city ?? "town")
    .replaceAll("{offer}", s.ad.offer)
    .replaceAll("{vehicle}", s.ad.vehicleName || "your next car")
    .replaceAll("{make}", b.makes[0] ?? "car")
    .replaceAll("{cta}", s.ad.cta);
}

/** A short, punchy form of the offer for tight spaces like wheel slices. */
export function shortOffer(s: Scene): string {
  const o = s.ad.offer;
  const money = o.match(/\$\s?[\d,]+(\.\d+)?\s*(\/\s?mo|down|off)?/i)?.[0];
  const pct = o.match(/\d+(\.\d+)?%\s*APR/i)?.[0];
  return (money || pct || o.split(/\s+/).slice(0, 3).join(" ")).replace(/\s+/g, " ");
}

// ---------- primitives ----------

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export function fillBg(s: Scene, color: string) {
  s.ctx.fillStyle = color;
  s.ctx.fillRect(0, 0, W, H);
}

type Src = CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number };

function dims(img: Src): [number, number] {
  const w = img.videoWidth || img.naturalWidth || (img.width as number) || 1;
  const h = img.videoHeight || img.naturalHeight || (img.height as number) || 1;
  return [w, h];
}

/** object-fit: cover, with a zoom and a focal point. */
export function cover(
  ctx: CanvasRenderingContext2D,
  img: Src | null,
  x: number,
  y: number,
  w: number,
  h: number,
  zoom = 1,
  fx = 0.5,
  fy = 0.5
) {
  if (!img) return;
  const [iw, ih] = dims(img);
  if (iw < 2 || ih < 2) return;
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
}

export function contain(ctx: CanvasRenderingContext2D, img: Src | null, x: number, y: number, w: number, h: number) {
  if (!img) return;
  const [iw, ih] = dims(img);
  if (iw < 2) return;
  const scale = Math.min(w / iw, h / ih);
  ctx.drawImage(img, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
}

export type TextOpts = {
  size: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  maxW?: number;
  lineH?: number;
  font?: string;
  tracking?: number;
  baseline?: CanvasTextBaseline;
  alpha?: number;
};

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/**
 * Display copy in capitals, unless the dealer's make is covered by the OEM kit
 * (§0: never uppercase for style): then title case with the manufacturers' spellings.
 */
export function shout(s: Scene, t: string) {
  return s.brand.compliance?.noCaps ? oemTitle(t) : t.toUpperCase();
}

/**
 * Fine print, verbatim and complete (OEM kit §7.8): the largest size from `max`
 * down to `min` (13px on the 1080 frame) at which every line fits between `top`
 * and `bottom`; below that floor the block grows upward instead of being cut.
 * Returns the y the block starts at.
 */
export function finePrint(s: Scene, text: string, o: { top: number; bottom: number; x: number; width: number; align?: CanvasTextAlign; color: string; max?: number; min?: number; weight?: number }) {
  const { ctx } = s;
  if (!text?.trim()) return o.top;
  const max = o.max ?? 24;
  const min = o.min ?? 13;
  let size = max;
  let lines: string[] = [];
  for (; size >= min; size -= 1) {
    setFont(s, size, o.weight ?? 500);
    lines = wrap(ctx, text, o.width);
    if (lines.length * size * 1.28 <= o.bottom - o.top) break;
  }
  size = Math.max(size, min);
  setFont(s, size, o.weight ?? 500);
  lines = wrap(ctx, text, o.width);
  const lh = size * 1.28;
  const top = Math.min(o.top, o.bottom - lines.length * lh);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, o.x, top + i * lh));
  return top;
}

export function setFont(s: Scene, size: number, weight = 700, family?: string) {
  s.ctx.font = `${weight} ${size}px ${family ?? s.font}`;
}

/** Draws wrapped text; returns the block height. */
export function text(s: Scene, str: string, x: number, y: number, o: TextOpts): number {
  const ctx = s.ctx;
  ctx.save();
  setFont(s, o.size, o.weight ?? 700, o.font);
  ctx.fillStyle = o.color ?? INK;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = o.baseline ?? "top";
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.tracking) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.tracking}px`;
  const lines = o.maxW ? wrap(ctx, str, o.maxW) : str.split("\n");
  const lh = o.lineH ?? o.size * 1.08;
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  ctx.restore();
  return lines.length * lh;
}

export function measure(s: Scene, str: string, size: number, weight = 700, maxW?: number) {
  setFont(s, size, weight);
  if (!maxW) return { w: s.ctx.measureText(str).width, lines: 1 };
  const lines = wrap(s.ctx, str, maxW);
  return { w: Math.max(...lines.map((l) => s.ctx.measureText(l).width)), lines: lines.length };
}

/**
 * TikTok's native "text with background" caption: each line gets its own
 * rounded plate. Instantly reads as native content, not an ad.
 */
export function capText(
  s: Scene,
  str: string,
  y: number,
  o: { size?: number; bg?: string; fg?: string; k?: number; maxW?: number } = {}
) {
  const ctx = s.ctx;
  const size = o.size ?? 64;
  const k = o.k ?? 1;
  if (k <= 0) return 0;
  ctx.save();
  setFont(s, size, 800);
  const lines = wrap(ctx, str, o.maxW ?? 860);
  const lh = size * 1.32;
  const scale = lerp(0.85, 1, easeOutBack(clamp(k)));
  ctx.globalAlpha *= clamp(k * 1.6);
  ctx.translate(W / 2, y);
  ctx.scale(scale, scale);
  lines.forEach((l, i) => {
    const w = ctx.measureText(l).width + size * 0.7;
    ctx.fillStyle = o.bg ?? "#ffffff";
    rr(ctx, -w / 2, i * lh - size * 0.18, w, size * 1.36, size * 0.28);
    ctx.fill();
  });
  ctx.fillStyle = o.fg ?? INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, 0, i * lh + size * 0.02));
  ctx.restore();
  return lines.length * lh;
}

/** Bold white text with a heavy outline — the meme/caption look. */
export function outlineText(s: Scene, str: string, y: number, size = 92, k = 1, maxW = 920) {
  if (k <= 0) return;
  const ctx = s.ctx;
  ctx.save();
  setFont(s, size, 900);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  const lines = wrap(ctx, str, maxW);
  const sc = lerp(1.25, 1, easeOutBack(clamp(k)));
  ctx.globalAlpha *= clamp(k * 2);
  ctx.translate(W / 2, y);
  ctx.scale(sc, sc);
  lines.forEach((l, i) => {
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = "#000";
    ctx.strokeText(l, 0, i * size * 1.06);
    ctx.fillStyle = "#fff";
    ctx.fillText(l, 0, i * size * 1.06);
  });
  ctx.restore();
}

/** Word-by-word pop-in, one word every `rate` seconds from t0. */
export function popWords(
  s: Scene,
  str: string,
  t0: number,
  y: number,
  o: { size?: number; color?: string; rate?: number; maxW?: number; weight?: number; accent?: string } = {}
) {
  const ctx = s.ctx;
  const size = o.size ?? 96;
  const rate = o.rate ?? 0.12;
  ctx.save();
  setFont(s, size, o.weight ?? 800);
  const lines = wrap(ctx, str, o.maxW ?? 900);
  let idx = 0;
  const lh = size * 1.1;
  lines.forEach((line, li) => {
    const words = line.split(" ");
    const total = ctx.measureText(line).width;
    let x = W / 2 - total / 2;
    for (const w of words) {
      const k = prog(s.t, t0 + idx * rate, t0 + idx * rate + 0.28);
      const ww = ctx.measureText(w + " ").width;
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha *= clamp(k * 2);
        const sc = lerp(0.6, 1, easeOutBack(k));
        ctx.translate(x + ww / 2, y + li * lh + size / 2 + (1 - easeOut(k)) * 30);
        ctx.scale(sc, sc);
        ctx.fillStyle = /[$%]|\d/.test(w) && o.accent ? o.accent : o.color ?? INK;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(w, 0, 0);
        ctx.restore();
      }
      x += ww;
      idx++;
    }
  });
  ctx.restore();
  return lines.length * lh;
}

// ---------- brand furniture ----------

/** Dealer logo inside a white pill — logos are unpredictable, white is always safe. */
export function logoPill(s: Scene, cx: number, cy: number, h = 110, k = 1, shadow = true) {
  if (k <= 0) return;
  const ctx = s.ctx;
  const logo = s.a.logo;
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.5);
  const sc = lerp(0.8, 1, easeOutBack(clamp(k)));
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  let w: number;
  if (logo && logo.naturalWidth > 2) {
    const ar = logo.naturalWidth / logo.naturalHeight;
    const lh = h * 0.56;
    const lw = Math.min(lh * ar, h * 4.6);
    w = lw + h * 0.7;
    if (shadow) {
      ctx.shadowColor = "rgba(0,0,0,.18)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 8;
    }
    ctx.fillStyle = "#fff";
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    contain(ctx, logo, -lw / 2, -lh / 2, lw, lh);
  } else {
    setFont(s, h * 0.36, 800);
    const tw = ctx.measureText(s.brand.name).width;
    w = tw + h * 0.8;
    if (shadow) {
      ctx.shadowColor = "rgba(0,0,0,.18)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 8;
    }
    ctx.fillStyle = "#fff";
    rr(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = s.brand.colors.primary;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.brand.name, 0, 2);
  }
  ctx.restore();
}

/** Big offer card: brand colour, offer in huge type, sub-line underneath. */
export function offerCard(s: Scene, cy: number, k: number, o: { w?: number; label?: string; dark?: boolean } = {}) {
  if (k <= 0) return;
  const ctx = s.ctx;
  const c = s.brand.colors.primary;
  const fg = onColor(c);
  const w = o.w ?? 920;
  ctx.save();
  const e = easeOutBack(clamp(k));
  ctx.globalAlpha *= clamp(k * 2);
  ctx.translate(W / 2, cy + (1 - e) * 120);
  ctx.scale(lerp(0.7, 1, e), lerp(0.7, 1, e));

  setFont(s, 112, 900);
  const lines = wrap(ctx, s.ad.offer, w - 120);
  const big = lines.length > 2 ? 84 : 112;
  setFont(s, big, 900);
  const lines2 = wrap(ctx, s.ad.offer, w - 120);
  const h = 150 + lines2.length * big * 1.04 + (s.ad.offerSub ? 70 : 0);

  ctx.shadowColor = rgba(c, 0.45);
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = c;
  rr(ctx, -w / 2, -h / 2, w, h, 56);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // soft top highlight
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, "rgba(255,255,255,.18)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  rr(ctx, -w / 2, -h / 2, w, h, 56);
  ctx.fill();

  ctx.fillStyle = rgba(fg, 0.75);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  setFont(s, 36, 700);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
  ctx.fillText((o.label ?? "THIS WEEK ONLY").toUpperCase(), 0, -h / 2 + 52);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";

  ctx.fillStyle = fg;
  setFont(s, big, 900);
  lines2.forEach((l, i) => ctx.fillText(l, 0, -h / 2 + 110 + i * big * 1.04));
  if (s.ad.offerSub) {
    setFont(s, 38, 600);
    ctx.fillStyle = rgba(fg, 0.8);
    ctx.fillText(s.ad.offerSub, 0, h / 2 - 82);
  }
  ctx.restore();
}

/**
 * The shared outro. Every template lands here so a batch of ads reads as one
 * campaign: logo, offer, CTA button, phone + city.
 */
export function endCard(s: Scene, t0: number) {
  const k = prog(s.t, t0, t0 + 0.6);
  if (k <= 0) return;
  const ctx = s.ctx;
  const c = s.brand.colors.primary;
  ctx.save();
  // wipe up from the bottom
  const wipe = easeInOut(k);
  ctx.beginPath();
  ctx.rect(0, H * (1 - wipe), W, H * wipe);
  ctx.clip();
  fillBg(s, "#ffffff");
  // soft brand glow
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.42, 900);
  g.addColorStop(0, rgba(c, 0.16));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const t = s.t - t0;
  logoPill(s, W / 2, 380, 150, prog(t, 0.25, 0.75));

  if (s.a.car) {
    const kc = prog(t, 0.35, 1.0);
    ctx.save();
    ctx.globalAlpha = easeOut(kc);
    rr(ctx, 90, 560 + (1 - easeOut(kc)) * 60, 900, 560, 48);
    ctx.clip();
    cover(ctx, s.a.car, 90, 560, 900, 560, 1.06 - 0.05 * clamp(t / 3));
    ctx.restore();
  }

  const ko = prog(t, 0.55, 1.1);
  ctx.save();
  ctx.globalAlpha = easeOut(ko);
  setFont(s, 86, 900);
  const lines = wrap(ctx, s.ad.offer, 900);
  const size = lines.length > 2 ? 66 : 86;
  text(s, s.ad.offer, W / 2, 1180 + (1 - easeOut(ko)) * 40, { size, weight: 900, maxW: 900, color: INK });
  if (s.ad.offerSub)
    text(s, s.ad.offerSub, W / 2, 1200 + Math.min(3, lines.length) * size * 1.08 + 10, {
      size: 38,
      weight: 600,
      color: "rgba(10,11,13,.55)",
      maxW: 860,
    });
  ctx.restore();

  // CTA button with a breathing glow
  const kb = prog(t, 0.8, 1.3);
  if (kb > 0) {
    ctx.save();
    const pulse = 1 + Math.sin(t * 5) * 0.015;
    ctx.translate(W / 2, 1560);
    ctx.scale(lerp(0.8, 1, easeOutBack(kb)) * pulse, lerp(0.8, 1, easeOutBack(kb)) * pulse);
    ctx.globalAlpha = clamp(kb * 2);
    ctx.shadowColor = rgba(c, 0.5);
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = c;
    rr(ctx, -380, -70, 760, 140, 70);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = onColor(c);
    setFont(s, 52, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.ad.cta, 0, 3);
    ctx.restore();
  }
  const kf = prog(t, 1.0, 1.5);
  const foot = [s.brand.phone, s.brand.city && `${s.brand.city}${s.brand.state ? ", " + s.brand.state : ""}`]
    .filter(Boolean)
    .join("  ·  ");
  if (foot) text(s, foot, W / 2, 1690, { size: 40, weight: 600, color: "rgba(10,11,13,.5)", alpha: kf });
  ctx.restore();
}

/** Small persistent handle in the corner, like a creator watermark. */
export function handleTag(s: Scene, k = 1, dark = false) {
  if (k <= 0) return;
  const ctx = s.ctx;
  const handle = "@" + s.brand.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  ctx.save();
  ctx.globalAlpha *= k * 0.9;
  setFont(s, 34, 700);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = dark ? "rgba(10,11,13,.6)" : "rgba(255,255,255,.85)";
  ctx.shadowColor = dark ? "transparent" : "rgba(0,0,0,.4)";
  ctx.shadowBlur = 8;
  ctx.fillText(handle, 60, H - 250);
  ctx.restore();
}

export function confetti(s: Scene, t0: number, n = 90, colors?: string[]) {
  const t = s.t - t0;
  if (t < 0 || t > 3) return;
  const ctx = s.ctx;
  const cols = colors ?? [s.brand.colors.primary, s.brand.colors.secondary, "#ffd23f", "#ffffff", "#3b82f6"];
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = rand(i) * Math.PI * 2;
    const v = 600 + rand(i + 100) * 1400;
    const x = W / 2 + Math.cos(a) * v * t;
    const y = H * 0.45 + Math.sin(a) * v * t * 0.8 + 900 * t * t;
    const r = (rand(i + 7) - 0.5) * 12 * t;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.globalAlpha = clamp(1.4 - t / 2);
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(-10, -6, 20 + rand(i + 3) * 14, 12);
    ctx.restore();
  }
  ctx.restore();
}

/** Screen shake offset for impact moments. */
export function shake(t: number, t0: number, amp = 18, len = 0.35): [number, number] {
  const k = prog(t, t0, t0 + len);
  if (k <= 0 || k >= 1) return [0, 0];
  const a = amp * (1 - k);
  return [Math.sin(t * 90) * a, Math.cos(t * 77) * a];
}

/** Thin progress line at the very top — reads as a story/reel. */
export function storyBar(s: Scene, color = "rgba(255,255,255,.9)") {
  const ctx = s.ctx;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.25)";
  rr(ctx, 40, 40, W - 80, 8, 4);
  ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, 40, 40, (W - 80) * clamp(s.t / s.dur), 8, 4);
  ctx.fill();
  ctx.restore();
}

export function vignette(s: Scene, strength = 0.55) {
  const ctx = s.ctx;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(0,0,0,${strength})`);
  g.addColorStop(0.28, "rgba(0,0,0,0)");
  g.addColorStop(0.65, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength + 0.1})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function checkmark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, color: string) {
  if (k <= 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * easeOutBack(clamp(k * 1.5)), 0, Math.PI * 2);
  ctx.fill();
  const kk = prog(k, 0.4, 1);
  if (kk > 0) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const p1 = [x - r * 0.45, y + r * 0.02];
    const p2 = [x - r * 0.1, y + r * 0.36];
    const p3 = [x + r * 0.5, y - r * 0.32];
    ctx.moveTo(p1[0], p1[1]);
    if (kk < 0.5) {
      const q = kk / 0.5;
      ctx.lineTo(lerp(p1[0], p2[0], q), lerp(p1[1], p2[1], q));
    } else {
      ctx.lineTo(p2[0], p2[1]);
      const q = (kk - 0.5) / 0.5;
      ctx.lineTo(lerp(p2[0], p3[0], q), lerp(p2[1], p3[1], q));
    }
    ctx.stroke();
  }
  ctx.restore();
}
