import { connection } from "next/server";
import { accessCookie, accessHash, hasAccess, throttle } from "@/lib/server/auth";
import { loadSettings, safeEqual } from "@/lib/server/settings";

export async function GET(req: Request) {
  await connection();
  const s = await loadSettings().catch(() => null);
  return Response.json({ required: !!s?.access.required, granted: await hasAccess(req) });
}

export async function POST(req: Request) {
  if (!throttle(req)) return Response.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const s = await loadSettings(true);
  if (!s.access.codeHash || !code || !safeEqual(accessHash(code), s.access.codeHash)) {
    return Response.json({ error: "That code isn't right" }, { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "set-cookie": accessCookie(), "content-type": "application/json" } });
}
