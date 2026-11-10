import { connection } from "next/server";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";
import { estimate, fail, hfAuth, mockMode, status, submitScene } from "@/lib/server/clips";

export const maxDuration = 60;

/** GET → configured + credit estimate. GET ?id=… → job status. */
export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ available: false });
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    if (!/^[\w-]{6,80}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
    try {
      return Response.json(await status(auth, "scene", id));
    } catch (e) {
      return fail(e);
    }
  }
  return Response.json({ available: true, demo: mockMode(), credits: await estimate(auth, "scene") });
}

/** POST {place} → {requestId}. The place description is wrapped in our road-framing prompt. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const auth = await hfAuth();
  if (!auth) return Response.json({ error: "Add your Higgsfield API key and secret in /admin first." }, { status: 400 });
  const b = (await req.json().catch(() => null)) as { place?: unknown } | null;
  const place = typeof b?.place === "string" ? b.place.replace(/\s+/g, " ").trim() : "";
  if (place.length < 3 || place.length > 300) return Response.json({ error: "Describe the place in a few words (under 300 characters)." }, { status: 400 });
  try {
    const requestId = await submitScene(auth, place);
    await logActivity({ type: "clip", label: "Background", detail: place.slice(0, 80) }).catch(() => {});
    return Response.json({ requestId });
  } catch (e) {
    return fail(e);
  }
}
