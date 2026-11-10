import { BADGE, offerDetailFor, parseOffer, withDetail, type SpotFields } from "../spot";
import { drawScene, groundShadow, litCar, placeCar, sceneOf, type CarPlacement } from "./composite";
import { H, INK, W, Scene, clamp, cover, easeInOut, easeOut, easeOutBack, lerp, onColor, prog, rgba, rr, setFont, shade, wrap, shout, finePrint } from "./draw";
import { oemTitle } from "../oem";

/**
 * Pro offer spots — the polished, dealer-grade ads (think OEM tier-3): a real
 * scene, the dealer's actual car driving in, bold condensed type, a diagonal
 * white panel with the call to action, and compliant fine print. No end card:
 * a spot ends on its own lockup.
 */

/** Parsed offer → template preset (e.g. Trade Value) → the dealer's own edits, in that order. */
const fieldsOf = (s: Scene): SpotFields =>
  withBrandDisclaimer(
    {
      ...withDetail(parseOffer(s.ad.offer, s.ad.vehicleName, s.brand.name), offerDetailFor(s.brand, s.ad.offer)),
      ...((s.p.spot as Partial<SpotFields>) ?? {}),
      ...(s.ad.spot ?? {}),
    } as SpotFields,
    s
  );

/** The offer's fine print plus the brand's required disclaimer (from the admin guidelines), once. */
export function withBrandDisclaimer(f: SpotFields, s: Scene): SpotFields {
  if (s.brand.compliance?.noCaps) {
    const t = (x?: string) => (x ? oemTitle(x) : x);
    f = { ...f, kicker: t(f.kicker)!, lines: (f.lines ?? []).map((l) => oemTitle(l)), unit: t(f.unit), badge: t(f.badge), cta: t(f.cta)!, detail: t(f.detail) };
  }
  const req = s.brand.compliance?.disclaimer?.trim();
  if (!req || (f.disclaimer ?? "").includes(req.slice(0, 40))) return f;
  return { ...f, disclaimer: [f.disclaimer, req].filter(Boolean).join(" ") };
}


/** Heavy condensed type: horizontal squeeze of the brand font. */
function condensed(
  s: Scene,
  str: string,
  x: number,
  y: number,
  size: number,
  o: { color?: string; align?: CanvasTextAlign; squeeze?: number; shadow?: boolean; weight?: number; tracking?: number; maxW?: number } = {}
) {
  const ctx = s.ctx;
  const sq = o.squeeze ?? 0.84;
  ctx.save();
  setFont(s, size, o.weight ?? 900);
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.tracking ?? -size * 0.03}px`;
  let w = ctx.measureText(str).width * sq;
  let k = 1;
  if (o.maxW && w > o.maxW) {
    k = o.maxW / w;
    w = o.maxW;
  }
  const align = o.align ?? "center";
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  ctx.translate(left, y);
  ctx.scale(sq * k, k);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  if (o.shadow) {
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 8;
  }
  ctx.fillStyle = o.color ?? "#fff";
  ctx.fillText(str, 0, 0);
  ctx.restore();
  return w;
}

const carAspect = (s: Scene) => (s.a.cut ? s.a.cut.height / s.a.cut.width : 0.5);

/**
 * The backdrop. A generated clip plays full-frame; otherwise the scene is
 * fitted to where the car will park (`p`) so the car sits on its road. A
 * photo we can't cut out (shot on the lot) becomes the scene itself, fitted
 * above the layout's panel (`photoH`) so the car isn't covered.
 */
function background(s: Scene, p: CarPlacement | null, push = 0.05, photoH = H) {
  const { ctx, t } = s;
  ctx.fillStyle = "#0a0b0d";
  ctx.fillRect(0, 0, W, H);
  if (s.a.plate) {
    cover(ctx, s.a.plate, 0, 0, W, H, 1.0 + t * 0.004);
    return true;
  }
  const zoom = 1 + push - push * easeOut(clamp(t / 8));
  if (s.a.cut && s.a.scene) {
    drawScene(ctx, s.a.scene, sceneOf(s.ad), p, carAspect(s), zoom);
    return false;
  }
  cover(ctx, s.a.car, 0, 0, W, photoH, zoom);
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, "rgba(0,0,0,.45)");
  v.addColorStop(0.45, "rgba(0,0,0,.05)");
  v.addColorStop(1, "rgba(0,0,0,.25)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  return false;
}

/** Where stacked headline lines end (same maths as `slam`, without drawing). */
const slamEnd = (y: number, n: number, size: number) => y + n * size * 0.86;

export type { CarPlacement };
export { groundShadow };
let placementSink: ((p: CarPlacement) => void) | null = null;
/** Reports where a layout parks the car — used to compose the first frame of an AI rolling clip. */
export function capturePlacement(sink: ((p: CarPlacement) => void) | null) {
  placementSink = sink;
}

/** The dealer's own car, cut out and driven into place with motion blur and a contact shadow. */
function car(s: Scene, cx: number, bottom: number, width: number, t0: number, from: "right" | "left" | "rise" = "right") {
  const { ctx, t } = s;
  const cut = s.a.cut;
  placementSink?.({ cx, bottom, width });
  const k = easeOut(prog(t, t0, t0 + 1.1));
  if (k <= 0) return;
  // no clean cutout: the photo is already the full-bleed background
  if (!cut) return;
  const def = sceneOf(s.ad);
  const h = (width * cut.height) / cut.width;
  const drift = Math.sin(t * 0.6) * 4;
  const dx = from === "rise" ? 0 : (1 - k) * (from === "right" ? 1 : -1) * W * 0.9;
  const dy = from === "rise" ? (1 - k) * 80 : 0;
  const x = cx - width / 2 + dx;
  // motion-blur ghosts while moving
  const speed = 1 - k;
  if (speed > 0.02 && from !== "rise") {
    const lc = litCar(cut, def);
    for (let i = 4; i >= 1; i--) {
      ctx.save();
      ctx.globalAlpha = 0.12 * speed * (5 - i);
      ctx.drawImage(lc, x + i * 26 * speed * (from === "right" ? 1 : -1) * 4, bottom - h + dy, width, h);
      ctx.restore();
    }
  }
  ctx.save();
  if (from === "rise") ctx.globalAlpha = k;
  placeCar(ctx, cut, def, x, bottom + dy + drift * 0.2, width, k);
  ctx.restore();
}

/** Car width that keeps its roof just under the headline (a little overlap reads as depth). */
function fitCar(s: Scene, headEnd: number, bottom: number, max: number) {
  const cut = s.a.cut;
  const aspect = cut ? cut.height / cut.width : 0.62;
  const room = bottom - (headEnd - 20);
  return Math.max(560, Math.min(max, room / aspect));
}

/** Headline size for N stacked lines. */
const headSize = (n: number, one: number, two: number, three: number) => (n >= 3 ? three : n === 2 ? two : one);

function logoBadge(s: Scene, cx: number, cy: number, hgt: number, k: number) {
  if (k <= 0) return;
  const { ctx } = s;
  const logo = s.a.logo;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.5);
  ctx.translate(cx, cy + (1 - easeOutBack(k)) * -30);
  if (logo && logo.naturalWidth > 2) {
    const lh = hgt * 0.62;
    const lw = Math.min(lh * (logo.naturalWidth / logo.naturalHeight), 520);
    const w = lw + hgt * 0.7;
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff";
    rr(ctx, -w / 2, -hgt / 2, w, hgt, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
  } else {
    condensed(s, shout(s, s.brand.name), 0, -hgt * 0.36, hgt * 0.6, { color: "#fff", shadow: true });
  }
  ctx.restore();
}

function kickerBox(s: Scene, text: string, cx: number, y: number, size: number, k: number, bg = INK, fg = "#fff") {
  if (k <= 0) return;
  const { ctx } = s;
  // the whole line always fits: shrink instead of cutting a model name short
  setFont(s, size, 800);
  while (size > 30 && ctx.measureText(text).width * 0.9 + size * 1.1 > W - 100) setFont(s, --size, 800);
  const w = ctx.measureText(text).width * 0.9 + size * 1.1;
  const h = size * 1.45;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2, y, w * easeInOut(k), h);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(cx - w / 2, y, w, h);
  condensed(s, text, cx, y + h * 0.16, size, { color: fg, squeeze: 0.9, weight: 800, tracking: 1 });
  ctx.restore();
}

/** Stacked headline lines that slam in one after another. */
function slam(s: Scene, lines: string[], cx: number, y: number, size: number, t0: number, o: { color?: string; shadow?: boolean; maxW?: number } = {}) {
  const { ctx, t } = s;
  let yy = y;
  lines.forEach((l, i) => {
    const k = prog(t, t0 + i * 0.16, t0 + i * 0.16 + 0.35);
    if (k > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(k * 3);
      const sc = lerp(1.35, 1, easeOut(k));
      ctx.translate(cx, yy + size / 2);
      ctx.scale(sc, sc);
      condensed(s, l, 0, -size / 2, size, { color: o.color ?? "#fff", shadow: o.shadow ?? true, maxW: o.maxW ?? 900 });
      ctx.restore();
    }
    yy += size * 0.86;
  });
  return yy;
}

function ctaPill(s: Scene, text: string, cx: number, cy: number, k: number, wMin = 560) {
  if (k <= 0) return;
  const { ctx, t } = s;
  const c = s.brand.colors.primary;
  setFont(s, 54, 800);
  const w = Math.max(wMin, ctx.measureText(text).width * 0.92 + 120);
  const h = 112;
  const pulse = 1 + Math.sin(t * 4) * 0.012 * prog(t, 3, 4);
  ctx.save();
  ctx.globalAlpha = clamp(k * 2);
  ctx.translate(cx, cy);
  ctx.scale(lerp(0.7, 1, easeOutBack(k)) * pulse, lerp(0.7, 1, easeOutBack(k)) * pulse);
  ctx.shadowColor = rgba(c, 0.45);
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = c;
  rr(ctx, -w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 5;
  rr(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, h / 2);
  ctx.stroke();
  condensed(s, text, 0, -30, 58, { color: onColor(c), squeeze: 0.92, weight: 800, tracking: 1, maxW: w - 80 });
  ctx.restore();
}

function fine(s: Scene, text: string, y: number, color = "rgba(10,11,13,.5)", k = 1) {
  const { ctx } = s;
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(k);
  // complete and verbatim: shrinks to fit, then grows upward; never cut (OEM kit §7.8)
  finePrint(s, text, { top: y, bottom: 1872, x: W / 2, width: 940, align: "center", color });
  ctx.restore();
}

function dealerLine(s: Scene, y: number, color: string, k: number) {
  const foot = [s.brand.name, s.brand.phone, s.brand.city && `${s.brand.city}${s.brand.state ? ", " + s.brand.state : ""}`].filter(Boolean).join("  ·  ");
  if (!foot || k <= 0) return;
  const { ctx } = s;
  ctx.save();
  ctx.globalAlpha = clamp(k);
  setFont(s, 32, 700);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(foot, W / 2, y, 980);
  ctx.restore();
}

/** Light sweep across a region — the "shine" on hero numbers. */
function sweep(s: Scene, x: number, y: number, w: number, h: number, t0: number) {
  const { ctx, t } = s;
  const k = prog(t, t0, t0 + 0.9);
  if (k <= 0 || k >= 1) return;
  const sx = x - 200 + (w + 400) * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(sx - 120, y, 240, h);
  ctx.restore();
}

// ---------------------------------------------------------------- A: diagonal (the trade-value layout)

export function spotDiagonal(s: Scene) {
  const { ctx, t } = s;
  const f = fieldsOf(s);
  // with a hero number, the number is the headline and the model joins the kicker
  const hero = !!f.big && f.kind !== "trade";
  const lines = (hero ? [f.big + (f.unit ? " " + f.unit : "")] : f.lines).slice(0, 3);
  const headY = 420;
  const headPx = headSize(lines.length, 230, 200, 150);
  const headEnd = slamEnd(headY, lines.length, headPx);
  // The panel's final edge runs from (0, L) to (W, R). The car is parked so its
  // front tyre sits right on that edge — never sliced by it, whatever its shape.
  const L = 1440;
  const R = 1250;
  const edge = (x: number) => L + ((R - L) * x) / W;
  const cx = W / 2 - 10;
  let cw = 880;
  let bottom = 1300;
  for (let i = 0; i < 3; i++) {
    bottom = edge(cx + cw * 0.36) + 8;
    cw = fitCar(s, headEnd, bottom, 900);
  }
  const clip = background(s, { cx, bottom, width: cw }, 0.05, 1460);
  // top vignette so white type always reads
  const g = ctx.createLinearGradient(0, 0, 0, 900);
  g.addColorStop(0, "rgba(0,0,0,.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 900);

  logoBadge(s, W / 2, 210, 110, prog(t, 0.15, 0.6));
  kickerBox(s, hero && f.lines.length ? `${f.kicker} ${f.lines.join(" ")}` : f.kicker, W / 2, 330, 54, prog(t, 0.45, 0.85));
  slam(s, lines, W / 2, headY, headPx, 0.7, { maxW: 960 });
  if (!clip) car(s, cx, bottom, cw, 1.0);

  // the diagonal white panel
  const kp = easeInOut(prog(t, 1.7, 2.3));
  const yL = lerp(H + 40, L, kp);
  const yR = lerp(H + 40, R, kp);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, yL - 26);
  ctx.lineTo(W, yR - 26);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, yL);
  ctx.lineTo(W, yR);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctaPill(s, f.cta, 330, edge(330) + 24, prog(t, 2.2, 2.6), 540);
  // right-hand badge (partner / promise)
  const kb = prog(t, 2.4, 2.8);
  if (kb > 0 && (f.badge || f.detail || f.lines.length)) {
    ctx.save();
    ctx.globalAlpha = kb;
    const bx = 640;
    const by = edge(800) + 46;
    ctx.fillStyle = s.brand.colors.primary;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 70, by);
    ctx.lineTo(bx + 70, by + 70);
    ctx.lineTo(bx + 35, by + 92);
    ctx.lineTo(bx, by + 70);
    ctx.closePath();
    ctx.fill();
    condensed(s, "✓", bx + 35, by + 10, 50, { color: onColor(s.brand.colors.primary), squeeze: 1, weight: 900 });
    const label = f.badge ?? BADGE[f.kind];
    setFont(s, 34, 800);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const bl = wrap(ctx, label, 330).slice(0, 2);
    bl.forEach((l, i) => ctx.fillText(l, bx + 92, by + 2 + i * 40, 330));
    setFont(s, 26, 600);
    ctx.fillStyle = "rgba(10,11,13,.55)";
    ctx.fillText(s.brand.name, bx + 92, by + 8 + bl.length * 40, 330);
    ctx.restore();
  }
  const kf = prog(t, 2.8, 3.4);
  // the white space under the diagonal carries the offer itself
  const isPreset = !!(s.p.spot as Partial<SpotFields> | undefined)?.lines;
  // a trade bonus only when the dealer's offer really is one
  const tradeOffer = parseOffer(s.ad.offer, s.ad.vehicleName, s.brand.name).kind === "trade";
  const offerLine =
    f.kind === "trade" && tradeOffer && f.big ? `Plus a ${f.big} trade bonus` : f.kind === "trade" && !tradeOffer ? s.ad.offer : f.detail ?? (isPreset || f.kind === "generic" ? s.ad.offer : s.ad.offerSub || s.ad.offer);
  // fit the whole offer: 2 lines at full size, else 3 smaller lines — never cut off
  let size = 64;
  let ls: string[] = [];
  if (offerLine) {
    ctx.save();
    for (size = 64; size >= 44; size -= 6) {
      setFont(s, size, 900);
      ls = wrap(ctx, shout(s, offerLine), 1100);
      if (ls.length <= (size > 56 ? 2 : 3)) break;
    }
    ctx.restore();
    ls = ls.slice(0, 3);
  }
  const lh = size * 1.03;
  if (ls.length && kf > 0) {
    ctx.save();
    ctx.globalAlpha = kf;
    ls.forEach((l, i) => condensed(s, l, W / 2, 1560 + i * lh, size, { color: INK, squeeze: 0.86, weight: 900, maxW: 960 }));
    ctx.restore();
  }
  const after = 1560 + ls.length * lh;
  dealerLine(s, after + 12, "rgba(10,11,13,.75)", kf);
  fine(s, f.disclaimer, after + 70, "rgba(10,11,13,.45)", kf);
}

// ---------------------------------------------------------------- B: price band (lease / APR / cash / price)

export function spotPrice(s: Scene) {
  const { ctx, t } = s;
  const f = fieldsOf(s);
  const c = s.brand.colors.primary;
  // without a hero number the headline lives in the band instead
  const topLines = f.big ? f.lines.slice(0, 2) : [];
  const topPx = topLines.length > 1 ? 130 : 150;
  const headEnd = topLines.length ? slamEnd(420, topLines.length, topPx) : 420;
  const place = { cx: W / 2, bottom: 1150, width: fitCar(s, headEnd, 1150, 920) };
  const clip = background(s, place, 0.05, 1240);
  const g = ctx.createLinearGradient(0, 0, 0, 700);
  g.addColorStop(0, "rgba(0,0,0,.38)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 700);

  logoBadge(s, W / 2, 200, 110, prog(t, 0.15, 0.6));
  kickerBox(s, f.kicker, W / 2, 330, 54, prog(t, 0.4, 0.8));
  if (topLines.length) slam(s, topLines, W / 2, 420, topPx, 0.6, { maxW: 960 });
  if (!clip) car(s, place.cx, place.bottom, place.width, 0.9);

  // white band with a slight angle
  const kp = easeInOut(prog(t, 1.6, 2.2));
  const top = lerp(H + 40, 1170, kp);
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, top + 40);
  ctx.lineTo(W, top - 30);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(0, top + 40);
  ctx.lineTo(W, top - 30);
  ctx.lineTo(W, top - 14);
  ctx.lineTo(0, top + 56);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (f.big) {
    const kn = prog(t, 2.0, 2.8);
    if (kn > 0) {
      // roll the number up to its value
      const num = Number(f.big.replace(/[^\d.]/g, ""));
      const dec = (f.big.match(/\.(\d+)/)?.[1] ?? "").length;
      const rolled = f.big.replace(/[\d,.]+/, (num * easeOut(kn)).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
      ctx.save();
      ctx.globalAlpha = clamp(kn * 3);
      setFont(s, 300, 900);
      const bigW = condensed(s, rolled, W / 2 - 60, 1240, 300, { color: c, squeeze: 0.82, shadow: false, maxW: 760 });
      if (f.unit) condensed(s, f.unit, W / 2 - 60 + bigW / 2 + 16, 1290, 92, { color: INK, align: "left", squeeze: 0.86, maxW: 300 });
      ctx.restore();
      sweep(s, 80, 1240, 920, 300, 3.0);
    }
  }
  if (!f.big) {
    const kn = prog(t, 2.0, 2.6);
    if (kn > 0) {
      ctx.save();
      ctx.globalAlpha = kn;
      setFont(s, 120, 900);
      const ls = wrap(ctx, shout(s, s.ad.offer), 1150).slice(0, 3);
      const sz = ls.length > 2 ? 92 : 120;
      ls.forEach((l, i) => condensed(s, l, W / 2, 1250 + i * sz * 0.92 + (1 - easeOut(kn)) * 30, sz, { color: i === 0 ? c : INK, squeeze: 0.84, maxW: 960 }));
      ctx.restore();
    }
  }
  const kd = prog(t, 2.6, 3.1);
  if (f.detail) {
    ctx.save();
    ctx.globalAlpha = kd;
    condensed(s, shout(s, f.detail), W / 2, 1530, 46, { color: "rgba(10,11,13,.7)", squeeze: 0.9, weight: 700, tracking: 1, maxW: 960 });
    ctx.restore();
  }
  ctaPill(s, f.cta, W / 2, f.detail ? 1640 : 1580, prog(t, 2.9, 3.3), 520);
  fine(s, f.disclaimer, f.detail ? 1720 : 1670, "rgba(10,11,13,.45)", prog(t, 3.2, 3.7));
}

// ---------------------------------------------------------------- C: minimal showroom

export function spotMinimal(s: Scene) {
  const { ctx, t } = s;
  const f = fieldsOf(s);
  const c = s.brand.colors.primary;
  if (s.a.plate) background(s, null);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.6, "#f2f3f5");
    g.addColorStop(1, "#e7e9ed");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // soft floor horizon
    ctx.fillStyle = "rgba(10,11,13,.04)";
    ctx.fillRect(0, 1180, W, H - 1180);
  }
  const dark = !!s.a.plate;
  const ink = dark ? "#fff" : INK;
  const k1 = prog(t, 0.2, 0.8);
  ctx.save();
  ctx.globalAlpha = k1;
  setFont(s, 30, 700);
  ctx.fillStyle = c;
  ctx.textAlign = "center";
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "10px";
  ctx.fillText(f.kicker, W / 2, 300);
  ctx.restore();
  // keep real casing (SUV, LE, AWD) — only lines derived from a model are all-caps
  const title = f.kind === "generic" ? s.ad.offer : s.ad.vehicleName && !/your next car/i.test(s.ad.vehicleName) ? s.ad.vehicleName : s.ad.offer;
  const k2 = prog(t, 0.5, 1.2);
  ctx.save();
  ctx.globalAlpha = k2;
  ctx.translate(0, (1 - easeOut(k2)) * 24);
  setFont(s, 96, 600);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-3px";
  wrap(ctx, title, 900).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 360 + i * 104));
  ctx.restore();
  if (!s.a.plate && s.a.cut) {
    const cut = s.a.cut;
    const w = 940;
    const h = (w * cut.height) / cut.width;
    const k = easeOut(prog(t, 0.9, 2.2));
    const x = W / 2 - w / 2;
    const y = 1180 - h + (1 - k) * 60;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.drawImage(cut, x, y, w, h);
    // reflection
    ctx.globalAlpha = 0.12 * k;
    ctx.translate(0, 2 * 1180);
    ctx.scale(1, -1);
    ctx.drawImage(cut, x, y, w, h);
    ctx.restore();
  } else if (!s.a.plate) car(s, W / 2, 1180, 900, 0.9, "rise");
  const k3 = prog(t, 2.2, 2.8);
  ctx.save();
  ctx.globalAlpha = k3;
  setFont(s, 60, 700);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const second = title === s.ad.offer ? (s.ad.vehicleName && !/your next car/i.test(s.ad.vehicleName) ? s.ad.vehicleName : s.brand.name) : s.ad.offer;
  wrap(ctx, second, 900).slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1300 + i * 70));
  setFont(s, 40, 600);
  ctx.fillStyle = c;
  ctx.fillText(`${f.cta.charAt(0)}${f.cta.slice(1).toLowerCase()}  ›`, W / 2, 1470);
  ctx.restore();
  if (s.a.logo) logoBadge(s, W / 2, 1600, 100, prog(t, 2.6, 3.0));
  fine(s, f.disclaimer, 1690, dark ? "rgba(255,255,255,.6)" : "rgba(10,11,13,.4)", prog(t, 3, 3.5));
}

// ---------------------------------------------------------------- D: sales event

export function spotEvent(s: Scene) {
  const { ctx, t } = s;
  const f = fieldsOf(s);
  const c = s.brand.colors.primary;
  const evLines = f.lines.slice(0, 3);
  const evPx = headSize(evLines.length, 220, 200, 160);
  const end = slamEnd(420, evLines.length, evPx);
  const place = { cx: W / 2, bottom: 1390, width: fitCar(s, end, 1390, 940) };
  const clip = background(s, place, 0.08);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,.55)");
  g.addColorStop(0.45, "rgba(0,0,0,.15)");
  g.addColorStop(1, "rgba(0,0,0,.75)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  logoBadge(s, W / 2, 200, 110, prog(t, 0.1, 0.5));
  kickerBox(s, f.kicker, W / 2, 320, 50, prog(t, 0.3, 0.7), c, onColor(c));
  slam(s, evLines, W / 2, 420, evPx, 0.5, { maxW: 980 });
  sweep(s, 40, 420, 1000, end - 420, 1.8);
  if (!clip) car(s, place.cx, place.bottom, place.width, 1.2);
  const ko = prog(t, 2.2, 2.8);
  if (ko > 0) {
    ctx.save();
    ctx.globalAlpha = ko;
    ctx.fillStyle = "rgba(255,255,255,.96)";
    rr(ctx, 70, 1420 + (1 - easeOut(ko)) * 60, W - 140, 170, 30);
    ctx.fill();
    setFont(s, 58, 900);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.ad.offer, W / 2, 1505 + (1 - easeOut(ko)) * 60, W - 200);
    ctx.restore();
  }
  ctaPill(s, f.cta, W / 2, 1680, prog(t, 2.8, 3.2));
  fine(s, f.disclaimer, 1770, "rgba(255,255,255,.65)", prog(t, 3.2, 3.6));
}

// ---------------------------------------------------------------- E: vehicle spotlight (inventory)

export function spotSpotlight(s: Scene) {
  const { ctx, t } = s;
  const f = fieldsOf(s);
  const c = s.brand.colors.primary;
  const clip = background(s, { cx: W / 2, bottom: 1180, width: 920 }, 0.05, 1320);
  const g = ctx.createLinearGradient(0, 900, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.6)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 900, W, H - 900);
  logoBadge(s, W / 2, 190, 100, prog(t, 0.1, 0.5));
  // "IN STOCK" chip
  const kc = prog(t, 0.3, 0.7);
  if (kc > 0) {
    ctx.save();
    ctx.globalAlpha = kc;
    setFont(s, 34, 800);
    const label = "● IN STOCK NOW";
    const w = ctx.measureText(label).width + 60;
    ctx.fillStyle = "rgba(255,255,255,.95)";
    rr(ctx, W / 2 - w / 2, 290, w, 70, 35);
    ctx.fill();
    ctx.fillStyle = "#16a34a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, W / 2, 327);
    ctx.restore();
  }
  if (!clip) car(s, W / 2, 1180, 920, 0.6);
  // glass card
  const kp = easeOut(prog(t, 1.5, 2.1));
  if (kp > 0) {
    const y = lerp(H, 1230, kp);
    ctx.save();
    ctx.fillStyle = "rgba(12,14,20,.86)";
    rr(ctx, 50, y, W - 100, 560, 44);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 2;
    rr(ctx, 50, y, W - 100, 560, 44);
    ctx.stroke();
    condensed(s, shout(s, s.ad.vehicleName || f.lines.join(" ")), W / 2, y + 44, 70, { color: "#fff", squeeze: 0.86, maxW: W - 180 });
    if (f.big) {
      const w = condensed(s, f.big, W / 2, y + 140, 190, { color: shade(c, 0.15), squeeze: 0.82, maxW: 760 });
      sweep(s, W / 2 - w / 2, y + 140, w, 190, 2.6);
    } else condensed(s, shout(s, s.ad.offer), W / 2, y + 160, 80, { color: "#fff", squeeze: 0.9, maxW: W - 200 });
    setFont(s, 34, 600);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (s.ad.offerSub) ctx.fillText(s.ad.offerSub, W / 2, y + 350, W - 200);
    ctx.restore();
    ctaPill(s, f.cta, W / 2, y + 460, prog(t, 2.3, 2.7));
  }
  fine(s, f.disclaimer, 1810, "rgba(255,255,255,.6)", prog(t, 2.8, 3.2));
}


