import { anthropicHeaders } from "@/lib/server/claude";
import type { Platform } from "@/lib/types";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { getSecret, logActivity } from "@/lib/server/settings";

export const maxDuration = 60;

type Body = {
  template: { name: string; category: string; why: string; hook?: string };
  brand: { name: string; city?: string; state?: string; makes: string[] };
  offer: string;
  cta: string;
  vehicle?: string;
  description?: string;
};

const PLATFORMS: Platform[] = ["tiktok", "reels", "shorts", "facebook", "x"];

/**
 * Optional upgrade: when ANTHROPIC_API_KEY is set, Claude writes the captions.
 * Without a key this returns 501 and the client keeps its built-in captions.
 */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const key = await getSecret("anthropic");
  // No key configured: say so quietly; the client keeps its built-in captions.
  if (!key) return Response.json({ available: false });
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b?.template?.name || !b.brand?.name || !b.offer) return Response.json({ error: "missing ad details" }, { status: 400 });
  b.brand.makes ??= [];

  const prompt = `You write short-form social captions for car dealerships that maximise reach.

Dealership: ${b.brand.name}${b.brand.city ? ` in ${b.brand.city}, ${b.brand.state ?? ""}` : ""}
Brands sold: ${b.brand.makes.join(", ") || "various"}
Offer (state it exactly, never invent other prices or terms): ${b.offer}
Call to action: ${b.cta}${b.vehicle ? `\nVehicle: ${String(b.vehicle).slice(0, 80)}` : ""}${b.description ? `\nVehicle details from the dealer's feed (use only these facts): ${String(b.description).slice(0, 500)}` : ""}
Video format: "${b.template.name}" (${b.template.category}). ${b.template.why}
On-screen hook: ${b.template.hook ?? "n/a"}

Write one caption per platform. Rules:
- First line is a scroll-stopping hook under 8 words that matches the video format.
- Mention the offer and the dealership by name. Mention the city once if known.
- End with a clear, low-friction CTA (comment a word, DM, save, stop by).
- tiktok: 80–150 chars, 4 hashtags. reels: 100–220 chars with line breaks, 6 hashtags. shorts: under 90 chars, 2 hashtags. facebook: 60–160 chars, warmer tone, 2 hashtags. x: under 200 chars, 1 hashtag.
- Max 3 emoji per caption. No fake urgency claims beyond the offer. No quotes around captions.

Reply with JSON only: {"tiktok":{"text":"...","hashtags":["#a"]},"reels":{...},"shorts":{...},"facebook":{...},"x":{...}}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: await anthropicHeaders(key),
    body: JSON.stringify({
      model: process.env.CAPTION_MODEL ?? "claude-sonnet-5-5",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "";
    console.log("[captions] anthropic", res.status, detail.slice(0, 300));
    return Response.json({ error: `model ${res.status}`, detail: detail.slice(0, 200) }, { status: 502 });
  }
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const raw = data.content.find((c) => c.type === "text")?.text ?? "";
  try {
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<Platform, { text: string; hashtags: string[] }>;
    const out: Partial<Record<Platform, { text: string; hashtags: string[] }>> = {};
    for (const p of PLATFORMS) {
      const c = json[p];
      if (c?.text) out[p] = { text: c.text.trim(), hashtags: (c.hashtags ?? []).map((h) => (h.startsWith("#") ? h : "#" + h)).slice(0, 8) };
    }
    await logActivity({ type: "captions", label: `${b.brand.name} · ${b.template.name}` });
    return Response.json({ captions: out });
  } catch {
    return Response.json({ error: "bad model output" }, { status: 502 });
  }
}
