import * as cheerio from "cheerio";
import type { Brand, Vehicle } from "../types";

const MAKES = [
  "Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler",
  "Dodge", "Ford", "Genesis", "GMC", "Honda", "Hyundai", "INFINITI", "Jaguar", "Jeep",
  "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "MINI", "Mitsubishi",
  "Nissan", "Polestar", "Porsche", "Ram", "Rivian", "Subaru", "Tesla", "Toyota",
  "Volkswagen", "Volvo",
];

type JsonLd = Record<string, unknown>;

function abs(src: string | undefined, base: string): string | undefined {
  if (!src) return undefined;
  const s = src.trim().split(/\s+/)[0];
  if (!s || s.startsWith("data:")) return undefined;
  try {
    return new URL(s, base).toString();
  } catch {
    return undefined;
  }
}

function jsonLd($: cheerio.CheerioAPI): JsonLd[] {
  const out: JsonLd[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          out.push(v as JsonLd);
          const g = (v as JsonLd)["@graph"];
          if (g) walk(g);
        }
      };
      walk(parsed);
    } catch {
      /* dealer sites ship plenty of malformed JSON-LD */
    }
  });
  return out;
}

const DEALER_TYPES = /AutoDealer|AutomotiveBusiness|LocalBusiness|Organization|CarDealer/i;

function pickDealerLd(items: JsonLd[]): JsonLd | undefined {
  return items.find((i) => DEALER_TYPES.test(String(i["@type"] ?? "")));
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "url" in v) return str((v as JsonLd).url);
  if (Array.isArray(v)) return str(v[0]);
  return undefined;
}

function cleanName(raw: string): string {
  // Titles look like "New & Used Cars | Summit Honda | Akron, OH" — the dealer
  // is usually the segment with a make or "Motors"/"Auto" in it.
  const parts = raw.split(/\s[|\-–—:•]\s/).map((p) => p.trim()).filter(Boolean);
  const scored = parts
    .map((p) => {
      let s = 0;
      if (MAKES.some((m) => p.toLowerCase().includes(m.toLowerCase()))) s += 2;
      if (/motors|auto|cars|dealership|group|of\s/i.test(p)) s += 2;
      if (/new|used|inventory|home|welcome|sale|dealer in/i.test(p)) s -= 2;
      if (p.length > 40) s -= 2;
      return { p, s };
    })
    .sort((a, b) => b.s - a.s);
  return (scored[0]?.p ?? raw).replace(/^welcome to\s+/i, "").trim();
}

// ---------- colours ----------

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
}

function saturation([r, g, b]: [number, number, number]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  return { s: l > 0.5 ? d / (2 - max - min) : d / (max + min), l };
}

export function rankColors(css: string): string[] {
  const counts = new Map<string, number>();
  const bump = (hex: string, w = 1) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    // browser-default link colours (#0000ee, #551a8b) show up when styles fail to load
    const key0 = rgb.join(",");
    if (key0 === "0,0,238" || key0 === "85,26,139" || key0 === "0,0,255") return;
    const { s, l } = saturation(rgb);
    if (s < 0.35 || l < 0.12 || l > 0.85) return;
    // Bucket near-duplicates so #0055a4 and #0056a5 count together.
    const key = toHex(...(rgb.map((c) => Math.round(c / 12) * 12) as [number, number, number]));
    counts.set(key, (counts.get(key) ?? 0) + w);
  };
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) bump(m[0]);
  for (const m of css.matchAll(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/gi)) {
    bump(toHex(+m[1], +m[2], +m[3]));
  }
  // Brand variables are worth far more than an incidental hover colour.
  for (const m of css.matchAll(/--[\w-]*(primary|brand|main|accent)[\w-]*\s*:\s*(#[0-9a-f]{3,6})/gi)) {
    bump(m[2], 25);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 8);
}

// ---------- offers ----------

const OFFER_HINT =
  /(\$\s?\d[\d,]*(\.\d+)?\s*(\/\s?mo|per month|down|off|cash|bonus|savings|rebate)?|\d(\.\d+)?%\s*apr|\b0%|lease|apr|save up to|rebate|no payments|\bdown\b|trade[- ]in bonus)/i;

export function findOffers(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\s{2,}|\s[|•·]\s/)
    .map((s) => s.trim().replace(/^[|•·\-–—:\s]+/, "").trim())
    .filter((s) => s.length >= 8 && s.length <= 110 && OFFER_HINT.test(s))
    .filter((s) => !/(disclaimer|tax|title|license|fees|residency|approved credit|see dealer|msrp excludes|cookie|privacy)/i.test(s))
    // reviews and testimonials quote prices too — drop first-person copy
    .filter((s) => !/\b(I|I'm|I've|me|my|mine|they|billed|charged|review|stars?)\b/.test(s));
  const score = (s: string) =>
    (/\$\s?\d/.test(s) ? 3 : 0) +
    (/lease|apr|\/mo|per month/i.test(s) ? 2 : 0) +
    (/off|save|bonus|rebate|down/i.test(s) ? 2 : 0) +
    (s.length <= 70 ? 1.5 : 0) -
    s.length / 50;
  const seen = new Set<string>();
  return sentences
    .sort((a, b) => score(b) - score(a))
    .filter((s) => {
      const k = s.toLowerCase().replace(/[^a-z0-9$%]/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);
}

// ---------- images ----------

const VEHICLE_HINT = /(inventory|vehicle|vehicles|photos|stock|vdp|model|jellybean|trim|showroom|new-|used-|evox|chrome-data|homenet|dealerinspire|dealer\.com|izmo|autotrader|cloudfront|imgix)/i;
const NOT_VEHICLE = /(logo|icon|sprite|favicon|badge|award|banner-bg|pattern|placeholder|loading|spinner|avatar|staff|employee|team|map|flag|social|facebook|twitter|instagram|youtube|google|carfax|kbb|edmunds|dealerrater|payment|credit|\.svg|\.gif)/i;

function imgSrc($el: cheerio.Cheerio<never>): string | undefined {
  const cand = [
    $el.attr("data-src"),
    $el.attr("data-lazy-src"),
    $el.attr("data-original"),
    $el.attr("src"),
    $el.attr("srcset")?.split(",").pop(),
    $el.attr("data-srcset")?.split(",").pop(),
  ];
  return cand.find((c) => c && !c.startsWith("data:"))?.trim().split(/\s+/)[0];
}

/** "Finance a new 2026 Tacoma SR5 for 0.99% APR…" → "2026 Tacoma SR5". */
function vehicleTitle(raw?: string): string | undefined {
  const t = raw?.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  const m = t.match(/\b(19|20)\d{2}\s+[A-Z][\w-]*(\s+[A-Z0-9][\w-]*){0,2}/);
  if (m) return m[0].replace(/\s+(for|with|at|and)$/i, "");
  return t.length <= 32 ? t : undefined;
}

export function extractBrand(html: string, text: string, pageUrl: string, cssText = ""): Brand {
  const $ = cheerio.load(html);
  const ld = jsonLd($);
  const dealer = pickDealerLd(ld);
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");

  // ----- name -----
  const ogSite = $('meta[property="og:site_name"]').attr("content");
  const ldName = str(dealer?.name);
  const title = $("title").first().text().trim();
  const name = cleanName(ldName || ogSite || title || host).slice(0, 48);

  // ----- logo -----
  const logoCands: { src: string; score: number }[] = [];
  const pushLogo = (src: string | undefined, score: number) => {
    const a = abs(src, pageUrl);
    if (a) logoCands.push({ src: a, score });
  };
  pushLogo(str(dealer?.logo), 9);
  $("img").each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>;
    const src = imgSrc($el);
    if (!src) return;
    const hay = [src, $(el).attr("alt"), $(el).attr("class"), $(el).attr("id"), $(el).parent().attr("class")]
      .join(" ")
      .toLowerCase();
    let score = 0;
    if (/logo/.test(hay)) score += 6;
    if ($(el).closest("header, nav, .header, #header, .navbar, .site-header").length) score += 3;
    if (/footer/.test(hay) || $(el).closest("footer").length) score -= 2;
    if (MAKES.some((m) => hay.includes(m.toLowerCase())) && /logo/.test(hay)) score -= 1; // OEM badges
    if (/oem|manufacturer|brand-logo|make-logo|carfax|award|dealerrater/.test(hay)) score -= 4;
    if (name && hay.includes(name.toLowerCase().split(" ")[0])) score += 2;
    if (score >= 5) pushLogo(src, score);
  });
  pushLogo($('link[rel="apple-touch-icon"]').attr("href"), 2);
  pushLogo($('meta[property="og:image"]').attr("content"), 1);
  pushLogo($('link[rel="icon"][sizes]').last().attr("href"), 0.5);
  logoCands.sort((a, b) => b.score - a.score);

  // ----- colours -----
  const theme = $('meta[name="theme-color"]').attr("content");
  let css = cssText;
  $("style").each((_, el) => {
    css += $(el).text();
  });
  $("[style]").each((_, el) => {
    css += ";" + $(el).attr("style");
  });
  const palette = rankColors((theme ? `--brand-primary:${theme};`.repeat(2) : "") + css);
  const primary = palette[0] ?? "#1d4ed8";
  const secondary = palette.find((c) => c !== primary) ?? "#0b1220";

  // ----- contact -----
  const tel = $('a[href^="tel:"]').first().attr("href")?.replace("tel:", "");
  const rawPhone = str(dealer?.telephone) || tel || text.match(/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0];
  const digits = rawPhone?.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const phone = digits?.length === 10 ? digits.replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3") : rawPhone;
  const addr = dealer?.address as JsonLd | undefined;
  let city = str(addr?.addressLocality);
  let state = str(addr?.addressRegion);
  let address = addr ? [str(addr.streetAddress), city, state].filter(Boolean).join(", ") : undefined;
  if (!city) {
    const m = text.match(/\d{2,6}\s[\w .]+?,\s*([A-Z][a-zA-Z .]+?),\s*([A-Z]{2})\s*\d{5}/);
    if (m) {
      city = m[1].trim();
      state = m[2];
      address = m[0];
    }
  }

  // ----- makes -----
  const lower = (title + " " + text).toLowerCase();
  const counted = MAKES.map((m) => ({ m, n: lower.split(m.toLowerCase()).length - 1 })).sort((a, b) => b.n - a.n);
  // A Toyota store lists a few used Fords; only keep makes that are a real share of the page.
  const top = counted[0]?.n ?? 0;
  const makes = counted
    .filter((x) => x.n > 1 && x.n >= top * 0.3)
    .slice(0, 4)
    .map((x) => x.m);

  // ----- vehicles -----
  const vehicles: Vehicle[] = [];
  const seen = new Set<string>();
  const addVehicle = (src: string | undefined, title?: string, boost = 0) => {
    const a = abs(src, pageUrl);
    if (!a || seen.has(a) || NOT_VEHICLE.test(a)) return;
    if (!VEHICLE_HINT.test(a) && boost < 1) return;
    seen.add(a);
    const banner = /(banner|slide|slider|hpb|promo|special|offer|hero|carousel|_hp_|-hp-|hp-de|online-deal|homepage|welcome|campaign|rotator)/i.test(a);
    vehicles.push({ image: a, title: vehicleTitle(title), banner });
  };
  for (const item of ld) {
    if (/Car|Vehicle|Product/.test(String(item["@type"]))) addVehicle(str(item.image), str(item.name), 2);
  }
  $("img").each((_, el) => {
    const $el = $(el) as unknown as cheerio.Cheerio<never>;
    const src = imgSrc($el);
    const alt = $(el).attr("alt") ?? "";
    const w = Number($(el).attr("width") ?? 0);
    if (w && w < 160) return;
    const looksCar = /\b(19|20)\d{2}\b/.test(alt) || MAKES.some((m) => alt.includes(m));
    addVehicle(src, alt, looksCar ? 1 : 0);
  });
  const og = abs($('meta[property="og:image"]').attr("content"), pageUrl);
  if (og && !seen.has(og) && !/logo/i.test(og)) vehicles.push({ image: og, title: "Featured" });

  // ----- socials -----
  const socials: Record<string, string> = {};
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const k of ["facebook", "instagram", "tiktok", "youtube", "x.com", "twitter"]) {
      if (href.includes(k + ".com") || (k === "x.com" && /\/\/(www\.)?x\.com/.test(href))) {
        socials[k.replace(".com", "")] ??= href;
      }
    }
  });

  const tagline =
    $('meta[name="description"]').attr("content")?.split(/[.!]/)[0]?.trim().slice(0, 90) || undefined;

  return {
    url: pageUrl,
    name,
    logo: logoCands[0]?.src,
    colors: { primary, secondary },
    palette,
    phone,
    address,
    city,
    state,
    makes,
    tagline,
    // clean photos first, promo banners after
    vehicles: [...vehicles.filter((v) => !v.banner), ...vehicles.filter((v) => v.banner)].slice(0, 18),
    inventoryLinks: inventoryLinks(html, pageUrl),
    offers: findOffers(
      text +
        " | " +
        $("img[alt]")
          .map((_, el) => $(el).attr("alt"))
          .get()
          .filter((a) => a && a.length > 8)
          .join(" | ")
    ),
    socials,
  };
}

/** The dealer's main new and used inventory listing pages, if linked from this page. */
export function inventoryLinks(html: string, base: string): { new?: string; used?: string } {
  const $ = cheerio.load(html);
  const host = new URL(base).hostname.replace(/^www\./, "");
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const a = abs($(el).attr("href"), base);
    if (!a) return;
    try {
      if (new URL(a).hostname.replace(/^www\./, "") !== host) return;
    } catch {
      return;
    }
    links.push(a);
  });
  const score = (u: string, kind: "new" | "used") => {
    const p = u.toLowerCase();
    const other = kind === "new" ? "used" : "new";
    if (!p.includes(kind) || /compare|finance|service|specials|research|model|trade|sell/.test(p)) return -1;
    let s = 0;
    if (new RegExp(`search${kind}\\.aspx$|/${kind}-(vehicles|inventory|cars)/?(index\\.htm)?$|/inventory/${kind}/?$|/${kind}/?$`).test(p.split("?")[0])) s += 10;
    if (p.includes("?")) s -= 3;
    if (p.includes(other)) s -= 5;
    return s;
  };
  const best = (kind: "new" | "used") =>
    links
      .map((u) => ({ u, s: score(u, kind) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0]?.u;
  return { new: best("new"), used: best("used") };
}

export function stylesheetLinks(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $('link[rel="stylesheet"]').each((_, el) => {
    const a = abs($(el).attr("href"), base);
    if (a && !/fonts\.googleapis|font-awesome|bootstrap(\.min)?\.css|jquery/i.test(a)) out.push(a);
  });
  return out.slice(0, 4);
}
