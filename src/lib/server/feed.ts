import { askJson } from "./claude";
import type { SpecialOffer } from "../types";
import { isExpired } from "../oem";

/**
 * Inventory from the dealer's own feed — the reliable route for sites that
 * block automated visitors. Reads CSV/TSV exports, Facebook/Google vehicle
 * ad feeds (XML or CSV) and JSON. Known column names map automatically;
 * anything unusual is mapped by Claude from the header and a few rows.
 */

export type FeedCar = {
  url: string;
  title: string;
  price?: number;
  msrp?: number;
  mileage?: number;
  stock?: string;
  vin?: string;
  image?: string;
  condition?: string;
  badges: string[];
  kind: "new" | "used";
  listedAt?: number;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  color?: string;
  description?: string;
  disclaimer?: string;
  expires?: string;
  /** Every photo in the row, first one first. */
  images?: string[];
  /** Offers on this car from the feed's lease / APR / rebate / discount / bonus columns. */
  offers?: SpecialOffer[];
};

type Row = Record<string, string>;
const FIELDS = ["title", "year", "make", "model", "trim", "price", "salePrice", "msrp", "mileage", "stock", "vin", "image", "url", "condition", "listed", "daysOnLot", "color", "description"] as const;
type Field = (typeof FIELDS)[number];
type Mapping = Partial<Record<Field, string>>;

const norm = (k: string) => k.toLowerCase().replace(/^g:/, "").replace(/[^a-z0-9]/g, "");

/** Common names across DMS exports, Facebook automotive and Google vehicle feeds. */
const KNOWN: Record<Field, string[]> = {
  title: ["vehiclename", "title", "name", "vehicletitle", "description_title", "titleraw"],
  year: ["year", "modelyear", "vehicleyear", "yr"],
  make: ["make", "brand", "manufacturer", "mk"],
  model: ["model", "vehiclemodel", "mdl"],
  trim: ["trim", "trimlevel", "trimlvl", "series", "style"],
  price: ["price", "internetprice", "sellingprice", "ourprice", "listprice", "askingprice", "retailprice", "vehicleprice", "finalprice"],
  salePrice: ["saleprice", "specialprice", "finalprice", "discountedprice"],
  msrp: ["msrp", "sticker", "stickerprice", "originalprice"],
  mileage: ["mileage", "mileagevalue", "odometer", "odom", "miles", "kilometers"],
  stock: ["stock", "stocknumber", "stockno", "stocknum", "stockid", "vehicleid", "id"],
  vin: ["vin", "vehiclevin", "vinnumber"],
  image: ["imageoemstock", "photolink", "vehiclefront", "image", "imageurl", "image0url", "imagelink", "photo", "photourl", "photourls", "images", "imageurls", "picture", "pictures", "mainimage", "stockimage", "jellybean", "photolinkoriginal"],
  url: ["vdpurl", "url", "link", "vehicleurl", "detailurl", "listingurl", "website"],
  condition: ["condition", "stateofvehicle", "newused", "nu", "type", "vehiclecondition", "inventorytype"],
  listed: ["datefirstonlot", "dateinstock", "instockdate", "datein", "receiveddate", "dateadded", "createddate", "inventorydate"],
  daysOnLot: ["daysonlot", "daysinstock", "age", "daysinventory"],
  color: ["exteriorcolor", "extcolor", "exterior", "color", "colour", "paint"],
  description: ["description", "vehicledescription", "comments", "sellernotes", "dealercomments", "notes", "features"],
};

function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  for (const f of FIELDS) {
    for (const k of KNOWN[f]) {
      const h = byNorm.get(k);
      if (h && !Object.values(m).includes(h)) {
        m[f] = h;
        break;
      }
    }
  }
  return m;
}

// ---------------------------------------------------------------- parsing

function parseDelimited(text: string): Row[] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : (first.match(/\|/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "|" : ",";
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) {
      cur.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell);
      if (cur.some((x) => x.trim())) rows.push(cur);
      cur = [];
      cell = "";
    } else cell += c;
  }
  cur.push(cell);
  if (cur.some((x) => x.trim())) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => {
    const row: Row = Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()]));
    row.__urls = r.flatMap((c) => linksIn(c)).join(" ");
    return row;
  });
}

const unxml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

/** Rows from the most repeated record element (<listing>, <item>, <vehicle>, <entry>…). */
function parseXml(text: string): Row[] {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/<([a-zA-Z][\w:.-]*)[\s>]/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const pref = ["listing", "item", "vehicle", "entry", "car", "unit", "record", "row"];
  const tag =
    pref.find((t) => (counts.get(t) ?? 0) >= 1) ??
    [...counts.entries()].filter(([t]) => !/^(rss|channel|feed|listings|vehicles|xml)$/i.test(t)).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!tag) return [];
  const rows: Row[] = [];
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "g");
  for (const block of text.match(re) ?? []) {
    const row: Row = {};
    const inner = block.replace(new RegExp(`^<${tag}[^>]*>|</${tag}>$`, "g"), "");
    for (const m of inner.matchAll(/<([a-zA-Z][\w:.-]*)[^>]*>([\s\S]*?)<\/\1>/g)) {
      const k = m[1];
      let v = m[2];
      // nested (<image><url>…</url></image>, <mileage><value>…</value></mileage>): take the first leaf
      const leaf = v.match(/<([a-zA-Z][\w:.-]*)[^>]*>([^<]+)<\/\1>/);
      if (leaf) {
        row[`${k}.${leaf[1]}`] ??= unxml(leaf[2]);
        v = leaf[2];
      }
      if (!(k in row)) row[k] = unxml(v);
    }
    row.__urls = allUrls(unxml(inner)).join(" ");
    const groups: Record<string, string>[] = [];
    for (const g of inner.matchAll(/<((?:\w+:)?\w*(?:offer|incentive|special|program|rebate|promotion|lease|finance)\w*)[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const o: Record<string, string> = {};
      for (const f of g[2].matchAll(/<([a-zA-Z][\w:.-]*)[^>]*>([^<]*)<\/\1>/g)) if (f[2].trim()) o[f[1]] = unxml(f[2]);
      if (Object.keys(o).length) groups.push(o);
    }
    if (groups.length) row.__offers = JSON.stringify(groups.slice(0, 20));
    rows.push(row);
  }
  return rows;
}

function parseJson(text: string): Row[] {
  const data = JSON.parse(text) as unknown;
  const arr = Array.isArray(data)
    ? data
    : (Object.values(data as Record<string, unknown>).find((v) => Array.isArray(v) && v.length && typeof v[0] === "object") as unknown[] | undefined) ?? [];
  const flat = (o: unknown, pre = "", out: Row = {}): Row => {
    if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) flat(v, pre ? `${pre}.${k}` : k, out);
    else if (Array.isArray(o)) {
      if (o.length) flat(o[0], `${pre}.0`, out);
      out[pre] = o.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" | ");
    } else if (o != null) out[pre] = String(o);
    return out;
  };
  return arr.map((r) => {
    const row = flat(r);
    const urls: string[] = [];
    const groups: Record<string, string>[] = [];
    const walk = (o: unknown, key = "") => {
      if (typeof o === "string") urls.push(...allUrls(o));
      else if (Array.isArray(o)) {
        if (/offer|incentive|special|program|rebate|promotion|lease|finance/i.test(key) && o.some((x) => x && typeof x === "object"))
          for (const x of o) if (x && typeof x === "object" && !Array.isArray(x)) groups.push(Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => [k, String(v)])));
        o.forEach((x) => walk(x, key));
      } else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, k);
    };
    walk(r);
    row.__urls = urls.join(" ");
    if (groups.length) row.__offers = JSON.stringify(groups.slice(0, 20));
    return row;
  });
}

/**
 * Every http(s) link in a string. Commas are part of a link (image CDNs put
 * resize options in the path: /cdn-cgi/image/width=1400,height=900/…), except
 * a comma (or "|" / space) that starts the next link.
 */
function linksIn(s: string) {
  return (s.match(/https?:\/\/[^\s|"'<>\]\)]+/g) ?? []).flatMap((m) => m.split(/,\s*(?=https?:\/\/)/)).map((u) => u.replace(/[,.;]+$/, ""));
}

/** Every http(s) link in a string. */
function allUrls(s: string) {
  return linksIn(s);
}

export function parseFeed(text: string): Row[] {
  const t = text.replace(/^\uFEFF/, "").trim();
  if (t.startsWith("<")) return parseXml(t);
  if (t.startsWith("[") || t.startsWith("{")) return parseJson(t);
  return parseDelimited(t);
}

// ---------------------------------------------------------------- mapping

const num = (v?: string) => {
  if (!v) return undefined;
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function firstUrl(v?: string) {
  return v ? linksIn(v)[0] : undefined;
}

// ---------------------------------------------------------------- offers

const money = (v: string) => {
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const pretty = (k: string) =>
  k
    .replace(/^g:/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** First non-empty, non-zero value among the given field names (normalised), in priority order. */
function pick(r: Row, names: string[], numeric = false): string | undefined {
  const byNorm = new Map(Object.entries(r).filter(([k]) => !k.startsWith("__")).map(([k, v]) => [norm(k), v]));
  for (const n of names) {
    const v = byNorm.get(n)?.trim();
    if (!v || /^(null|none|n\/a|-)$/i.test(v)) continue;
    if (numeric && !(money(v) ?? 0)) continue;
    return v;
  }
  return undefined;
}

const months = (t?: string) => (t ? (/\D/.test(t.trim()) ? t.trim().toLowerCase().replace(/\bmos?\.?$/, "months") : `${t.trim()} months`) : undefined);
const dollars = (v?: string) => (v ? (money(v) ? usd(money(v)!) : v) : undefined);

/** Field-name families. Several are tried in order; the first with a real value wins. */
const F = {
  lease: ["leasepayment", "leasemonthly", "monthlylease", "leaseamount", "leasepmt", "lease", "leaseprice"],
  leaseTerm: ["leaseterm", "leasetermmonths", "leaselength", "termmonths", "term"],
  due: ["dueatsigningtotal", "dueatsigning", "leasetotaldueatsigning", "leasedueatsigning", "das", "leasedownpayment", "leasedown", "downpayment"],
  miles: ["leasemileageallowance", "mileagelimit", "leasemiles", "milesperyear", "annualmiles"],
  apr: ["financerate", "financeaprformatted", "aprformatted", "financerateplusPercent".toLowerCase(), "financeapr", "apr", "specialapr", "aprrate", "interestrate", "upstreamapr"],
  aprTerm: ["financetermmonthsnumeric", "financeterm", "financetermmonths", "financemonths", "aprterm", "loanterm", "aprmonths", "upstreamterm"],
  payment: ["financepayment", "monthlypayment", "loanpayment", "estpayment"],
  cash: ["cashamount", "cashback", "customercash", "rebate", "bonuscash", "factorycash", "manufacturercash", "cashallowance", "incentiveamount"],
  cashLabel: ["cashlabel", "cashheadline", "cashsubtype", "rebatename", "incentivename"],
  disclaimerLease: ["leasedisclaimer", "simpleleasedisclaimer", "leasedisclosureshortform"],
  disclaimerFinance: ["financedisclaimer", "financedisclosureshortforma"],
  disclaimerCash: ["cashdisclaimer", "cashdisclosureshortform"],
  disclaimer: ["prominentdisclosure", "combineddisclaimer", "disclaimerraw", "disclaimer", "disclosure", "legal", "fineprint", "legaltext", "terms"],
  expires: ["offerexpireslong", "expirationdate", "expires", "expiresat", "validthrough", "offerexpires", "enddate"],
};

/**
 * Offers from whatever the feed calls its offer fields. Lease payment, term and
 * due-at-signing become one lease offer; APR and its term one finance offer;
 * rebates, discounts and bonuses their own offers; nested offer lists (JSON
 * arrays, XML <offer> blocks) are read too. Each offer keeps its own fine print
 * and end date. Values are the feed's own numbers, formatted, never invented.
 */
function offersOf(r: Row, used: Set<string>, price?: number, msrp?: number): SpecialOffer[] {
  const out: SpecialOffer[] = [];
  const general = pick(r, F.disclaimer)?.slice(0, 4000);
  const expires = pick(r, F.expires);
  const fine = (own: string[]) => pick(r, own)?.slice(0, 4000) ?? general;

  const lease = pick(r, F.lease, true);
  if (lease) {
    const term = pick(r, F.leaseTerm, true);
    const due = pick(r, F.due, true);
    const miles = pick(r, F.miles, true);
    out.push({
      kind: "lease",
      label: "Lease",
      value: /\/\s*mo|month/i.test(lease) ? lease : `${usd(money(lease)!)}/mo`,
      detail: [months(term), due && `${dollars(due)} due at signing`, miles && (/mile/i.test(miles) ? miles : `${Number(money(miles)).toLocaleString("en-US")} mi/yr`)].filter(Boolean).join(" · ") || undefined,
      disclaimer: fine(F.disclaimerLease),
      expires,
    });
  }
  const apr = pick(r, F.apr, true);
  if (apr) {
    out.push({
      kind: "finance",
      label: "Finance",
      value: /%/.test(apr) ? apr.replace(/\s*apr\s*$/i, "") + " APR" : `${apr}% APR`,
      detail: months(pick(r, F.aprTerm, true)),
      disclaimer: fine(F.disclaimerFinance),
      expires,
    });
  }
  const pay = pick(r, F.payment, true);
  if (pay) out.push({ kind: "finance", label: "Payment", value: /mo/i.test(pay) ? pay : `${usd(money(pay)!)}/mo`, disclaimer: fine(F.disclaimerFinance), expires });
  const cash = pick(r, F.cash, true);
  if (cash) {
    const label = pick(r, F.cashLabel);
    const clean = label?.replace(/^\s*\$?[\d,.]+\s*/, "").trim();
    out.push({ kind: "cash", label: (clean && clean.length < 40 ? clean : "Cash back").replace(/\b\w/g, (c) => c.toUpperCase()), value: dollars(cash)!, disclaimer: fine(F.disclaimerCash), expires });
  }

  // other money columns: trade-in, loyalty/conquest/military bonuses, discounts (not settings, labels or copies)
  const skip = new Set([...Object.values(F).flat()]);
  for (const [k, v] of Object.entries(r)) {
    const n = norm(k);
    if (k.startsWith("__") || used.has(k) || skip.has(n)) continue;
    if (/formatted|label|lable|title|headline|detail|clause|disclaimer|disclosure|dollar|withdollar|min|max|hero|percent|per1000|fee|deposit|cost|residual|cap|total|purchase|factor|term|month|mos|qualifier|subtype|gradient|color|colour|background|badge|logo|id$/.test(n)) continue;
    const kind: SpecialOffer["kind"] | null = /tradein|tradebonus|tradeassist/.test(n)
      ? "trade"
      : /bonus|loyalty|conquest|military|college|graduate|firstresponder|owner/.test(n)
        ? "bonus"
        : /rebate|cashback|customercash|bonuscash|incentive|factorycash|mfrcash|manufacturercash|cashallowance/.test(n)
          ? "cash"
          : /discount|savings|dealercash|markdown|instantsavings/.test(n)
            ? "discount"
            : null;
    // only plain money amounts ("$1,500", "1500"), never colours, gradients or sentences
    const m = kind && /^\s*\$?\s?[\d,]+(\.\d{1,2})?\s*$/.test(v) ? money(v) : undefined;
    if (!kind || !m) continue;
    out.push({ kind, label: pretty(k).slice(0, 40), value: /\$/.test(v) ? v.trim() : usd(m), disclaimer: general, expires });
  }

  // nested offer lists
  for (const o of JSON.parse(r.__offers ?? "[]") as Record<string, string>[]) {
    const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [norm(k), v]));
    const text = Object.values(o).join(" ").toLowerCase();
    const value = lower.amount ?? lower.value ?? lower.payment ?? lower.price ?? lower.rate ?? lower.apr;
    if (!value) continue;
    const kind: SpecialOffer["kind"] = /lease/.test(text) ? "lease" : /apr|financ/.test(text) ? "finance" : /trade/.test(text) ? "trade" : /bonus|loyal|conquest|military/.test(text) ? "bonus" : /discount|saving/.test(text) ? "discount" : "cash";
    out.push({
      kind,
      label: (lower.name ?? lower.title ?? lower.label ?? lower.type ?? kind).slice(0, 40),
      value: kind === "finance" && !/%/.test(value) ? `${value}% APR` : kind === "lease" && !/mo/i.test(value) && money(value) ? `${usd(money(value)!)}/mo` : dollars(value)!,
      detail: [months(lower.term ?? lower.months), lower.dueatsigning && `${dollars(lower.dueatsigning)} due at signing`].filter(Boolean).join(" · ") || undefined,
      disclaimer: (lower.disclaimer ?? lower.disclosure)?.slice(0, 4000) ?? general,
      expires: lower.expires ?? lower.expirationdate ?? lower.enddate ?? expires,
    });
  }

  if (msrp) out.push({ kind: "msrp", label: "MSRP", value: usd(msrp) });
  if (price && price !== msrp) out.push({ kind: "price", label: msrp && msrp > price ? "Sale price" : "Price", value: usd(price) });
  if (msrp && price && msrp > price) out.push({ kind: "discount", label: "Below MSRP", value: usd(msrp - price) });
  return out.slice(0, 14);
}

/**
 * The best car photo among every link in the record: transparent "jelly bean"
 * stock shots (Chrome Data, EVOX, OEM carshots, PNG) first; logos, badges,
 * backgrounds and icons never.
 */
function rankPhotos(urls: string[]) {
  const score = (u: string) => {
    let host = "";
    let l = "";
    try {
      const x = new URL(u);
      host = x.hostname.toLowerCase();
      // judge the file path, not resize settings like "background=transparent"
      l = decodeURIComponent(x.pathname).toLowerCase();
    } catch {
      return -1;
    }
    if (!/\.(png|jpe?g|webp|avif)$|\/image|photo|chrome|evox|izmo|carshot/.test(l)) return -1;
    if (/logo|badge|background|backdrop|icon|sprite|favicon|banner|avatar|placeholder|noimage|no-image|coming-soon|watermark/.test(l.replace(/\/cdn-cgi\/image\/[^/]*/, ""))) return -1;
    let s = 1;
    // manufacturer sites behind bot walls (they refuse servers): last resort only
    if (/(^|\.)(automobiles\.honda|toyota|ford|chevrolet|gm|nissanusa|hyundaiusa|kia|subaru|mazdausa|jeep|ramtrucks)\.com$/.test(host)) s -= 4;
    if (/\/chrome\/|chromedata|evox|izmo|jelly|carshot|oem|stock/.test(l)) s += 5;
    if (/\.png$/.test(l)) s += 3;
    if (/front|_1280|1280|large|hero|main/.test(l)) s += 1;
    return s;
  };
  return [...new Set(urls)]
    .map((u) => ({ u, s: score(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.u);
}

const urlsIn = (v?: string) => (v ? linksIn(v) : []).filter((u) => !/\.(svg|gif)(\?|$)/i.test(u));

function toCar(r: Row, m: Mapping, origin: string): FeedCar | null {
  const g = (f: Field) => (m[f] ? r[m[f]!] : undefined);
  // the feed's own title usually carries the trim; build one only when it's missing
  const title = g("title")?.trim() || [g("year"), g("make"), g("model"), g("trim")].filter(Boolean).join(" ").trim();
  if (!title || title.length < 4) return null;
  const condRaw = (g("condition") ?? "").toLowerCase();
  const cpo = /cert|cpo/.test(condRaw);
  const used = cpo || /used|pre/.test(condRaw) || condRaw === "u";
  const listed = g("listed") ? Date.parse(g("listed")!) : NaN;
  const days = num(g("daysOnLot"));
  const sale = num(g("salePrice"));
  const url = firstUrl(g("url"));
  const price = sale ?? num(g("price"));
  const msrp = num(g("msrp"));
  const mapped = new Set(Object.values(m).filter(Boolean) as string[]);
  // every photo: the feed's own photo fields in order, then the best-looking car photos anywhere in the record
  const preferred = ["photolink", "imageoemstock", "vehiclefront", "imagelibrary", "photolinkoriginal", "image", "imageurl", "mainimage", "photo", "photourl", "stockimage", "images", "imageurls", "photourls", "vehicleside"]
    .map((n) => Object.entries(r).find(([k]) => norm(k) === n)?.[1])
    .flatMap((v) => urlsIn(v));
  const images = [...new Set([...preferred, ...urlsIn(g("image")), ...rankPhotos([...Object.entries(r).filter(([k]) => /image|photo|picture|vehicle(front|side)/i.test(k)).flatMap(([, v]) => urlsIn(v)), ...(r.__urls ?? "").split(" ").filter(Boolean)])])].slice(0, 12);
  return {
    year: Number(g("year")) || Number(title.match(/\b(19|20)\d{2}\b/)?.[0]) || undefined,
    make: g("make")?.trim() || undefined,
    model: g("model")?.trim() || undefined,
    trim: g("trim")?.trim() || undefined,
    color: g("color")?.trim() || undefined,
    description: g("description")?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) || undefined,
    images: images.length ? images : undefined,
    offers: offersOf(r, mapped, price, msrp),
    url: url ?? origin,
    title: title.slice(0, 70),
    price: sale ?? num(g("price")),
    msrp: num(g("msrp")),
    mileage: num(g("mileage")),
    stock: g("stock") || undefined,
    vin: g("vin") && /^[A-HJ-NPR-Z0-9]{17}$/i.test(g("vin")!) ? g("vin")!.toUpperCase() : undefined,
    image: images[0] ?? firstUrl(g("image")),
    disclaimer: pick(r, F.disclaimer)?.slice(0, 4000),
    expires: pick(r, F.expires),
    condition: cpo ? "cpo" : used ? "used" : "new",
    badges: sale && num(g("price")) && sale < num(g("price"))! ? ["special"] : [],
    kind: used ? "used" : "new",
    listedAt: Number.isFinite(listed) ? listed : days != null ? Date.now() - days * 864e5 : undefined,
  };
}

/** Parse a feed and map it to cars; Claude fills in the column mapping when our names don't match. */
export async function feedToCars(text: string, origin: string, claudeKey?: string): Promise<{ cars: FeedCar[]; mappedBy: "auto" | "claude"; rows: number }> {
  const rows = parseFeed(text).slice(0, 2000);
  if (!rows.length) throw new Error("We couldn't find any rows in that file.");
  const headers = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r).filter((k) => !k.startsWith("__"))))];
  let mapping = autoMap(headers);
  let mappedBy: "auto" | "claude" = "auto";
  const enough = (mp: Mapping) => (mp.title || (mp.year && mp.model)) && (mp.price || mp.salePrice || mp.vin || mp.stock);
  if (!enough(mapping) && claudeKey) {
    const sample = rows.slice(0, 5).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.slice(0, 120)])));
    const r = await askJson<{ mapping?: Mapping }>(
      claudeKey,
      "You map columns of car-dealer inventory exports to a fixed schema. JSON only.",
      [
        {
          type: "text",
          text: `Columns: ${JSON.stringify(headers)}\nSample rows: ${JSON.stringify(sample)}\n\nMap each of these fields to the ONE column that holds it (exact column name), or omit it: ${FIELDS.join(", ")}.\n"price" is the advertised/selling price; "salePrice" only if there's a separate discounted price; "image" is a photo URL column; "listed" is a date the car arrived; "daysOnLot" a number of days.\nReply: {"mapping": {"field": "column name"}}`,
        },
      ],
      1200,
      40_000
    );
    const m = Object.fromEntries(Object.entries(r.mapping ?? {}).filter(([f, c]) => (FIELDS as readonly string[]).includes(f) && headers.includes(String(c)))) as Mapping;
    mapping = { ...mapping, ...m };
    mappedBy = "claude";
  }
  if (!enough(mapping)) throw new Error("We couldn't tell which columns are the vehicle and price. Add a Claude key in Admin to map unusual files automatically.");
  // offer feeds list one row per offer (lease, finance, cash…) for the same car: merge them into one car with all its offers
  const byId = new Map<string, FeedCar>();
  const cars: FeedCar[] = [];
  for (const r of rows) {
    const c = toCar(r, mapping, origin);
    if (!c) continue;
    const id = c.vin ?? c.stock ?? `${c.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${c.images?.[0] ?? ""}`;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, c);
      cars.push(c);
      continue;
    }
    for (const o of c.offers ?? []) {
      const digits = o.value.replace(/[^\d.]/g, "");
      if (!(prev.offers ?? []).some((x) => x.kind === o.kind && x.value.replace(/[^\d.]/g, "") === digits)) (prev.offers ??= []).push(o);
    }
    prev.price ??= c.price;
    prev.msrp ??= c.msrp;
    prev.description ??= c.description;
    prev.disclaimer ??= c.disclaimer;
    prev.expires ??= c.expires;
    prev.images ??= c.images;
    prev.image ??= c.image;
  }
  // a car with no photo of its own borrows one from the same model elsewhere in the feed
  const modelKey = (c: FeedCar) => `${(c.make ?? "").toLowerCase()} ${(c.model ?? c.title.replace(/^(new|used|certified|pre-owned)\s+/i, "").replace(/^\d{4}\s+/, "").split(" ").slice(0, 2).join(" ")).toLowerCase()}`.trim();
  for (const c of cars) {
    if (c.images?.length) continue;
    const twin = cars.find((o) => o !== c && o.images?.length && modelKey(o) === modelKey(c));
    if (twin) {
      c.images = [...twin.images!];
      c.image = c.images[0];
    }
  }
  // OEM kit §7.12: expired offers are removed everywhere
  for (const c of cars) c.offers = c.offers?.filter((o) => !isExpired(o.expires));
  // deals first, then MSRP/price
  for (const c of cars) c.offers?.sort((a, b) => Number(a.kind === "msrp" || a.kind === "price") - Number(b.kind === "msrp" || b.kind === "price"));
  return { cars: cars.slice(0, 600), mappedBy, rows: rows.length };
}
