import { connection } from "next/server";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";
import { fail, hfAuth, mockMode, status, submitCinematic } from "@/lib/server/clips";
import { CUSTOM_ID, buildCinematicPrompt, buildCustomPrompt, cinematicById, tierById } from "@/lib/cinematic";

export const maxDuration = 120;

/** GET → is Higgsfield configured. GET ?id=… → job status (finished files land in Blob like rolling clips). */
export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ available: false });
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  if (!id) return Response.json({ available: true, demo: mockMode() });
  if (!/^[\w-]{6,80}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    return Response.json(await status(auth, "clip", id));
  } catch (e) {
    return fail(e);
  }
}

const isImage = (b: unknown, max: number): b is Blob => b instanceof Blob && b.size > 2000 && b.size < max && /^image\/(jpeg|png|webp)$/.test(b.type);

/** POST multipart {cid, tier, vehicle, direction?, mode: add|own, car: image, plate: image} → {requestId}. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ error: "Add your Higgsfield API key and secret in /admin first." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const c = cinematicById(String(form?.get("cid") ?? ""));
  if (!c) return Response.json({ error: "unknown template" }, { status: 400 });
  const car = form?.get("car");
  const plate = form?.get("plate");
  const custom = c.id === CUSTOM_ID;
  if (!isImage(car, 2_500_000) || (!custom && !isImage(plate, 1_800_000))) return Response.json({ error: "car and plate must be images under 2.5 MB" }, { status: 400 });
  // "Create your own": up to 4 reference images (new uploads, or ones kept from an earlier render)
  const refs: Blob[] = custom ? (form?.getAll("ref") ?? []).flatMap((r) => (isImage(r, 2_500_000) ? [r as Blob] : [])).slice(0, 4) : [];
  const refIds = custom ? String(form?.get("refIds") ?? "").split(",").filter((r) => /^[\w-]{10,80}$/.test(r)).slice(0, 4 - refs.length) : [];
  const seconds = custom ? Math.max(5, Math.min(15, Math.round(Number(form?.get("seconds")) || c.seconds))) : c.seconds;
  const vehicle = String(form?.get("vehicle") ?? "").replace(/[^\w .,'&/+-]/g, "").trim().slice(0, 80);
  const direction = String(form?.get("direction") ?? "");
  const mode = form?.get("mode") === "own" ? "own" : "add";
  if ((mode === "own" || custom) && direction.trim().length < 10) return Response.json({ error: "Describe the video you want in a sentence or two." }, { status: 400 });
  const prompt = custom ? buildCustomPrompt(vehicle, direction, seconds, refs.length + refIds.length) : buildCinematicPrompt(c, vehicle, direction, mode);
  try {
    const tier = tierById(String(form?.get("tier") ?? ""));
    const { requestId, refIds: kept } = await submitCinematic(auth, { cid: c.id, prompt, seconds, car, plate: custom ? undefined : (plate as Blob), refs, refIds, tier });
    await logActivity({ type: "clip", label: c.name, detail: `${tier.label} (${tier.endpoint.split("/")[1]} ${tier.resolution})${direction.trim() ? ` · ${mode === "own" ? "own prompt" : "+ notes"}` : ""} ${requestId}` }).catch(() => {});
    return Response.json({ requestId, refIds: kept });
  } catch (e) {
    return fail(e);
  }
}
