import { connection } from "next/server";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";
import { fail, frontUsd, hfAuth, mockMode, status, submitFront } from "@/lib/server/clips";

export const maxDuration = 60;

/** GET → configured + USD estimate. GET ?id=… → job status (the image lands in Blob like a background). */
export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ available: false });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ available: true, demo: mockMode(), usd: await frontUsd(auth) });
  if (!/^[\w-]{6,80}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    return Response.json(await status(auth, "scene", id));
  } catch (e) {
    return fail(e);
  }
}

/** POST multipart {photo: image} → {requestId}. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ error: "Add your Higgsfield API key and secret in /admin first." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof Blob) || photo.size < 2000 || photo.size > 3_000_000 || !/^image\/(jpeg|png|webp)$/.test(photo.type)) {
    return Response.json({ error: "photo must be an image under 3 MB" }, { status: 400 });
  }
  try {
    const requestId = await submitFront(auth, photo);
    await logActivity({ type: "clip", label: "Front 3/4 view", detail: requestId }).catch(() => {});
    return Response.json({ requestId });
  } catch (e) {
    return fail(e);
  }
}
