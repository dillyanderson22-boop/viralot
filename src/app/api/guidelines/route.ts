import { connection } from "next/server";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { guidelinesMd } from "@/lib/server/settings";
import { parseGuidelines, rulesFor } from "@/lib/guidelines";

/** GET ?makes=Honda,Acura → the brand guideline sections that apply to this dealer. */
export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const makes = (new URL(req.url).searchParams.get("makes") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const g = await guidelinesMd();
  if (!g) return Response.json({ rules: [], updatedAt: null });
  return Response.json({ rules: rulesFor(parseGuidelines(g.md), makes), updatedAt: g.updatedAt });
}
