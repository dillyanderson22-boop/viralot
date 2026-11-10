import { getSecret } from "./settings";
import type { Special } from "../types";
import { isExpired } from "../oem";

/**
 * Firecrawl (firecrawl.dev) as the scanner's front door: it renders dealer
 * sites through its own browsers and proxies — which gets past most bot walls
 * our serverless browser hits — and returns the rendered HTML, a screenshot,
 * every image and link, and a "branding" profile with the real logo and
 * colours. About 1 credit per page. When it fails we fall back to our own
 * browser, so a missing or exhausted key never breaks a scan.
 */

const API = "https://api.firecrawl.dev/v2/scrape";

export const firecrawlKey = () => getSecret("firecrawl");

export type Branding = {
  logo?: string | null;
  colors?: Partial<Record<"primary" | "secondary" | "accent" | "background" | "link", string>> | null;
  images?: { logo?: string; favicon?: string; ogImage?: string; logoAlt?: string } | null;
};

type FcData = {
  rawHtml?: string;
  html?: string;
  markdown?: string;
  links?: string[];
  images?: string[];
  screenshot?: string;
  branding?: Branding;
  metadata?: { url?: string; sourceURL?: string; statusCode?: number; title?: string };
  actions?: { javascriptReturns?: { type: string; value: unknown }[] };
};

async function scrape(key: string, body: Record<string, unknown>, timeoutMs: number): Promise<FcData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs + 15_000);
  try {
    const res = await fetch(API, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ onlyMainContent: false, timeout: timeoutMs, ...body }),
    });
    const d = (await res.json().catch(() => ({}))) as { success?: boolean; data?: FcData; error?: string };
    if (!res.ok || !d.success || !d.data) throw new Error(`Firecrawl ${res.status}: ${String(d.error ?? "no data").slice(0, 200)}`);
    return d.data;
  } finally {
    clearTimeout(timer);
  }
}

export type FcPage = {
  html: string;
  text: string;
  finalUrl: string;
  status: number;
  links: string[];
  images: string[];
  /** JPEG/PNG screenshot as base64 (fetched from Firecrawl's short-lived URL). */
  screenshot?: string;
  branding?: Branding;
};

async function shotB64(url?: string) {
  if (!url) return undefined;
  if (url.startsWith("data:")) return url.split(",")[1];
  try {
    const r = await fetch(url);
    if (!r.ok) return undefined;
    return Buffer.from(await r.arrayBuffer()).toString("base64");
  } catch {
    return undefined;
  }
}

/** A whole page: rendered HTML + markdown, links, images, screenshot and (optionally) branding. */
export async function fcPage(key: string, url: string, opts: { branding?: boolean; fresh?: boolean } = {}): Promise<FcPage> {
  const d = await scrape(
    key,
    {
      url,
      formats: [...(opts.branding ? ["branding"] : []), "rawHtml", "markdown", "links", "images", { type: "screenshot", viewport: { width: 1440, height: 900 } }],
      waitFor: 1500,
      // an hour of cache is fine for a re-scan; offers don't change by the minute
      maxAge: opts.fresh ? 0 : 3_600_000,
    },
    90_000
  );
  return {
    html: d.rawHtml ?? d.html ?? "",
    text: d.markdown ?? "",
    finalUrl: d.metadata?.url ?? d.metadata?.sourceURL ?? url,
    status: d.metadata?.statusCode ?? 200,
    links: d.links ?? [],
    images: d.images ?? [],
    screenshot: await shotB64(d.screenshot),
    branding: d.branding,
  };
}

/** Run a self-contained function in Firecrawl's browser (after scrolling to load lazy content) and return its result. */
export async function fcEvaluate<T>(key: string, url: string, fn: () => T): Promise<{ value: T | null; html: string; status: number }> {
  const d = await scrape(
    key,
    {
      url,
      formats: ["rawHtml"],
      actions: [
        { type: "wait", milliseconds: 2500 },
        ...Array.from({ length: 4 }, () => [{ type: "scroll", direction: "down" }, { type: "wait", milliseconds: 700 }]).flat(),
        // the script must be an expression; it's evaluated as-is in the page
        // (bundlers may wrap functions in a __name() helper that doesn't exist in the page)
        { type: "executeJavascript", script: `(() => { var __name = (f) => f; return (${fn.toString()})(); })()` },
      ],
    },
    120_000
  );
  const v = d.actions?.javascriptReturns?.[0]?.value as T | undefined;
  return { value: v ?? null, html: d.rawHtml ?? "", status: d.metadata?.statusCode ?? 200 };
}

/** Promo/banner-looking images from Firecrawl's image list (where dealers bake in their offers). */
export function pickBanners(images: string[], max = 8) {
  const ok = images.filter((u) => /^https?:/.test(u) && !/\.svg(\?|$)|logo|icon|sprite|favicon|badge|-\d{2,3}x\d{2,3}\.|thumb|avatar|staff/i.test(u));
  const promo = ok.filter((u) => /slide|banner|hero|special|offer|promo|incentive|carousel|homepage|lease|apr|event/i.test(u));
  return [...new Set([...promo, ...ok])].slice(0, max);
}

// ---------------------------------------------------------------- live offers

/** Every URL Firecrawl knows on a site, ranked by a search phrase (1 credit). */
export async function fcMap(key: string, url: string, search: string): Promise<{ url: string; title?: string }[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/map", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ url, search, limit: 100 }),
    });
    const d = (await res.json().catch(() => ({}))) as { success?: boolean; links?: ({ url: string; title?: string } | string)[] };
    if (!res.ok || !d.success) return [];
    return (d.links ?? []).map((l) => (typeof l === "string" ? { url: l } : l));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Pages that carry vehicle offers (specials, incentives, lease/finance deals) — never service or parts coupons. */
export function offerPages(links: { url: string; title?: string }[], origin: string, max = 5) {
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const score = (u: URL, title = "") => {
    const p = (u.pathname + " " + title).toLowerCase();
    if (/service|parts|coupon|collision|tire|oil|career|job|privacy|blog|review|staff|apply|credit-app|schedule|appointment/.test(p)) return 0;
    if (/\/(inventory|vehicle-details|vdp)\//.test(u.pathname) || /\b[a-hj-npr-z0-9]{17}\b/i.test(u.pathname)) return 0;
    let s = 0;
    if (/special/.test(p)) s += 5;
    if (/offer|incentive|rebate|deal|promotion|savings|clearance|event/.test(p)) s += 4;
    if (/lease|finance|apr/.test(p)) s += 2;
    if (/new/.test(p)) s += 1;
    return s;
  };
  const seen = new Set<string>();
  return links
    .map((l) => {
      try {
        const u = new URL(l.url);
        u.hash = "";
        if (u.hostname.replace(/^www\./, "") !== host) return null;
        return { url: u.toString().replace(/\/$/, ""), s: score(u, l.title) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { url: string; s: number } => !!x && x.s >= 4 && !seen.has(x.url) && !!seen.add(x.url))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.url);
}

type RawSpecial = {
  vehicle?: string;
  imageUrl?: string;
  stockNumber?: string;
  vin?: string;
  expires?: string;
  disclaimer?: string;
  offers?: { type?: string; label?: string; amount?: string; details?: string }[];
};

const SPECIALS_SCHEMA = {
  type: "object",
  properties: {
    specials: {
      type: "array",
      description: "One entry per vehicle that has a special",
      items: {
        type: "object",
        properties: {
          vehicle: { type: "string", description: "Year make model trim, e.g. '2026 Honda CR-V LX FWD'" },
          imageUrl: { type: "string", description: "URL of this vehicle's photo on the page" },
          stockNumber: { type: "string" },
          vin: { type: "string" },
          expires: { type: "string", description: "Offer end date as written" },
          disclaimer: { type: "string", description: "This vehicle's fine print, verbatim" },
          offers: {
            type: "array",
            description: "EVERY separate offer on this vehicle",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["lease", "finance", "cash", "discount", "msrp", "price", "trade", "bonus", "other"] },
                label: { type: "string", description: "Short name as shown, e.g. 'Lease', 'APR', 'Customer Cash', 'Dealer Discount', 'MSRP', 'Sale Price', 'Trade-In Bonus', 'Military Bonus'" },
                amount: { type: "string", description: "The headline number exactly as written, e.g. '$299/mo', '2.99% APR', '$1,500', '$32,450'" },
                details: { type: "string", description: "Terms exactly as written, e.g. '36 months · $4,771 due at signing'" },
              },
              required: ["type", "label", "amount"],
            },
          },
        },
        required: ["vehicle", "offers"],
      },
    },
  },
  required: ["specials"],
};

const SPECIALS_PROMPT =
  "This is a car dealership specials page. For EVERY vehicle with a special on it, list that vehicle once with ALL of its separate offers: lease payment, finance/APR, customer cash or rebates, dealer discounts, MSRP, sale or internet price, trade-in bonus, and any loyalty, conquest, military, college or first-responder bonus. Copy every number, term, date and the fine print exactly as written; leave a field empty when it isn't shown and never guess. Skip service, parts and accessory coupons, and skip ordinary inventory listings that aren't presented as a special.";

/** A specials page's cars, each with all its offers, extracted by Firecrawl's model. */
export async function fcSpecials(key: string, url: string): Promise<RawSpecial[]> {
  const d = await scrape(key, { url, formats: [{ type: "json", schema: SPECIALS_SCHEMA, prompt: SPECIALS_PROMPT }], waitFor: 2500, maxAge: 3_600_000 }, 100_000);
  return ((d as { json?: { specials?: RawSpecial[] } }).json?.specials ?? []).filter((x) => x?.vehicle && x.offers?.length).slice(0, 40);
}

const KINDS = ["lease", "finance", "cash", "discount", "msrp", "price", "trade", "bonus", "other"] as const;
/** The extractor sometimes spells out an empty field. */
const val = (x?: string) => (x && !/^\s*(none|null|n\/?a|not (shown|specified|listed)|-)\s*$/i.test(x) ? x.replace(/\s+/g, " ").trim() : undefined);
const keyOf = (v: string) =>
  v
    .toLowerCase()
    .replace(/\bnew\b|\ball-new\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Every special on a dealer's site: finds the specials / incentives pages (homepage links + a
 * Firecrawl map of the site), reads up to five, and merges them into one card per car with
 * every distinct offer on it.
 */
export async function scanSpecials(key: string, site: string, homeLinks: string[] = []): Promise<{ specials: Special[]; pages: string[] }> {
  const origin = new URL(site).origin;
  const mapped = await fcMap(key, origin, "specials offers incentives lease finance deals");
  const pages = offerPages([...homeLinks.map((u) => ({ url: u })), ...mapped], origin);
  const read = await Promise.allSettled(pages.map((pg) => fcSpecials(key, pg).then((r) => r.map((x) => ({ ...x, page: pg })))));
  const byCar = new Map<string, Special>();
  for (const r of read) {
    if (r.status !== "fulfilled") continue;
    for (const raw of r.value) {
      const vehicle = val(raw.vehicle);
      if (!vehicle) continue;
      const k = keyOf(vehicle);
      let sp = byCar.get(k);
      if (!sp) {
        let image: string | undefined;
        try {
          const u = val(raw.imageUrl);
          image = u && !u.startsWith("data:") ? new URL(u, raw.page).toString() : undefined;
        } catch {}
        sp = { id: k.replace(/ /g, "-").slice(0, 60), vehicle, image, page: raw.page, expires: val(raw.expires), disclaimer: val(raw.disclaimer)?.slice(0, 4000), stock: val(raw.stockNumber), vin: val(raw.vin), offers: [] };
        byCar.set(k, sp);
      }
      sp.expires ??= val(raw.expires);
      sp.disclaimer ??= val(raw.disclaimer)?.slice(0, 4000);
      for (const o of raw.offers ?? []) {
        const value = val(o.amount);
        const label = val(o.label);
        if (!value || !label) continue;
        const kind = (KINDS as readonly string[]).includes(o.type ?? "") ? (o.type as Special["offers"][number]["kind"]) : "other";
        // the same deal often appears twice ("Finance 1.99% APR" and "APR 1.99%", "Sale Price" and "Price")
        const digits = value.replace(/[^\d.]/g, "");
        const fam = (k: string) => (k === "price" || k === "msrp" || k === "discount" ? "price" : k);
        const dup = sp.offers.find((x) => x.value.replace(/[^\d.]/g, "") === digits && (fam(x.kind) === fam(kind) || x.label.toLowerCase() === label.toLowerCase()));
        if (dup) {
          dup.detail ??= val(o.details)?.slice(0, 140);
          continue;
        }
        sp.offers.push({ kind, label: label.slice(0, 40), value: value.slice(0, 40), detail: val(o.details)?.slice(0, 140) });
      }
    }
  }
  // OEM kit §7.12: expired specials are never shown
  const specials = [...byCar.values()].filter((s) => s.offers.length && !isExpired(s.expires)).slice(0, 40);
  return { specials, pages };
}
