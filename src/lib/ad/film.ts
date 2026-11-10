"use client";

import { photoJpeg } from "./runtime";
import { CUSTOM_ID, cinematicById, plateOf, type TierId } from "../cinematic";
import type { AdInputs } from "../types";
import type { ClipJob, SavedAd } from "../workspace";

export type FilmJob = NonNullable<SavedAd["cine"]>;

/**
 * Starts the AI filming of a dealer's car for one cinematic template: the car
 * photo and the template's location plate go to Higgsfield with the template
 * prompt (plus the dealer's optional text prompt). Returns the queued job.
 */
export async function startFilm(
  inputs: AdInputs,
  cid: string,
  tier: TierId,
  direction = inputs.direction ?? "",
  mode = inputs.promptMode ?? "add",
  refs: Blob[] = []
): Promise<FilmJob & { refIds?: string[] }> {
  const c = cinematicById(cid);
  if (!c) throw new Error("Unknown template");
  const custom = cid === CUSTOM_ID;
  if ((mode === "own" || custom) && direction.trim().length < 10) throw new Error("Write your prompt first (a sentence or two about the place and shots).");
  const [first, plate] = await Promise.all([photoJpeg(inputs.vehicleImage), custom ? Promise.resolve(null) : fetch(plateOf(c.id)).then((r) => (r.ok ? r.blob() : null))]);
  // the main photo failed: try the car's backup photos
  let car = first;
  for (const alt of inputs.vehicleImages ?? []) {
    if (car) break;
    if (alt !== inputs.vehicleImage) car = await photoJpeg(alt);
  }
  if (!car) throw new Error("We couldn't load this car's photo. Pick another car.");
  if (!custom && !plate) throw new Error("This template's location image is missing.");
  const fd = new FormData();
  fd.append("cid", c.id);
  fd.append("tier", tier);
  fd.append("vehicle", inputs.vehicleName ?? "");
  if (direction.trim()) {
    fd.append("direction", direction.trim());
    fd.append("mode", custom ? "own" : mode);
  }
  fd.append("car", car, "car.jpg");
  if (plate) fd.append("plate", new Blob([plate], { type: "image/jpeg" }), "plate.jpg");
  if (custom) {
    fd.append("seconds", String(inputs.seconds ?? c.seconds));
    refs.forEach((r, i) => fd.append("ref", r, `ref-${i}.jpg`));
    if (!refs.length && inputs.refIds?.length) fd.append("refIds", inputs.refIds.join(","));
  }
  const r = await fetch("/api/cinematic", { method: "POST", body: fd });
  const d = (await r.json()) as { requestId?: string; refIds?: string[]; error?: string };
  if (!r.ok || !d.requestId) throw new Error(d.error ?? "Couldn't start the render");
  return { requestId: d.requestId, status: "queued", startedAt: Date.now(), car: inputs.vehicleImage, direction: direction.trim() || undefined, mode: custom ? "own" : mode, refIds: d.refIds };
}

/** One status check; a finished clip is written into the ad's inputs so it plays everywhere. */
export async function pollFilm(ad: SavedAd): Promise<Partial<SavedAd> | null> {
  const job = ad.cine;
  if (!job || (job.status !== "queued" && job.status !== "in_progress")) return null;
  const r = await fetch(`/api/cinematic?id=${job.requestId}`, { cache: "no-store" });
  const d = (await r.json().catch(() => ({}))) as Partial<ClipJob> & { error?: string };
  if (!r.ok) return r.status === 401 ? { cine: { ...job, status: "failed", error: d.error ?? "Higgsfield rejected the key" } } : null;
  if (!d.status || d.status === job.status) return null;
  const cine: FilmJob = { ...job, status: d.status, url: d.url, error: d.error };
  if (d.status !== "completed" || !d.url) return { cine };
  const cid = String(ad.templateId); // cinematic template ids are their own cid (custom-prompt included)
  return { cine, inputs: { ...ad.inputs, cinematic: { ...(ad.inputs.cinematic ?? {}), [cid]: d.url } } };
}
