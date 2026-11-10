import { hasAccess } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";

/** Client-side events the server can't see, like a finished MP4 export. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return new Response(null, { status: 204 });
  const { type, label } = (await req.json().catch(() => ({}))) as { type?: string; label?: string };
  if (type === "export") await logActivity({ type: "export", label: String(label ?? "").slice(0, 80) });
  return new Response(null, { status: 204 });
}
