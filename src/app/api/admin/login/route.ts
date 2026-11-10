import { adminConfigured, adminCookie, checkPassword, throttle } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";

export async function POST(req: Request) {
  if (!adminConfigured()) return Response.json({ error: "not configured" }, { status: 503 });
  if (!throttle(req)) return Response.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) return Response.json({ error: "Wrong password" }, { status: 401 });
  await logActivity({ type: "admin", label: "Admin signed in" });
  return new Response(JSON.stringify({ ok: true }), { headers: { "set-cookie": adminCookie(), "content-type": "application/json" } });
}
