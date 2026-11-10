"use client";

import type { AdInputs, Brand } from "../types";
import { ENGINES, Template, resolveTemplate } from "./catalog";
import { Assets, H, Scene, W } from "./draw";
import { cutoutCar } from "./cutout";
import { capturePlacement } from "./engines-spot";
import { cinematicById } from "../cinematic";
import { drawScene, placeCar, sceneOf, type CarPlacement } from "./composite";

// ---------- assets ----------

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      // generated media is redirected to Blob storage (CORS-enabled); keep canvases exportable
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

let fontFamily: string | null = null;
export function adFont() {
  if (fontFamily) return fontFamily;
  if (typeof document === "undefined") return "system-ui, sans-serif";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim();
  fontFamily = v ? `${v}, system-ui, sans-serif` : "system-ui, sans-serif";
  return fontFamily;
}

/** The brand's guideline font (loaded from its file link when there is one), else ours. */
const loadedFonts = new Map<string, Promise<boolean>>();
export function brandFont(brand: Brand) {
  const c = brand.compliance;
  // OEM kit face first; Arial/Helvetica are the only fallbacks the kit allows (§2.1)
  if (c?.family) return `"${c.family}", Arial, Helvetica, sans-serif`;
  const f = c?.headingFont;
  if (!f?.name) return adFont();
  return `"${f.name.replace(/"/g, "")}", ${adFont()}`;
}
export async function ensureBrandFonts(brand: Brand) {
  if (typeof document === "undefined") return;
  const c = brand.compliance;
  // OEM kit: one family, real Regular 400 and Bold 700 files
  for (const face of c?.family ? [...(c.faces ?? []).map((x) => ({ family: c.family!, ...x })), ...(c.figure ? [{ family: c.figure.family, weight: 700, url: c.figure.url }] : [])] : []) {
    if (loadedFonts.has(face.url + face.family)) continue;
    const ff = new FontFace(face.family, `url(${JSON.stringify(face.url)})`, { weight: String(face.weight) });
    loadedFonts.set(
      face.url + face.family,
      ff
        .load()
        .then((x) => (document.fonts.add(x), true))
        .catch(() => false)
    );
  }
  for (const f of [brand.compliance?.headingFont, brand.compliance?.bodyFont]) {
    if (!f?.url || loadedFonts.has(f.url)) continue;
    const face = new FontFace(f.name.replace(/"/g, ""), `url(${JSON.stringify(f.url)})`);
    loadedFonts.set(
      f.url,
      face
        .load()
        .then((ff) => (document.fonts.add(ff), true))
        .catch(() => false)
    );
  }
  await Promise.all(loadedFonts.values());
}

export type AdContext = {
  brand: Brand;
  ad: AdInputs;
};

/** Pro spots that can run on an AI rolling clip (the studio look can't). */
export const clipReady = (tpl: Template) => tpl.category === "Pro spot" && tpl.engine !== "spotMinimal";

/** Template timing/plate for this ad — a generated rolling clip replaces the plate. */
export function resolveFor(tpl: Template, ctx: AdContext) {
  const r = resolveTemplate(tpl, ctx.brand.makes);
  if (tpl.engine === "cinematic") {
    // the dealer's own clip for this template, else the pack's sample preview
    const own = ctx.ad.cinematic?.[String(tpl.params.cid)];
    const c = cinematicById(String(tpl.params.cid));
    return own && c ? { ...r, plate: own, dur: ctx.ad.seconds ?? c.seconds, clip: true } : { ...r, clip: false };
  }
  return ctx.ad.clip && clipReady(tpl) ? { ...r, plate: ctx.ad.clip, clip: true } : { ...r, clip: false };
}

/** Templates whose footage carries its own soundtrack (no synthesized beat). */
export const ownAudio = (tpl: Template) => Boolean(tpl.params.clipAudio);

const clipVideos = new Map<string, { v: HTMLVideoElement; ready: Promise<void>; queue: Promise<unknown> }>();

/**
 * A plate frame for a still: a seeked <video> (one element per clip, seeks queued).
 */
export async function stillPlate(plate: string | undefined, t: number): Promise<HTMLImageElement | HTMLVideoElement | null> {
  if (!plate) return null;
  let e = clipVideos.get(plate);
  if (!e) {
    const v = makePlateVideo(plate, true);
    const ready = new Promise<void>((res) => {
      v.addEventListener("loadeddata", () => res(), { once: true });
      v.addEventListener("error", () => res(), { once: true });
    });
    e = { v, ready, queue: Promise.resolve() };
    clipVideos.set(plate, e);
  }
  const entry = e;
  const job = entry.queue.then(async () => {
    await entry.ready;
    const v = entry.v;
    if (!v.duration || v.error) return null;
    const to = Math.min(t, v.duration - 0.05);
    if (Math.abs(v.currentTime - to) > 0.01) {
      await new Promise<void>((res) => {
        v.addEventListener("seeked", () => res(), { once: true });
        v.currentTime = to;
        setTimeout(res, 3000);
      });
    }
    return v;
  });
  entry.queue = job.catch(() => null);
  return job;
}

/**
 * First frame for an AI rolling clip: the scene plus the dealer's car parked
 * exactly where this layout puts it, so the generated footage lines up with
 * the headline and panels drawn on top. 720×1280 JPEG.
 */
export async function composeClipFrame(tpl: Template, ctx: AdContext): Promise<Blob | null> {
  const base = await baseAssets(ctx);
  if (!base.cut || !base.scene) return null;
  const probe = document.createElement("canvas");
  probe.width = 108;
  probe.height = 192;
  let spot: CarPlacement | null = null;
  capturePlacement((p) => (spot = p));
  const resolved = resolveTemplate(tpl, ctx.brand.makes);
  drawFrame(probe, tpl, { ...ctx, ad: { ...ctx.ad, clip: undefined } }, { ...base, plate: null }, resolved.dur, resolved);
  capturePlacement(null);
  if (!spot) return null;
  const { cx, bottom, width } = spot as CarPlacement;
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 1280;
  const x = c.getContext("2d")!;
  x.scale(720 / W, 1280 / H);
  const def = sceneOf(ctx.ad);
  drawScene(x, base.scene, def, spot, base.cut.height / base.cut.width);
  placeCar(x, base.cut, def, cx - width / 2, bottom, width);
  return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.9));
}

/**
 * Dealer sites often serve model images through a resizer at thumbnail size
 * (`?width=270`). Ask for a large one — spots draw the car ~900px wide.
 */
export function hiRes(src: string) {
  const m = src.match(/^\/api\/img\?u=(.+)$/);
  const raw = m ? decodeURIComponent(m[1]) : src;
  const big = raw.replace(/([?&](?:width|w|imwidth|wid)=)(\d+)/gi, (all, k: string, n: string) => (Number(n) < 900 ? `${k}1200` : all));
  if (big === raw) return src;
  return m ? `/api/img?u=${encodeURIComponent(big)}` : big;
}

/** A car photo as a JPEG on white, no larger than 1280px (for sending to Higgsfield). */
export async function photoJpeg(src: string): Promise<Blob | null> {
  const img = await loadImage(hiRes(src));
  if (!img || !img.naturalWidth) return null;
  const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", 0.9));
}

export async function baseAssets(ctx: AdContext): Promise<Omit<Assets, "plate">> {
  // stock cars ship with pre-made transparent cutouts
  const stock = ctx.ad.vehicleImage.match(/^\/cars\/(\w+)\.jpg$/)?.[1];
  await ensureBrandFonts(ctx.brand);
  const [logo, car, car2, scene, cutSrc] = await Promise.all([
    loadImage(ctx.brand.logo),
    loadImage(ctx.ad.vehicleImage),
    loadImage(ctx.brand.vehicles[1]?.image ?? ctx.ad.vehicleImage),
    loadImage(sceneOf(ctx.ad).src),
    stock ? loadImage(`/cars/cut/${stock}.png`) : loadImage(hiRes(ctx.ad.vehicleImage)),
  ]);
  // main photo failed: walk the car's backup photos before giving up on a generic stand-in
  let carImg = car;
  for (const alt of ctx.ad.vehicleImages ?? []) {
    if (carImg) break;
    if (alt !== ctx.ad.vehicleImage) carImg = await loadImage(alt);
  }
  carImg ??= await loadImage("/cars/suv.jpg");
  return { logo, car: carImg, car2, scene, cut: cutoutCar(cutSrc ?? carImg) ?? (cutSrc ? cutoutCar(carImg) : null) };
}

// ---------- drawing ----------

export function drawFrame(
  canvas: HTMLCanvasElement,
  tpl: Template,
  ctx: AdContext,
  assets: Assets,
  t: number,
  resolved = resolveTemplate(tpl, ctx.brand.makes)
) {
  const c = canvas.getContext("2d");
  if (!c) return;
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  c.globalAlpha = 1;
  c.filter = "none";
  const scene: Scene = {
    ctx: c,
    t,
    dur: resolved.dur,
    brand: ctx.brand,
    ad: ctx.ad,
    a: assets,
    font: brandFont(ctx.brand),
    p: resolved.params,
  };
  try {
    c.save();
    ENGINES[tpl.engine](scene);
    c.restore();
    stockCaveat(scene, tpl);
  } catch (e) {
    c.restore();
    console.error(`[${tpl.id}] frame failed`, e);
  }
}

/**
 * OEM kit §7.8: when the car is a stock render (jelly-bean shots, our sample cars)
 * or AI footage, say so: "Vehicle shown may differ", white on a dark band, bottom-right.
 */
function stockCaveat(s: Scene, tpl: Template) {
  if (!s.brand.compliance?.stockCaveat) return;
  const img = decodeURIComponent(s.ad.vehicleImage ?? "");
  const stock = tpl.engine === "cinematic" || s.ad.angled || /^\/cars\/|\/chrome\/|chromedata|evox|izmo|jelly|carshot/i.test(img);
  if (!stock) return;
  const { ctx } = s;
  ctx.save();
  const label = "Vehicle shown may differ";
  ctx.font = `400 20px ${s.font}`;
  const w = ctx.measureText(label).width + 24;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(W - w - 16, H - 42, w, 30);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(label, W - 28, H - 27);
  ctx.restore();
}

// ---------- plates ----------

export function makePlateVideo(src: string, muted = true): HTMLVideoElement {
  const v = document.createElement("video");
  v.src = src;
  v.muted = muted;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  return v;
}

export function waitForVideo(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    v.addEventListener("canplaythrough", done, { once: true });
    v.addEventListener("error", done, { once: true });
    setTimeout(done, 8000);
  });
}

// ---------- music bed ----------

/**
 * A small synthesized beat so motion-graphics ads never ship silent. Plates
 * bring their own AI-generated sound instead.
 */
export function scheduleBeat(ac: BaseAudioContext, out: AudioNode, start: number, dur: number, seed = 0) {
  const bpm = 104 + (seed % 4) * 6;
  const beat = 60 / bpm;
  const master = ac.createGain();
  master.gain.value = 0.55;
  master.connect(out);
  const noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  const kick = (t: number) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  };
  const hat = (t: number, v = 0.12) => {
    const s = ac.createBufferSource();
    s.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 8000;
    const g = ac.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + 0.06);
  };
  const clap = (t: number) => {
    const s = ac.createBufferSource();
    s.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1800;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + 0.2);
  };
  const roots = [43.65, 43.65, 49, 38.89];
  const bass = (t: number, f0: number) => {
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.value = f0 * 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.8);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + beat * 2);
  };
  const pad = (t: number, f0: number, len: number) => {
    for (const mult of [4, 5, 6]) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f0 * mult;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  };
  const n = Math.ceil(dur / beat);
  for (let i = 0; i < n; i++) {
    const t = start + i * beat;
    if (i % 4 === 0 || i % 8 === 6) kick(t);
    if (i % 4 === 2) clap(t);
    hat(t + beat / 2, 0.08);
    if (i % 2 === 0) hat(t, 0.05);
    const bar = Math.floor(i / 4) % 4;
    if (i % 4 === 0) {
      bass(t, roots[bar]);
      pad(t, roots[bar], beat * 4);
    }
  }
  // fade out
  master.gain.setValueAtTime(0.55, start + Math.max(0, dur - 0.6));
  master.gain.linearRampToValueAtTime(0.0001, start + dur);
  return master;
}

// ---------- export ----------

function pickMime(): { mime: string; ext: "mp4" | "webm" } {
  const cands: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.640028,mp4a.40.2", "mp4"],
    ["video/mp4;codecs=avc1,mp4a", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [m, e] of cands) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return { mime: m, ext: e };
  return { mime: "video/webm", ext: "webm" };
}

export type AdSize = "9x16" | "4x5" | "1x1" | "16x9";
export const SIZES: Record<AdSize, { w: number; h: number; label: string; use: string }> = {
  "9x16": { w: 1080, h: 1920, label: "9:16", use: "TikTok · Reels · Shorts · Stories" },
  "4x5": { w: 1080, h: 1350, label: "4:5", use: "Instagram & Facebook feed" },
  "1x1": { w: 1080, h: 1080, label: "1:1", use: "Facebook feed · Marketplace" },
  "16x9": { w: 1920, h: 1080, label: "16:9", use: "YouTube · website" },
};

/**
 * Re-frames the 9:16 master for other placements: the vertical ad sits on a
 * blurred, enlarged copy of itself (no cropping, so no text is ever cut off),
 * and the wide format gets branded side panels.
 */
function composeInto(out: HTMLCanvasElement, master: HTMLCanvasElement, tiny: HTMLCanvasElement, ctx: AdContext, logo: HTMLImageElement | null) {
  const c = out.getContext("2d")!;
  const { width: W2, height: H2 } = out;
  // cheap blur: shrink, then let smoothing do the work on the way back up
  const t = tiny.getContext("2d")!;
  t.drawImage(master, 0, 0, tiny.width, tiny.height);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  const scaleBg = Math.max(W2 / 1080, H2 / 1920);
  c.drawImage(tiny, (W2 - 1080 * scaleBg) / 2, (H2 - 1920 * scaleBg) / 2, 1080 * scaleBg, 1920 * scaleBg);
  c.fillStyle = "rgba(8,10,16,.38)";
  c.fillRect(0, 0, W2, H2);
  const h = H2;
  const w = (h * 9) / 16;
  const x = (W2 - w) / 2;
  c.save();
  c.shadowColor = "rgba(0,0,0,.45)";
  c.shadowBlur = 40;
  c.drawImage(master, x, 0, w, h);
  c.restore();
  if (W2 <= H2 * 1.2) return;
  // wide: side panels — logo + offer on the left, CTA + contact on the right
  const font = adFont();
  const panelW = x;
  const primary = ctx.brand.colors.primary;
  c.save();
  if (logo && logo.naturalWidth > 2) {
    const lh = 90;
    const lw = Math.min(panelW - 160, (lh * logo.naturalWidth) / logo.naturalHeight);
    c.fillStyle = "#fff";
    const pw = lw + 70;
    const px = (panelW - pw) / 2;
    c.beginPath();
    c.roundRect(px, 300, pw, lh + 50, 70);
    c.fill();
    c.drawImage(logo, px + 35, 325, lw, lh);
  } else {
    c.fillStyle = "#fff";
    c.font = `800 54px ${font}`;
    c.textAlign = "center";
    c.fillText(ctx.brand.name, panelW / 2, 380, panelW - 120);
  }
  c.fillStyle = "#fff";
  c.textAlign = "center";
  c.font = `900 64px ${font}`;
  const words = ctx.ad.offer.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const wd of words) {
    const test = line ? line + " " + wd : wd;
    if (c.measureText(test).width > panelW - 140 && line) {
      lines.push(line);
      line = wd;
    } else line = test;
  }
  lines.push(line);
  lines.slice(0, 4).forEach((l, i) => c.fillText(l, panelW / 2, 560 + i * 74));
  const rx = x + w + panelW / 2;
  c.fillStyle = primary;
  c.beginPath();
  c.roundRect(rx - 260, 470, 520, 120, 60);
  c.fill();
  c.fillStyle = "#fff";
  c.font = `800 46px ${font}`;
  c.fillText(ctx.ad.cta, rx, 545, 480);
  c.font = `600 36px ${font}`;
  c.fillStyle = "rgba(255,255,255,.85)";
  if (ctx.brand.phone) c.fillText(ctx.brand.phone, rx, 660);
  if (ctx.brand.city) c.fillText(`${ctx.brand.city}${ctx.brand.state ? ", " + ctx.brand.state : ""}`, rx, 710);
  c.restore();
}

/**
 * Renders the ad in real time and records it in every requested size at
 * once — one pass, one shared audio track. Runs entirely in the browser —
 * no render server, no per-video cost.
 */
export async function exportAds(
  tpl: Template,
  ctx: AdContext,
  sizes: AdSize[],
  onProgress: (k: number) => void
): Promise<{ size: AdSize; blob: Blob; ext: string }[]> {
  const resolved = resolveFor(tpl, ctx);
  const master = document.createElement("canvas");
  master.width = 1080;
  master.height = 1920;
  const tiny = document.createElement("canvas");
  tiny.width = 54;
  tiny.height = 96;
  const base = await baseAssets(ctx);
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  let video: HTMLVideoElement | null = null;
  if (resolved.plate) {
    video = makePlateVideo(resolved.plate, false);
    await waitForVideo(video);
    ac.createMediaElementSource(video).connect(dest);
  }
  const assets: Assets = { ...base, plate: video };
  drawFrame(master, tpl, ctx, assets, 0, resolved);

  const { mime, ext } = pickMime();
  const outs = sizes.map((size) => {
    const canvas = size === "9x16" ? master : Object.assign(document.createElement("canvas"), { width: SIZES[size].w, height: SIZES[size].h });
    const stream = canvas.captureStream(30);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr.clone()));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: sizes.length > 1 ? 7_000_000 : 10_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    return { size, canvas, rec, chunks, stopped };
  });
  for (const o of outs) if (o.size !== "9x16") composeInto(o.canvas, master, tiny, ctx, base.logo);

  await ac.resume();
  outs.forEach((o) => o.rec.start(250));
  const t0 = performance.now();
  // AI clips are generated silent, so they get the beat too
  if (!ownAudio(tpl) && (!video || resolved.clip)) scheduleBeat(ac, dest, ac.currentTime + 0.02, resolved.dur, tpl.id.length);
  if (video) {
    video.currentTime = 0;
    await video.play().catch(() => {});
  }
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawFrame(master, tpl, ctx, assets, Math.min(t, resolved.dur), resolved);
      for (const o of outs) if (o.size !== "9x16") composeInto(o.canvas, master, tiny, ctx, base.logo);
      onProgress(Math.min(1, t / resolved.dur));
      if (t >= resolved.dur) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  outs.forEach((o) => o.rec.stop());
  await Promise.all(outs.map((o) => o.stopped));
  video?.pause();
  await ac.close();
  return outs.map((o) => ({ size: o.size, blob: new Blob(o.chunks, { type: mime.split(";")[0] }), ext }));
}

/** Single 9:16 export (kept for callers that only need the vertical cut). */
export async function exportAd(tpl: Template, ctx: AdContext, onProgress: (k: number) => void) {
  const [r] = await exportAds(tpl, ctx, ["9x16"], onProgress);
  return { blob: r.blob, ext: r.ext };
}
