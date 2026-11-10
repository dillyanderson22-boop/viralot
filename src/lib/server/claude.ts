import { safeFetch } from "../scan/fetch";
import type { AdIdea, OfferDetail } from "../types";
import { getSecret } from "./settings";

/**
 * Claude as the scan's reader. The headless browser still does the fetching
 * (Claude can't get past bot walls either); Claude then looks at what came
 * back — screenshots, banner images, logo candidates, page text — and returns
 * the things plain parsing gets wrong: the real logo, offers baked into
 * banner images with their fine print, brand colours as seen, contact
 * details, and which ads to make.
 */

const MODEL = () => process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";

export const claudeKey = () => getSecret("anthropic");

/**
 * Request headers for the Messages API. Keys that aren't scoped to a
 * workspace must name one, or Anthropic answers 400.
 */
export async function anthropicHeaders(key: string): Promise<Record<string, string>> {
  const ws = await getSecret("anthropicWorkspace");
  return {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    ...(ws ? { "anthropic-workspace-id": ws.trim() } : {}),
  };
}

type Block =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/** One Messages call that must answer with a JSON object. */
export async function askJson<T>(key: string, system: string, content: Block[], maxTokens = 4000, timeoutMs = 75_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: await anthropicHeaders(key),
      body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
    });
    const d = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Claude ${res.status}: ${d.error?.message?.slice(0, 200) ?? ""}`);
    const text = (d.content ?? []).map((c) => c.text ?? "").join("");
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("Claude didn't return JSON");
    return JSON.parse(text.slice(a, b + 1)) as T;
  } finally {
    clearTimeout(timer);
  }
}

const IMG_TYPES = /^image\/(jpeg|png|gif|webp)$/;

/** Download an image for Claude (base64). Skips SVGs, tiny icons and anything over ~3.5 MB. */
export async function imageBlock(url: string): Promise<Block | null> {
  try {
    const { res } = await safeFetch(url, { timeoutMs: 8_000, accept: "image/webp,image/jpeg,image/png,image/*" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMG_TYPES.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4_000 || buf.length > 3_500_000) return null;
    return { type: "image", source: { type: "base64", media_type: type, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

/** Screenshot block; Firecrawl may hand back PNGs, so sniff the type from the bytes. */
export const jpegBlock = (b64: string): Block => ({
  type: "image",
  source: { type: "base64", media_type: b64.startsWith("iVBOR") ? "image/png" : b64.startsWith("UklGR") ? "image/webp" : "image/jpeg", data: b64 },
});

// ---------------------------------------------------------------- site reading

export type LogoCandidate = { src: string; alt: string; hint: string; x: number; y: number; w: number; h: number };

export type SiteInput = {
  url: string;
  archived: boolean;
  /** Viewport screenshots of the homepage, top first (JPEG base64). */
  screenshots: string[];
  /** Big promo/slider images, in page order (absolute URLs). */
  banners: string[];
  logos: LogoCandidate[];
  text: string;
  /** Specials / offers page, when the site has one. */
  specials?: { url: string; text: string; banners: string[]; screenshot?: string };
  /** Ad formats Claude may recommend. */
  spotStyles: { id: string; name: string; why: string }[];
  viralFormats: { key: string; name: string; category: string }[];
};

export type SiteReading = {
  name?: string;
  tagline?: string;
  about?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  hours?: string;
  makes?: string[];
  logoIndex?: number | null;
  colors?: { primary?: string; secondary?: string };
  offers?: (Omit<OfferDetail, "image" | "source"> & { source?: "banner" | "text"; bannerIndex?: number | null })[];
  ideas?: { offerIndex: number; spotStyle?: string; viralFormats?: string[]; hook?: string }[];
};

const SYSTEM = `You read car dealership websites for a marketing tool that turns a dealer's real offers into social ads.
You are given screenshots of the homepage, the site's large promo/banner images (offers are usually baked into these images), a list of logo candidates with their on-page positions, page text, and sometimes the dealer's specials page.
Rules:
- Only report what is actually on the site. Never invent prices, payments, rates, terms, dates or disclaimers. If a value isn't visible, leave it out.
- Offers: read every distinct current offer, especially ones only visible inside banner images. Merge duplicates (same offer on homepage and specials page). Copy fine print/disclaimers verbatim (trim to 600 chars). Write "headline" as the short advertised offer, e.g. "Lease a new 2026 Camry LE for $319/mo". Skip generic slogans that aren't offers ("We buy cars" counts as a trade offer only if it promises something specific or invites a trade appraisal).
- Logo: pick the dealership's OWN logo (usually top-left in the header), not the manufacturer badge, awards or partner logos. Give its index in the candidate list, or null if none is right.
- Colours: the dealership's main brand colour and a secondary, as hex, as they appear (header, buttons). Not white, black or grey unless the brand truly is.
- Ideas: for each offer suggest the best pro spot style and up to 3 viral formats from the provided lists (use their exact ids/keys), and a short scroll-stopping hook (under 10 words) — no invented claims.
Reply with JSON only.`;

const SHAPE = `{
 "name": string, "tagline": string?, "about": "one sentence on how they describe themselves"?, "phone": string?, "address": string?, "city": string?, "state": "2-letter"?, "hours": "sales hours, short"?,
 "makes": [brands sold],
 "logoIndex": number | null,
 "colors": {"primary": "#rrggbb", "secondary": "#rrggbb"},
 "offers": [{"headline": string, "model": string?, "kind": "lease"|"apr"|"cash"|"price"|"trade"|"event"|"other", "amount": string?, "term": string?, "dueAtSigning": string?, "apr": string?, "expires": string?, "disclaimer": string?, "source": "banner"|"text", "bannerIndex": number|null}],
 "ideas": [{"offerIndex": number, "spotStyle": string, "viralFormats": [string], "hook": string}]
}`;

export async function readSite(key: string, input: SiteInput): Promise<SiteReading> {
  const content: Block[] = [];
  content.push({ type: "text", text: `Website: ${input.url}${input.archived ? "\nNOTE: the live site blocked us; this is an older Internet Archive copy. Its offers are probably expired — return an empty offers list and no ideas, but do read logo, colours, name and contact details." : ""}` });

  input.screenshots.slice(0, 3).forEach((b64, i) => {
    content.push({ type: "text", text: `Homepage screenshot ${i + 1} (1440px wide${i ? ", scrolled down" : ", top of page"}):` });
    content.push(jpegBlock(b64));
  });

  content.push({
    type: "text",
    text:
      "Logo candidates (index: position x,y size w×h — alt — hints):\n" +
      (input.logos.map((l, i) => `${i}: ${Math.round(l.x)},${Math.round(l.y)} ${Math.round(l.w)}×${Math.round(l.h)} — "${l.alt.slice(0, 60)}" — ${l.hint.slice(0, 120)}`).join("\n") || "(none)"),
  });

  // banner images, homepage then specials page, numbered in that order
  const bannerUrls = [...input.banners, ...(input.specials?.banners ?? [])].slice(0, 10);
  const imgs = await Promise.all(bannerUrls.map(imageBlock));
  imgs.forEach((b, i) => {
    if (!b) return;
    content.push({ type: "text", text: `Banner image ${i}${i >= input.banners.length ? " (specials page)" : ""}:` });
    content.push(b);
  });

  content.push({ type: "text", text: `Homepage text:\n${input.text.slice(0, 9000)}` });
  if (input.specials) {
    if (input.specials.screenshot) {
      content.push({ type: "text", text: `Specials page screenshot (${input.specials.url}):` });
      content.push(jpegBlock(input.specials.screenshot));
    }
    content.push({ type: "text", text: `Specials page text (${input.specials.url}):\n${input.specials.text.slice(0, 9000)}` });
  }
  content.push({
    type: "text",
    text:
      `Pro spot styles (id — name — what it's for):\n${input.spotStyles.map((s) => `${s.id} — ${s.name} — ${s.why}`).join("\n")}\n\n` +
      `Viral formats (key — name — category):\n${input.viralFormats.map((f) => `${f.key} — ${f.name} — ${f.category}`).join("\n")}\n\n` +
      `Return JSON in this shape:\n${SHAPE}`,
  });

  const r = await askJson<SiteReading>(key, SYSTEM, content, 6000);
  // keep only banner indexes that point at images we really sent
  r.offers = (r.offers ?? []).map((o) => ({ ...o, bannerIndex: typeof o.bannerIndex === "number" && imgs[o.bannerIndex] ? o.bannerIndex : null }));
  return Object.assign(r, { _bannerUrls: bannerUrls });
}

export const bannerUrlsOf = (r: SiteReading) => (r as SiteReading & { _bannerUrls?: string[] })._bannerUrls ?? [];

const HEX = /^#[0-9a-f]{6}$/i;
/** A real brand colour: valid hex, not near-white/black/grey. */
export function usableColor(c?: string) {
  if (!c || !HEX.test(c)) return false;
  const n = parseInt(c.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn > 40 && mx > 40 && mn < 235;
}

/** Map Claude's reading onto ad ideas keyed by offer headline. */
export function ideasOf(r: SiteReading, spotIds: Set<string>, viralKeys: Set<string>): AdIdea[] {
  const offers = r.offers ?? [];
  return (r.ideas ?? [])
    .filter((i) => offers[i.offerIndex])
    .map((i) => ({
      offer: offers[i.offerIndex].headline,
      spotStyle: i.spotStyle && spotIds.has(i.spotStyle) ? i.spotStyle : undefined,
      viralFormats: (i.viralFormats ?? []).filter((k) => viralKeys.has(k)).slice(0, 3),
      hook: i.hook?.slice(0, 80),
    }));
}

// ---------------------------------------------------------------- inventory fallback

export type ReadCar = { url: string; title: string; price?: number; msrp?: number; mileage?: number; stock?: string; vin?: string; image?: string; condition?: string; badges: string[] };

/** When the card extractor finds nothing, Claude reads the listing page text instead. */
export async function readListings(key: string, pageUrl: string, text: string, images: { src: string; alt: string }[], links: { href: string; text: string }[]): Promise<ReadCar[]> {
  const content: Block[] = [
    {
      type: "text",
      text: `This is a car dealership inventory listing page: ${pageUrl}
Extract every vehicle listed. Use only what's on the page; never invent prices or numbers.
For each vehicle pick its photo from the image list (by index) and its detail-page link from the link list (by index) when you can match them by title.

Page text:
${text.slice(0, 18000)}

Images (index: alt — url):
${images.slice(0, 80).map((m, i) => `${i}: ${m.alt.slice(0, 80)} — ${m.src.slice(0, 160)}`).join("\n")}

Links (index: text — href):
${links.slice(0, 120).map((l, i) => `${i}: ${l.text.slice(0, 80)} — ${l.href.slice(0, 160)}`).join("\n")}

Reply with JSON only: {"vehicles":[{"title":"2025 Toyota RAV4 XLE","price":number?,"msrp":number?,"mileage":number?,"stock":string?,"vin":string?,"condition":"new"|"used"|"cpo","imageIndex":number?,"linkIndex":number?}]}`,
    },
  ];
  const r = await askJson<{ vehicles?: { title: string; price?: number; msrp?: number; mileage?: number; stock?: string; vin?: string; condition?: string; imageIndex?: number; linkIndex?: number }[] }>(
    key,
    "You extract structured vehicle listings from dealership web pages. JSON only.",
    content,
    8000
  );
  return (r.vehicles ?? [])
    .filter((v) => v.title)
    .slice(0, 60)
    .map((v) => ({
      url: (typeof v.linkIndex === "number" && links[v.linkIndex]?.href) || pageUrl,
      title: v.title.slice(0, 70),
      price: Number(v.price) || undefined,
      msrp: Number(v.msrp) || undefined,
      mileage: Number(v.mileage) || undefined,
      stock: v.stock,
      vin: v.vin,
      image: typeof v.imageIndex === "number" ? images[v.imageIndex]?.src : undefined,
      condition: v.condition,
      badges: [],
    }));
}
