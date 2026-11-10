import { connection } from "next/server";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";
import { CLIP_MODELS, estimate, fail, hfAuth, mockMode, status, submitClip, type ClipModel } from "@/lib/server/clips";

export const maxDuration = 120;

const isModel = (m: unknown): m is ClipModel => typeof m === "string" && m in CLIP_MODELS;
/** GET ?model=… → is it configured + credit estimate. GET ?id=… → job status. */
export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  const q = new URL(req.url).searchParams;
  if (!auth) return Response.json({ available: false });
  const id = q.get("id");
  if (id) {
    if (!/^[\w-]{6,80}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
    try {
      return Response.json(await status(auth, "clip", id));
    } catch (e) {
      return fail(e);
    }
  }
  const model = q.get("model") ?? "seedance";
  if (!isModel(model)) return Response.json({ error: "unknown model" }, { status: 400 });
  return Response.json({ available: true, demo: mockMode(), credits: await estimate(auth, "clip", model) });
}

/** POST multipart {frame: jpeg, model} → {requestId}. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ error: "Add your Higgsfield API key and secret in /admin first." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const frame = form?.get("frame");
  const model = form?.get("model") ?? "seedance";
  if (!(frame instanceof Blob) || frame.size < 2000 || frame.size > 3_000_000 || !/^image\/(jpeg|png)$/.test(frame.type)) {
    return Response.json({ error: "frame must be a JPEG under 3 MB" }, { status: 400 });
  }
  if (!isModel(model)) return Response.json({ error: "unknown model" }, { status: 400 });
  try {
    const requestId = await submitClip(auth, model, frame, String(form?.get("direction") ?? ""));
    await logActivity({ type: "clip", label: "Rolling clip", detail: `${CLIP_MODELS[model].label} ${requestId}` }).catch(() => {});
    return Response.json({ requestId });
  } catch (e) {
    return fail(e);
  }
}
