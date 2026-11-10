import { checkHiggsfield, hfAuth } from "@/lib/server/clips";
import { anthropicHeaders } from "@/lib/server/claude";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { getSecret, type SecretName } from "@/lib/server/settings";

/** Checks that a saved key actually works, without echoing it back. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const { name } = (await req.json().catch(() => ({}))) as { name?: SecretName };
  try {
    if (name === "anthropic" || name === "anthropicWorkspace") {
      const key = await getSecret("anthropic");
      if (!key) return Response.json({ ok: false, message: "No key saved" });
      // A real (one-token) caption request: proves the key works for exactly what the app does.
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: await anthropicHeaders(key),
        body: JSON.stringify({ model: process.env.CAPTION_MODEL ?? "claude-sonnet-5-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
      });
      if (r.ok) return Response.json({ ok: true, message: "Connected — Claude will read sites during scans and write captions" });
      const detail = ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "";
      const hint = /workspace/i.test(detail)
        ? "This key isn't tied to a workspace. Paste your workspace ID (Claude Console → Settings → Workspaces, starts with wrkspc_) in “Claude workspace ID” below, or create a key inside a workspace."
        : detail || `Anthropic rejected the key (${r.status})`;
      return Response.json({ ok: false, message: hint.slice(0, 220) });
    }
    if (name === "firecrawl") {
      const fk = await getSecret("firecrawl");
      if (!fk) return Response.json({ ok: false, message: "No key saved" });
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${fk}`, "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], maxAge: 86_400_000 }),
      });
      if (r.ok) return Response.json({ ok: true, message: "Connected — scans and inventory go through Firecrawl first" });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      return Response.json({ ok: false, message: (d.error ?? `Firecrawl rejected the key (${r.status})`).slice(0, 200) });
    }
    if (name === "browserWs") {
      const ws = await getSecret("browserWs");
      if (!ws) return Response.json({ ok: false, message: "No endpoint saved" });
      const { chromium } = await import("playwright-core");
      const b = await chromium.connectOverCDP(ws, { timeout: 15_000 });
      await b.close();
      return Response.json({ ok: true, message: "Connected to hosted browser" });
    }
    if (name === "higgsfieldKey" || name === "higgsfieldSecret") {
      const auth = await hfAuth();
      if (!auth || auth === "mock") return Response.json(auth ? { ok: true, message: "Demo mode" } : { ok: false, message: "Save both the key and the secret" });
      return Response.json(await checkHiggsfield(auth));
    }
    return Response.json({ ok: false, message: "Unknown key" }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message.slice(0, 160) : "Test failed" });
  }
}
