import { connection } from "next/server";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { guidelinesMd, loadSettings, logActivity, saveSettings } from "@/lib/server/settings";
import { parseGuidelines } from "@/lib/guidelines";

const MAX = 600_000;

const summary = (md?: string) =>
  parseGuidelines(md ?? "").map((r) => ({
    brand: r.brand,
    global: r.global,
    aliases: r.aliases,
    fonts: [r.headingFont?.name, r.bodyFont?.name].filter(Boolean),
    banned: r.banned.length,
    phrases: r.requiredPhrases.length,
    trademarks: r.trademarks.length,
    rules: r.rules.length,
    disclaimer: !!r.requiredDisclaimer,
  }));

/** GET → the uploaded guidelines file's name, date and what was read from it. */
export async function GET(req: Request) {
  await connection();
  if (!isAdmin(req)) return unauthorized();
  await loadSettings(true);
  const g = await guidelinesMd();
  return Response.json(g ? { name: g.name, updatedAt: g.updatedAt, brands: summary(g.md), size: g.md.length, builtIn: g.builtIn } : { name: null });
}

/** POST {md, name} → save the guidelines file. DELETE → remove it. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { md?: string; name?: string };
  const md = typeof b.md === "string" ? b.md.replace(/\r\n/g, "\n") : "";
  if (md.trim().length < 20) return Response.json({ error: "That file is empty." }, { status: 400 });
  if (md.length > MAX) return Response.json({ error: "That file is over 600 KB. Split it or trim it." }, { status: 400 });
  const brands = summary(md);
  if (!brands.length) return Response.json({ error: "No brand sections found. Start each brand with a heading like \"## Honda\"." }, { status: 400 });
  const s = await loadSettings(true);
  s.guidelines = { md, name: String(b.name ?? "guidelines.md").slice(0, 120), updatedAt: new Date().toISOString() };
  await saveSettings(s);
  await logActivity({ type: "admin", label: "Brand guidelines updated", detail: `${brands.length} brand sections` }).catch(() => {});
  return Response.json({ name: s.guidelines.name, updatedAt: s.guidelines.updatedAt, brands, size: md.length });
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const s = await loadSettings(true);
  delete s.guidelines;
  await saveSettings(s);
  await logActivity({ type: "admin", label: "Brand guidelines reset to built-in" }).catch(() => {});
  const g = await guidelinesMd();
  return Response.json(g ? { name: g.name, updatedAt: g.updatedAt, brands: summary(g.md), size: g.md.length, builtIn: g.builtIn } : { name: null });
}
