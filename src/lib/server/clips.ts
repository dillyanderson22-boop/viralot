import { head, issueSignedToken, presignUrl, put } from "@vercel/blob";
import { getSecret } from "./settings";
import type { Tier } from "../cinematic";

/**
 * AI media through the dealer's own Higgsfield account:
 *  - rolling clips: our composed first frame → image-to-video
 *  - backgrounds: a road scene from the dealer's description → text-to-image
 * Finished files are copied into our private Blob store (Higgsfield only keeps
 * outputs ~7 days) and served through short-lived signed links.
 *
 * With VIRALOT_HF_MOCK=1 (local only) nothing is sent to Higgsfield: jobs
 * "finish" after a few seconds with bundled media, so the flow can be tried
 * before an API key exists.
 */

const API = "https://api.higgsfield.ai";

export const CLIP_MODELS = {
  seedance: { endpoint: "bytedance/seedance-2.0/image-to-video", label: "Seedance 2.0" },
  kling: { endpoint: "kling-video/v3.0/std/image-to-video", label: "Kling 3.0" },
} as const;
export type ClipModel = keyof typeof CLIP_MODELS;

export const SCENE_ENDPOINT = "higgsfield-ai/soul/v2/standard";

export type Kind = "clip" | "scene";

export const CLIP_SECONDS = 8;

export const CLIP_PROMPT =
  "Cinematic car commercial, tracking shot. The camera moves smoothly alongside the car as it drives forward down the road at a steady speed; the car stays in the same place in frame, wheels turning, the background and road scrolling past with natural motion blur. Keep the car's exact shape, colour and badges. Photoreal, stable, no text, no logos added, no people.";

/** Framing every generated background must follow so any car can be placed on it (see CUSTOM_FIT). */
export function scenePrompt(place: string) {
  return [
    "Vertical 9:16 photograph for a car commercial.",
    `Location: ${place}.`,
    "An empty road seen from eye level (camera about 1.2 m high) looking straight down the middle of the road, which runs away from the camera to a vanishing point in the centre of the frame.",
    "The horizon sits just below the middle of the frame; the road surface fills the bottom 40% of the image, clean and unobstructed.",
    "No vehicles, no people, no text, no signs with words, no logos. Photoreal, natural light, sharp, high dynamic range, commercial photography.",
  ].join(" ");
}

export const mockMode = () => process.env.VIRALOT_HF_MOCK === "1" && process.env.VERCEL_ENV !== "production";

export const fail = (e: unknown) => {
  const err = e as Error & { status?: number };
  return Response.json({ error: err.message || "Higgsfield request failed" }, { status: err.status === 401 || err.status === 403 ? 401 : 502 });
};

export async function hfAuth() {
  if (mockMode()) return "mock";
  const [rawId, rawSecret] = await Promise.all([getSecret("higgsfieldKey"), getSecret("higgsfieldSecret")]);
  // forgive common pastes: surrounding spaces, a leading "Key ", or "id:secret" in the key field
  let id = (rawId ?? "").trim().replace(/^key\s+/i, "");
  let secret = (rawSecret ?? "").trim();
  // a whole "id:secret" pasted into either box (or both) is split back into its halves
  const pair = [id, secret].find((v) => /^[^:\s]+:[^:\s]+$/.test(v));
  if (pair) [id, secret] = [pair.slice(0, pair.indexOf(":")), pair.slice(pair.indexOf(":") + 1)];
  if (!id || !secret) return null;
  return `Key ${id}:${secret}`;
}

/** A free call that proves the key works (an estimate never spends credits). */
export async function checkHiggsfield(auth: string): Promise<{ ok: boolean; message: string }> {
  try {
    await hf(auth, `estimate/${SCENE_ENDPOINT}`, { method: "POST", json: sceneBody(scenePrompt("a road")) });
    return { ok: true, message: "Higgsfield accepted the key" };
  } catch (e) {
    const st = (e as { status?: number }).status;
    if (st === 401 || st === 403)
      return { ok: false, message: "Higgsfield says these credentials are invalid. Create a new API key at cloud.higgsfield.ai and paste its key ID and secret here." };
    return { ok: false, message: `Higgsfield: ${(e as Error).message}` };
  }
}

function clipBody(model: ClipModel, imageUrl: string, prompt: string) {
  return model === "seedance"
    ? { image_url: imageUrl, prompt, duration: CLIP_SECONDS, resolution: "720p", generate_audio: false }
    : { image_url: imageUrl, prompt, duration: CLIP_SECONDS };
}
const sceneBody = (prompt: string) => ({ prompt, aspect_ratio: "9:16", resolution: "1080p" });

async function hf(auth: string, path: string, init?: { method?: string; json?: unknown }) {
  const res = await fetch(`${API}/${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: auth, "content-type": "application/json", accept: "application/json" },
    body: init?.json ? JSON.stringify(init.json) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const raw = data.detail ?? data.error ?? data.message ?? `Higgsfield ${res.status}`;
    const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
    // shows up in the Vercel logs; the request body and key are never logged
    console.warn(`[higgsfield] ${init?.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${msg.slice(0, 300)}`);
    throw Object.assign(new Error(msg.slice(0, 240)), { status: res.status });
  }
  return data;
}

/** Credits a job would cost, when Higgsfield's estimate endpoint answers. */
export async function estimate(auth: string, kind: Kind, model: ClipModel = "seedance"): Promise<number | null> {
  if (auth === "mock") return null;
  try {
    const d =
      kind === "clip"
        ? await hf(auth, `estimate/${CLIP_MODELS[model].endpoint}`, { method: "POST", json: clipBody(model, "https://example.com/frame.jpg", CLIP_PROMPT) })
        : await hf(auth, `estimate/${SCENE_ENDPOINT}`, { method: "POST", json: sceneBody(scenePrompt("a road")) });
    const n = Number(d.credits ?? d.cost ?? d.estimated_credits ?? (d.estimate as Record<string, unknown> | undefined)?.credits);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const framePath = (id: string) => `clips/frames/${id}.jpg`;
export const filePath = (kind: Kind, requestId: string) => (kind === "clip" ? `clips/${requestId}.mp4` : `scenes/${requestId}.jpg`);
export const fileRoute = (kind: Kind, requestId: string) => `/api/clips/file?id=${requestId}${kind === "scene" ? "&kind=scene" : ""}`;

async function signedGet(pathname: string, ms: number) {
  const tok = await issueSignedToken({ pathname, operations: ["get"], validUntil: Date.now() + ms });
  return (await presignUrl(tok, { operation: "get", pathname, access: "private" })).presignedUrl;
}

const requestIdOf = (d: Record<string, unknown>) => {
  const id = String(d.request_id ?? d.id ?? "");
  if (!id) throw new Error("Higgsfield did not return a request id");
  return id;
};

export async function submitClip(auth: string, model: ClipModel, frame: Blob, direction?: string): Promise<string> {
  if (auth === "mock") return `mock-clip-${Date.now()}`;
  const id = crypto.randomUUID();
  await put(framePath(id), frame, { access: "private", addRandomSuffix: false, contentType: "image/jpeg" });
  // Higgsfield needs a public URL for the input image: a one-hour signed link.
  const url = await signedGet(framePath(id), 3600_000);
  const d = direction?.replace(/\s+/g, " ").trim().slice(0, 500);
  // the dealer's direction rides on top of the fixed framing (the car must stay where the layout put it)
  const prompt = d ? `${CLIP_PROMPT} Dealer's direction: ${d}` : CLIP_PROMPT;
  return requestIdOf(await hf(auth, CLIP_MODELS[model].endpoint, { method: "POST", json: clipBody(model, url, prompt) }));
}

/** Cinematic templates: Seedance with the dealer's car and the template's location plate as references. */
function cinematicBody(t: Tier, o: { prompt: string; seconds: number }, ...images: string[]) {
  return {
    image_urls: images,
    prompt: o.prompt,
    duration: Math.min(o.seconds, t.maxSeconds),
    resolution: t.resolution,
    aspect_ratio: "9:16",
    generate_audio: true,
    ...(t.bitrate ? { bitrate_mode: t.bitrate } : {}),
  };
}

/**
 * One cinematic render: the car photo first, then either the template's location
 * plate or the dealer's own reference images (new uploads and ones kept from an
 * earlier render). Reference uploads stay in private Blob so a redo can reuse them.
 */
export async function submitCinematic(
  auth: string,
  o: { cid: string; prompt: string; seconds: number; car: Blob; plate?: Blob; refs?: Blob[]; refIds?: string[]; tier: Tier }
): Promise<{ requestId: string; refIds: string[] }> {
  const id = crypto.randomUUID();
  const refIds = [...(o.refIds ?? [])];
  if (auth === "mock") return { requestId: `mock-cine-${o.cid}-${Date.now()}`, refIds: [...refIds, ...(o.refs ?? []).map((_, i) => `mock-${id}-${i}`)] };
  const carPath = `clips/refs/${id}-car.jpg`;
  const platePath = `clips/refs/${id}-plate.jpg`;
  const newRefs = (o.refs ?? []).map((b, i) => ({ b, path: `clips/refs/${id}-ref-${i}.jpg` }));
  await Promise.all([
    put(carPath, o.car, { access: "private", addRandomSuffix: false, contentType: o.car.type || "image/jpeg" }),
    ...(o.plate ? [put(platePath, o.plate, { access: "private", addRandomSuffix: false, contentType: o.plate.type || "image/jpeg" })] : []),
    ...newRefs.map((r) => put(r.path, r.b, { access: "private", addRandomSuffix: false, contentType: r.b.type || "image/jpeg" })),
  ]);
  refIds.push(...newRefs.map((r) => r.path.replace(/^clips\/refs\//, "").replace(/\.jpg$/, "")));
  const urls = await Promise.all([
    signedGet(carPath, 3600_000),
    ...(o.plate ? [signedGet(platePath, 3600_000)] : []),
    ...refIds.map((r) => signedGet(`clips/refs/${r}.jpg`, 3600_000)),
  ]);
  const requestId = requestIdOf(await hf(auth, o.tier.endpoint, { method: "POST", json: cinematicBody(o.tier, o, ...urls) }));
  return { requestId, refIds };
}

/** Front three-quarter studio shot of a dealer car photo (most dealer sites only carry side profiles). */
const FRONT_PROMPT =
  "Show this exact same vehicle, keeping its model, generation, body style, trim, wheels, paint colour, lights and badges identical, from a front three-quarter view: the front of the vehicle faces the camera and points toward the left side of the frame at about 35 degrees, camera at headlight height. The whole vehicle is in frame with a small margin, centred. Pure white seamless studio background, soft even studio light, only a faint contact shadow under the tyres, no reflections, no floor line. Photoreal automotive press photo. No text, no logos added, no people, no other vehicles.";

/**
 * Image-edit models for the front view, best first. GPT Image 2.5 Flare was
 * tested on a Honda model-row side shot and kept paint, wheels and trim exactly
 * (~0.5 credits); the others are fallbacks when an account can't use it.
 */
const FRONT_MODELS: { endpoint: string; body: (url: string) => Record<string, unknown> }[] = [
  { endpoint: "marketing-studio/image/flare", body: (url) => ({ prompt: FRONT_PROMPT, image_urls: [url], resolution: "1k", aspect_ratio: "3:2", quality: "medium" }) },
  { endpoint: "xai/grok-imagine-image-2.0", body: (url) => ({ prompt: FRONT_PROMPT, image_urls: [url], resolution: "1k", aspect_ratio: "3:2", quality: "medium" }) },
  { endpoint: "alibaba/qwen-image-3/edit", body: (url) => ({ prompt: FRONT_PROMPT, image_urls: [url], resolution: "1k", aspect_ratio: "3:2" }) },
];

export async function submitFront(auth: string, photo: Blob): Promise<string> {
  if (auth === "mock") return `mock-front-${Date.now()}`;
  const path = `clips/refs/${crypto.randomUUID()}-side.jpg`;
  await put(path, photo, { access: "private", addRandomSuffix: false, contentType: photo.type || "image/jpeg" });
  const url = await signedGet(path, 3600_000);
  let first: unknown;
  for (const m of FRONT_MODELS) {
    try {
      return requestIdOf(await hf(auth, m.endpoint, { method: "POST", json: m.body(url) }));
    } catch (e) {
      first ??= e;
      const st = (e as { status?: number }).status ?? 0;
      // only a refusal of this model is worth trying the next one for
      if (![400, 401, 403, 404, 422].includes(st)) throw e;
    }
  }
  throw first;
}

/** Higgsfield's USD estimate for one front shot, when it answers. */
export async function frontUsd(auth: string): Promise<number | null> {
  if (auth === "mock") return null;
  for (const m of FRONT_MODELS) {
    try {
      const d = await hf(auth, `estimate/${m.endpoint}`, { method: "POST", json: m.body("https://example.com/car.jpg") });
      const n = Number(d.usd);
      if (Number.isFinite(n)) return n;
    } catch {}
  }
  return null;
}

export async function submitScene(auth: string, place: string): Promise<string> {
  if (auth === "mock") return `mock-scene-${Date.now()}`;
  return requestIdOf(await hf(auth, SCENE_ENDPOINT, { method: "POST", json: sceneBody(scenePrompt(place)) }));
}

/** The output URL inside a status payload: images[0].url for images, video.url for video. */
function findOutput(d: Record<string, unknown>, kind: Kind): string | null {
  if (kind === "scene") {
    const u = (d.images as { url?: string }[] | undefined)?.[0]?.url ?? (d.image as { url?: string } | undefined)?.url;
    if (typeof u === "string") return u;
  } else {
    const u = (d.video as { url?: string } | undefined)?.url ?? (d.videos as { url?: string }[] | undefined)?.[0]?.url;
    if (typeof u === "string") return u;
  }
  return null;
}

export type JobStatus = { status: "queued" | "in_progress" | "completed" | "failed"; url?: string; error?: string };

const MOCK_SCENES = ["/scenes/coast.jpg", "/scenes/mountain.jpg", "/scenes/palms.jpg"];

function mockStatus(kind: Kind, requestId: string): JobStatus {
  const started = Number(requestId.split("-").pop());
  const age = Date.now() - started;
  const need = kind === "scene" ? 6000 : 14000;
  if (age < need * 0.3) return { status: "queued" };
  if (age < need) return { status: "in_progress" };
  if (requestId.startsWith("mock-front-")) return { status: "completed", url: "/cars/suv.jpg" };
  if (requestId.startsWith("mock-cine-")) {
    const cid = requestId.slice(10, requestId.lastIndexOf("-"));
    // a custom-prompt ad has no template sample: demo with one of the pack's clips
    return { status: "completed", url: `/templates/${cid === "custom-prompt" ? "rain-night-drive" : cid}/preview.mp4` };
  }
  return { status: "completed", url: kind === "scene" ? MOCK_SCENES[started % MOCK_SCENES.length] : "/templates/showroom-light-sweep/preview.mp4" };
}

export async function status(auth: string, kind: Kind, requestId: string): Promise<JobStatus> {
  if (requestId.startsWith("mock-")) return mockStatus(kind, requestId);
  // already copied? done.
  try {
    await head(filePath(kind, requestId));
    return { status: "completed", url: fileRoute(kind, requestId) };
  } catch {}
  const d = await hf(auth, `requests/${requestId}/status`);
  const st = String(d.status ?? "").toLowerCase();
  if (st === "completed") {
    const src = findOutput(d, kind);
    if (!src) return { status: "failed", error: "Finished, but nothing came back" };
    const r = await fetch(src);
    if (!r.ok || !r.body) return { status: "failed", error: `Couldn't download the result (${r.status})` };
    await put(filePath(kind, requestId), r.body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: kind === "clip" ? "video/mp4" : (r.headers.get("content-type") ?? "image/jpeg"),
      multipart: kind === "clip",
    });
    return { status: "completed", url: fileRoute(kind, requestId) };
  }
  if (st === "failed" || st === "nsfw" || st === "canceled" || st === "cancelled") {
    const why = typeof d.error === "string" && d.error ? `: ${d.error}` : "";
    return { status: "failed", error: st === "nsfw" ? "Higgsfield's safety filter rejected this" : `Generation ${st}${why}` };
  }
  return { status: st === "in_progress" ? "in_progress" : "queued" };
}

export const fileUrl = (kind: Kind, requestId: string) => signedGet(filePath(kind, requestId), 6 * 3600_000);
