import { sceneById, type Scene as SceneDef } from "../spot";
import type { AdInputs } from "../types";

/**
 * Puts a cut-out car into a background so it reads as photographed there:
 * the scene is moved under the car (horizon at the car's eye level, road
 * centre under the tyres), the car takes on the scene's light, and it gets a
 * contact shadow and — on wet or glossy floors — a reflection.
 */

export const W = 1080;
export const H = 1920;

export type CarPlacement = { cx: number; bottom: number; width: number };

/** Where a camera at headlight height sees the horizon: about half-way up the car. */
const EYE = 0.5;

export const sceneOf = (ad: AdInputs): SceneDef => ad.spot?.customScene ?? sceneById(ad.spot?.scene);

type Img = CanvasImageSource & { width: number; height: number };
const dims = (img: Img) => {
  const v = img as HTMLImageElement & HTMLVideoElement;
  return { iw: v.naturalWidth || v.videoWidth || img.width, ih: v.naturalHeight || v.videoHeight || img.height };
};

/**
 * Draw the background fitted to a parked car. With no car (or no fit data)
 * it's a plain centred cover. `zoom` ≥ 1 is a slow push-in about the horizon.
 */
export function drawScene(ctx: CanvasRenderingContext2D, img: Img, def: SceneDef, p: CarPlacement | null, carAspect: number, zoom = 1) {
  const { iw, ih } = dims(img);
  if (!iw || !ih) return;
  const hz = def.horizon;
  const yH = p ? p.bottom - p.width * carAspect * EYE : hz * H;
  // tall enough to cover the frame AND land the horizon at yH
  const Hi = Math.max(H, (W * ih) / iw, yH / hz, (H - yH) / (1 - hz)) * zoom;
  const Wi = (Hi * iw) / ih;
  const y0 = yH - hz * Hi;
  const x0 = Math.min(0, Math.max(W - Wi, (p ? p.cx : W / 2) - def.roadX * Wi));
  ctx.drawImage(img, x0, y0, Wi, Hi);
}

// ---------- lighting ----------

const lit = new WeakMap<object, Map<string, HTMLCanvasElement>>();

/** The cut-out washed with the scene's ambient light (cached per car × scene). */
export function litCar(cut: HTMLCanvasElement, def: SceneDef): HTMLCanvasElement {
  if (def.tintAmount <= 0.001) return cut;
  let m = lit.get(cut);
  if (!m) lit.set(cut, (m = new Map()));
  const key = `${def.id}|${def.tint}|${def.tintAmount}`;
  let c = m.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = cut.width;
    c.height = cut.height;
    const x = c.getContext("2d")!;
    x.drawImage(cut, 0, 0);
    x.globalCompositeOperation = "source-atop";
    // dark scenes: pull the whole car down; bright ones: a soft colour cast
    x.globalAlpha = def.tintAmount;
    x.fillStyle = def.tint;
    x.fillRect(0, 0, c.width, c.height);
    if (def.dark) {
      // keep a little specular life on top so it doesn't go flat
      const g = x.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, "rgba(160,190,255,.18)");
      g.addColorStop(0.5, "rgba(160,190,255,0)");
      x.globalAlpha = 1;
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
    }
    m.set(key, c);
  }
  return c;
}

const refl = new WeakMap<object, HTMLCanvasElement>();

/** Mirror image of the car fading out, for wet roads and showroom floors. */
function reflection(car: HTMLCanvasElement) {
  let c = refl.get(car);
  if (!c) {
    c = document.createElement("canvas");
    c.width = car.width;
    c.height = Math.round(car.height * 0.6);
    const x = c.getContext("2d")!;
    x.translate(0, car.height);
    x.scale(1, -1);
    x.drawImage(car, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "destination-in";
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    refl.set(car, c);
  }
  return c;
}

/** A soft ambient pool plus a tight dark contact line under the tyres, so the car sits on the road. */
export function groundShadow(ctx: CanvasRenderingContext2D, cx: number, bottom: number, width: number, k: number) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.7 * k;
  ctx.filter = "blur(16px)";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, bottom + 6, width * 0.52, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.9 * k;
  ctx.filter = "blur(5px)";
  ctx.beginPath();
  ctx.ellipse(cx, bottom, width * 0.46, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Shadow + reflection + lit car, at (x, bottom) with the given size. */
export function placeCar(ctx: CanvasRenderingContext2D, cut: HTMLCanvasElement, def: SceneDef, x: number, bottom: number, w: number, k = 1) {
  const car = litCar(cut, def);
  const h = (w * car.height) / car.width;
  groundShadow(ctx, x + w / 2, bottom, w, k * def.shadow);
  if (def.reflect > 0) {
    const r = reflection(car);
    ctx.save();
    ctx.globalAlpha = def.reflect * k;
    ctx.drawImage(r, x, bottom - 4, w, (w * r.height) / r.width);
    ctx.restore();
  }
  ctx.drawImage(car, x, bottom - h, w, h);
  return car;
}
