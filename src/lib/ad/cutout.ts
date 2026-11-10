"use client";

/**
 * Cuts a vehicle out of a white/light studio background — the way nearly
 * every dealer inventory photo is shot — so it can be dropped onto a scene.
 * Flood-fills from the borders (so white paint on the car survives), feathers
 * the edge, and crops to the car. Returns null when the photo isn't on a
 * clean background; callers then fall back to using the photo full-bleed.
 */

const cache = new Map<string, HTMLCanvasElement | null>();

export function cutoutCar(img: HTMLImageElement | null): HTMLCanvasElement | null {
  if (!img || img.naturalWidth < 50) return null;
  const key = img.src;
  if (cache.has(key)) return cache.get(key)!;
  const scale = Math.min(1, 900 / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(img, 0, 0, w, h);
  let data: ImageData;
  try {
    data = x.getImageData(0, 0, w, h);
  } catch {
    cache.set(key, null);
    return null;
  }
  const d = data.data;
  const isBg = (i: number) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const mn = Math.min(r, g, b);
    const mx = Math.max(r, g, b);
    return d[i + 3] < 20 || (mn > 222 && mx - mn < 22);
  };

  // Only attempt it when the border really is a clean light background.
  let border = 0;
  let light = 0;
  for (let px = 0; px < w; px += 3) {
    for (const py of [0, h - 1]) {
      border++;
      if (isBg((py * w + px) * 4)) light++;
    }
  }
  for (let py = 0; py < h; py += 3) {
    for (const px of [0, w - 1]) {
      border++;
      if (isBg((py * w + px) * 4)) light++;
    }
  }
  if (light / border < 0.78) {
    cache.set(key, null);
    return null;
  }

  // Flood fill background from every border pixel.
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!bg[p] && isBg(p * 4)) {
      bg[p] = 1;
      stack.push(p);
    }
  };
  for (let px = 0; px < w; px++) {
    push(px);
    push((h - 1) * w + px);
  }
  for (let py = 0; py < h; py++) {
    push(py * w);
    push(py * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const px = p % w;
    if (px > 0) push(p - 1);
    if (px < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }

  // Alpha + 1px feather; track the car's bounding box.
  let minX = w, minY = h, maxX = 0, maxY = 0, fg = 0;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (bg[p]) {
      d[i + 3] = 0;
      continue;
    }
    fg++;
    const px = p % w;
    const py = (p / w) | 0;
    const edge = (px > 0 && bg[p - 1]) || (px < w - 1 && bg[p + 1]) || (py > 0 && bg[p - w]) || (py < h - 1 && bg[p + w]);
    if (edge) d[i + 3] = Math.min(d[i + 3], 170);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  // Nearly nothing left, or nothing removed: not a usable cutout.
  if (fg < w * h * 0.08 || fg > w * h * 0.92) {
    cache.set(key, null);
    return null;
  }
  x.putImageData(data, 0, 0);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  cache.set(key, out);
  return out;
}
