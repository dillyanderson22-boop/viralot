import { cinematicById, type Cinematic } from "../cinematic";
import { offerDetailFor, parseOffer, withDetail, type SpotFields } from "../spot";
import { withBrandDisclaimer } from "./engines-spot";
import { H, W, Scene, clamp, cover, easeOut, easeOutBack, logoPill, prog, rr, setFont, wrap, shout, finePrint } from "./draw";

/**
 * Cinematic templates. Without a generated clip the card plays the pack's
 * sample preview untouched (it carries its own labelled SAMPLE OFFER). With
 * the dealer's clip (`ad.cinematic[id]`, text-free Seedance footage) the dealer's real
 * offer is drawn on top in the template's style. Numbers and fine print come
 * only from the offer and the site's offer details, never invented.
 */

const fieldsOf = (s: Scene): SpotFields =>
  withBrandDisclaimer({ ...withDetail(parseOffer(s.ad.offer, s.ad.vehicleName, s.brand.name), offerDetailFor(s.brand, s.ad.offer)), ...(s.ad.spot ?? {}) } as SpotFields, s);

const KIND_LABEL: Record<SpotFields["kind"], string> = {
  lease: "LEASE",
  apr: "FINANCE",
  cash: "SAVE",
  price: "NOW",
  trade: "TRADE-IN",
  event: "EVENT",
  generic: "OFFER",
};

function vehicle(s: Scene) {
  const n = s.ad.vehicleName?.trim();
  return n && !/your next car|special offer/i.test(n) ? n : "";
}

/** Bottom offer card: gradient, kicker, big number or headline, terms, dealer line, fine print. */
function offerCard(s: Scene, f: SpotFields, t0: number) {
  const { ctx, t } = s;
  const k = prog(t, t0, t0 + 0.6);
  if (k <= 0) return;
  ctx.save();
  // readable floor under the text
  const g = ctx.createLinearGradient(0, H * 0.42, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.86 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.42, W, H * 0.58);

  const x = 84;
  const rise = (d: number) => (1 - easeOut(prog(t, t0 + d, t0 + d + 0.45))) * 24;
  const alpha = (d: number) => clamp(prog(t, t0 + d, t0 + d + 0.35));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const car = shout(s, vehicle(s));
  let y = 1290;
  if (car) {
    ctx.globalAlpha = alpha(0.1);
    setFont(s, 38, 800);
    ctx.fillStyle = "#fff";
    ctx.fillText(car.slice(0, 40), x, y + rise(0.1), W - 2 * x);
    y += 70;
  }
  // several offers picked from one special: a grid of label / number / terms instead of one hero number
  const picked = s.ad.offers ?? [];
  if (picked.length > 1) {
    const rows = picked.slice(0, 4);
    const cols = rows.length > 2 ? 2 : 1;
    const cw = (W - 2 * x - (cols - 1) * 36) / cols;
    const rh = 150;
    y -= 10;
    rows.forEach((o, i) => {
      const cx = x + (i % cols) * (cw + 36);
      const cy = y + Math.floor(i / cols) * rh;
      const d = 0.25 + i * 0.08;
      ctx.globalAlpha = alpha(d);
      setFont(s, 24, 700);
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.fillText(shout(s, o.label), cx, cy + rise(d), cw);
      setFont(s, cols > 1 ? 62 : 76, 800);
      ctx.fillStyle = "#fff";
      ctx.fillText(o.value, cx, cy + (cols > 1 ? 66 : 78) + rise(d), cw);
      if (o.detail) {
        setFont(s, 22, 600);
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.fillText(o.detail.length > 46 ? o.detail.slice(0, 44).replace(/\s+\S*$/, "") + "…" : o.detail, cx, cy + (cols > 1 ? 104 : 118) + rise(d), cw);
      }
    });
    y += Math.ceil(rows.length / cols) * rh - 20;
    dealerLine(s, f, x, y, alpha);
    ctx.restore();
    logoPill(s, W - 190, 150, 96, alpha(0.2));
    return;
  }
  ctx.globalAlpha = alpha(0.25);
  setFont(s, 26, 700);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.fillText(shout(s, KIND_LABEL[f.kind]), x, y + rise(0.25));
  y += 130;
  ctx.globalAlpha = alpha(0.35);
  ctx.fillStyle = "#fff";
  if (f.big) {
    setFont(s, 150, 800);
    ctx.fillText(f.big, x, y + rise(0.35));
    const w = ctx.measureText(f.big).width;
    if (f.unit) {
      setFont(s, 58, 800);
      ctx.fillText(f.unit, x + w + 14, y + rise(0.35));
    }
  } else {
    setFont(s, 76, 800);
    const lines = wrap(ctx, shout(s, s.ad.offer || ""), W - 2 * x).slice(0, 3);
    y -= 70;
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * 84 + rise(0.35)));
    y += (lines.length - 1) * 84;
  }
  y += 62;
  if (f.detail) {
    ctx.globalAlpha = alpha(0.5);
    setFont(s, 32, 600);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    ctx.fillText(shout(s, f.detail), x, y + rise(0.5), W - 2 * x);
    y += 58;
  }
  dealerLine(s, f, x, y, alpha);
  ctx.restore();
  logoPill(s, W - 190, 150, 96, alpha(0.2));
}

/** Dealer name, city and the fine print under the offer. */
function dealerLine(s: Scene, f: SpotFields, x: number, y: number, alpha: (d: number) => number) {
  const { ctx } = s;
  ctx.globalAlpha = alpha(0.7);
  setFont(s, 30, 800);
  ctx.fillStyle = "#fff";
  const city = s.brand.city ? `  ·  ${s.brand.city}${s.brand.state ? ", " + s.brand.state : ""}` : "";
  ctx.fillText(`${shout(s, s.brand.name)}${city}`, x, y + 16, W - 2 * x);
  // complete and verbatim: shrinks to fit, then grows upward; never cut (OEM kit §7.8)
  if (f.disclaimer) finePrint(s, f.disclaimer, { top: y + 60, bottom: H - 48, x, width: W - 2 * x, color: "rgba(255,255,255,.72)", max: 20 });
}

/** Offer pieces slammed on screen one per beat (Price Drop Countdown). */
function slams(s: Scene, f: SpotFields, end: number) {
  const picked = s.ad.offers ?? [];
  const parts = picked.length > 1 ? picked.slice(0, 4).map((o) => `${o.value} ${o.label}`) : [
    ...(f.detail ? f.detail.split(/\s*·\s*/) : []),
    f.big ? `${f.big}${f.unit ? " " + f.unit : ""}` : "",
  ].filter(Boolean);
  if (!parts.length) parts.push(s.ad.offer || "");
  const start = 0.5;
  const step = (end - start) / parts.length;
  const { ctx, t } = s;
  parts.forEach((p, i) => {
    const t0 = start + i * step;
    const k = prog(t, t0, t0 + 0.18);
    if (k <= 0 || t > t0 + step) return;
    ctx.save();
    ctx.globalAlpha = clamp(k * 3) * (1 - prog(t, t0 + step - 0.12, t0 + step));
    const sc = 1.35 - 0.35 * easeOutBack(k);
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(sc, sc);
    setFont(s, 112, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#fff";
    wrap(ctx, shout(s, p), W - 140)
      .slice(0, 2)
      .forEach((l, j, a) => ctx.fillText(l, 0, (j - (a.length - 1) / 2) * 120));
    ctx.restore();
  });
}

/** Huge kinetic offer words drifting across the frame (Nocturne). */
function kinetic(s: Scene, f: SpotFields, end: number) {
  const words = [KIND_LABEL[f.kind], f.big ?? "", f.unit ?? "", ...(f.detail ? [f.detail.split(/\s*·\s*/)[0]] : [])].filter(Boolean).slice(0, 4);
  const { ctx, t } = s;
  const step = (end - 0.4) / Math.max(1, words.length);
  words.forEach((w, i) => {
    const t0 = 0.4 + i * step;
    const k = prog(t, t0, t0 + step);
    if (k <= 0 || k >= 1) return;
    ctx.save();
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
    ctx.globalCompositeOperation = "screen";
    setFont(s, 240, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const x = W / 2 + (0.5 - k) * 260;
    ctx.fillText(shout(s, w), x, H * 0.5, W * 1.4);
    ctx.restore();
  });
}

/** TikTok-style top caption (POV: Your Test Drive). */
function povCaption(s: Scene, f: SpotFields, end: number) {
  const { ctx, t } = s;
  const k = prog(t, 0.3, 0.7) * (1 - prog(t, end - 0.2, end));
  if (k <= 0) return;
  const car = vehicle(s) || "your next car";
  const line = f.kind === "lease" ? `POV: you just leased the ${car}` : `POV: you just drove off in the ${car}`;
  ctx.save();
  ctx.globalAlpha = k;
  setFont(s, 46, 800);
  const lines = wrap(ctx, line, W - 200).slice(0, 2);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64;
  const h = lines.length * 58 + 36;
  ctx.fillStyle = "#fff";
  rr(ctx, (W - w) / 2, 230, w, h, 22);
  ctx.fill();
  ctx.fillStyle = "#0a0b0d";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 248 + i * 58));
  ctx.restore();
}

export function cinematic(s: Scene) {
  const { ctx, t } = s;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (s.a.plate) cover(ctx, s.a.plate, 0, 0, W, H, 1);
  const c: Cinematic | undefined = cinematicById(String(s.p.cid ?? ""));
  // sample preview: shown as made (it labels its own sample offer)
  if (!c || !s.ad.cinematic?.[c.id]) return;
  const f = fieldsOf(s);
  const offerAt = Math.max(0.5, s.dur - c.offerSeconds);
  if (c.offerStyle === "slam") slams(s, f, offerAt);
  if (c.offerStyle === "kinetic") kinetic(s, f, offerAt);
  if (c.offerStyle === "pov") povCaption(s, f, offerAt);
  offerCard(s, f, offerAt);
  // gentle fade to black on the last few frames
  const out = prog(t, s.dur - 0.25, s.dur);
  if (out > 0) {
    ctx.fillStyle = `rgba(0,0,0,${out})`;
    ctx.fillRect(0, 0, W, H);
  }
}
