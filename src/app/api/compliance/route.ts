import { hasAccess, unauthorized } from "@/lib/server/auth";
import { askJson, claudeKey } from "@/lib/server/claude";
import { guidelinesMd } from "@/lib/server/settings";
import { parseGuidelines, rulesFor } from "@/lib/guidelines";

export const maxDuration = 90;

type Review = { verdict: "pass" | "fix"; issues: { rule: string; problem: string; fix: string }[] };

/** POST {makes, headline, offer, finePrint, captions, vehicle} → Claude's compliance review against the brand sections. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const key = await claudeKey();
  if (!key) return Response.json({ error: "Add a Claude key in /admin to run the full review." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { makes?: string[]; headline?: string; offer?: string; finePrint?: string; captions?: string[]; vehicle?: string };
  const g = await guidelinesMd();
  const rules = g ? rulesFor(parseGuidelines(g.md), b.makes ?? []) : [];
  if (!rules.length) return Response.json({ error: "No brand guidelines match this dealer. Upload them in /admin." }, { status: 400 });
  const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  try {
    const r = await askJson<Review>(
      key,
      "You are a strict automotive advertising compliance reviewer. You check a dealer ad against the OEM brand guidelines provided, and nothing else. Only flag real violations of the given guidelines or of the ad's own fine print (e.g. a price on screen with no terms). JSON only.",
      [
        {
          type: "text",
          text: `BRAND GUIDELINES:\n${rules.map((r) => r.raw).join("\n\n").slice(0, 30_000)}\n\nAD:\nVehicle: ${clip(b.vehicle, 120)}\nOn-screen headline: ${clip(b.headline, 400)}\nOffer: ${clip(b.offer, 400)}\nFine print: ${clip(b.finePrint, 2000)}\nCaptions:\n${(b.captions ?? []).map((c) => "- " + clip(c, 600)).join("\n")}\n\nReply: {"verdict":"pass"|"fix","issues":[{"rule":"the guideline, quoted briefly","problem":"what in the ad breaks it","fix":"exact change to make"}]}`,
        },
      ],
      1500,
      60_000
    );
    return Response.json({ verdict: r.verdict === "pass" && !r.issues?.length ? "pass" : "fix", issues: (r.issues ?? []).slice(0, 12) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /credit balance/i.test(msg) ? "Your Anthropic account is out of credit. Add credit to run the full review." : msg.slice(0, 200) }, { status: 502 });
  }
}
