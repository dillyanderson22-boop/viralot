import { connection } from "next/server";
import { accessHash, adminConfigured, isAdmin, unauthorized } from "@/lib/server/auth";
import { SECRETS, describeSecrets, loadSettings, logActivity, saveSettings, setSecret, type SecretName } from "@/lib/server/settings";

/** Admin state. Never returns secret values — only whether each is set and its last four characters. */
export async function GET(req: Request) {
  await connection();
  if (!adminConfigured()) return Response.json({ configured: false });
  if (!isAdmin(req)) return unauthorized();
  const s = await loadSettings(true);
  return Response.json({
    configured: true,
    keys: await describeSecrets(),
    access: { required: s.access.required, hasCode: !!s.access.codeHash },
    storage: !process.env.VIRALOT_LOCAL_STORE && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) ? "Vercel Blob (private, encrypted)" : "Local file (dev)",
  });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    keys?: Partial<Record<SecretName, string | null>>;
    access?: { required?: boolean; code?: string };
  };
  for (const [name, value] of Object.entries(body.keys ?? {})) {
    if (!(name in SECRETS)) continue;
    if (typeof value === "string" && value.length > 4000) return Response.json({ error: "Value too long" }, { status: 400 });
    await setSecret(name as SecretName, value ? value : null);
    await logActivity({ type: "admin", label: `${SECRETS[name as SecretName].label} ${value ? "updated" : "removed"}` });
  }
  if (body.access) {
    const s = await loadSettings(true);
    if (body.access.code !== undefined) s.access.codeHash = body.access.code.trim() ? accessHash(body.access.code) : undefined;
    if (body.access.required !== undefined) s.access.required = body.access.required && !!s.access.codeHash;
    await saveSettings(s);
    await logActivity({ type: "admin", label: s.access.required ? "Studio locked with access code" : "Studio opened to everyone" });
  }
  return GET(req);
}
