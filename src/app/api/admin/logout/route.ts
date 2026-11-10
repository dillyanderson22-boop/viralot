import { clearAdminCookie } from "@/lib/server/auth";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "set-cookie": clearAdminCookie(), "content-type": "application/json" } });
}
