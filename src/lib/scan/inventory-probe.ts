/**
 * Runs INSIDE the rendered inventory page (page.evaluate). Dealer platforms
 * all differ, so instead of per-platform selectors this finds the repeated
 * "card" pattern every SRP shares: a link to a vehicle page, a photo, a
 * year + model title and a price, all inside one container.
 *
 * Must be self-contained — it is serialised and shipped to the browser.
 */
export function probeInventory() {
  type Car = {
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
  };
  const YEAR_TITLE = /\b(19[89]\d|20[0-3]\d)\s+[A-Z][A-Za-z-]+(\s+[A-Za-z0-9-]+){1,5}/;
  const money = (s: string) => {
    const all = [...s.matchAll(/\$\s?(\d{1,3}(,\d{3})+|\d{4,6})(?!\s*(\/|per)\s*mo)/gi)].map((m) => Number(m[1].replace(/,/g, "")));
    return all.filter((n) => n >= 3000 && n <= 400000);
  };
  const imgOf = (el: Element) => {
    const imgs = [...el.querySelectorAll("img")] as HTMLImageElement[];
    for (const im of imgs) {
      // lazy loaders park a data: placeholder in src until the photo scrolls into view
      const src = [im.currentSrc, im.getAttribute("data-src"), im.getAttribute("data-lazy-src"), im.getAttribute("src"), (im.getAttribute("data-srcset") ?? im.getAttribute("srcset") ?? "").split(/[\s,]+/)[0]]
        .map((x) => (x ? new URL(x, location.href).href : ""))
        .find((x) => /^https?:/.test(x));
      if (!src) continue;
      if (/logo|icon|badge|carfax|autocheck|sprite|spinner|placeholder|kbb|star/i.test(src)) continue;
      // some renderers (Firecrawl) don't download images: a 1×1 "size" means unknown, not tiny
      const w = im.naturalWidth > 1 ? im.naturalWidth : im.width > 1 ? im.width : Number(im.getAttribute("width")) || 0;
      if (w && w < 120) continue;
      return src;
    }
    // background-image photos
    const bg = [...el.querySelectorAll<HTMLElement>("[style*='background-image']")].map((n) => n.style.backgroundImage.match(/url\(["']?([^"')]+)/)?.[1]).find(Boolean);
    return bg ?? undefined;
  };

  // 1) Candidate vehicle links: VDP-looking URLs
  const anchors = [...document.querySelectorAll("a[href]")] as HTMLAnchorElement[];
  const vdp = anchors.filter((a) => {
    const h = a.href;
    if (!/^https?:/.test(h)) return false;
    return /\/(vehicle-details|vdp|inventory\/|new\/|used\/|certified\/|auto\/|vehicle\/)|[A-HJ-NPR-Z0-9]{17}|(19|20)\d{2}-[a-z]/i.test(h) && !/search|sort=|page=|compare|finance|trade|schedule|#/i.test(h);
  });

  // 2) Climb from each link to the smallest ancestor that looks like a full card
  const cards = new Map<Element, string>();
  for (const a of vdp) {
    let el: Element | null = a;
    for (let i = 0; i < 9 && el; i++) {
      const txt = (el as HTMLElement).innerText ?? "";
      if (txt.length > 4000) break;
      // a card = year/model title + photo + (a price, or a VIN / stock number for "call for price" units)
      if (YEAR_TITLE.test(txt) && (money(txt).length || /\b[A-HJ-NPR-Z0-9]{17}\b|stock\s*(#|no\.?|number)?\s*:?\s*[A-Z0-9-]{3,12}/i.test(txt)) && imgOf(el)) {
        if (!cards.has(el)) cards.set(el, a.href);
        break;
      }
      el = el.parentElement;
    }
  }
  // drop containers that contain other cards (page sections)
  const els = [...cards.keys()];
  const leaf = els.filter((e) => !els.some((o) => o !== e && e.contains(o)));

  const out: Car[] = [];
  const seen = new Set<string>();
  for (const el of leaf) {
    const txt = ((el as HTMLElement).innerText ?? "").replace(/\s+/g, " ");
    const heading = [...el.querySelectorAll("h1,h2,h3,h4,[class*='title'],[class*='name']")]
      .map((h) => (h as HTMLElement).innerText?.replace(/\s+/g, " ").trim())
      .find((t) => t && YEAR_TITLE.test(t));
    const title = (heading?.match(YEAR_TITLE)?.[0] ?? txt.match(YEAR_TITLE)?.[0] ?? "").replace(/\s+(stock|vin|msrp|price|mileage).*$/i, "").slice(0, 70);
    const prices = money(txt);
    const msrpM = txt.match(/MSRP[^$]{0,20}\$\s?([\d,]{4,})/i);
    const msrp = msrpM ? Number(msrpM[1].replace(/,/g, "")) : undefined;
    const finalM = txt.match(/(sale price|our price|internet price|final price|selling price|your price|price)[^$]{0,25}\$\s?([\d,]{4,})/i);
    const price = finalM ? Number(finalM[2].replace(/,/g, "")) : prices.length ? Math.min(...prices) : undefined;
    const vin = txt.match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0];
    const stock = txt.match(/stock\s*(#|no\.?|number)?\s*:?\s*([A-Z0-9-]{3,12})/i)?.[2];
    const miM = txt.match(/([\d,]{1,7})\s*(mi|miles)\b/i);
    const mileage = miM ? Number(miM[1].replace(/,/g, "")) : undefined;
    const condition = /certified|cpo/i.test(txt) ? "cpo" : /\bused\b|pre-owned/i.test(txt) || (mileage ?? 0) > 500 ? "used" : /\bnew\b/i.test(txt) ? "new" : undefined;
    const badges = ["price drop", "reduced", "special", "new arrival", "in transit", "one owner", "clearance", "sale pending"].filter((b) => txt.toLowerCase().includes(b));
    const key = vin ?? stock ?? cards.get(el)!;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ url: cards.get(el)!, title, price, msrp, mileage, stock, vin, image: imgOf(el), condition, badges });
  }

  // 3) JSON-LD fallback — some platforms ship the whole SRP as structured data
  if (out.length < 3) {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent ?? "");
        const items = (Array.isArray(j) ? j : j["@graph"] ?? j.itemListElement ?? [j]) as Record<string, unknown>[];
        for (const raw of items) {
          const it = ((raw as { item?: unknown }).item ?? raw) as Record<string, unknown>;
          if (!/Car|Vehicle|Product/.test(String(it["@type"]))) continue;
          const offers = (Array.isArray(it.offers) ? it.offers[0] : it.offers) as Record<string, unknown> | undefined;
          const name = String(it.name ?? "");
          const key = String(it.vehicleIdentificationNumber ?? it.sku ?? it.url ?? name);
          if (!name || seen.has(key)) continue;
          seen.add(key);
          const image = Array.isArray(it.image) ? String(it.image[0]) : typeof it.image === "string" ? it.image : undefined;
          out.push({
            url: String(it.url ?? location.href),
            title: name.slice(0, 70),
            price: offers?.price ? Number(offers.price) : undefined,
            vin: it.vehicleIdentificationNumber ? String(it.vehicleIdentificationNumber) : undefined,
            stock: it.sku ? String(it.sku) : undefined,
            image,
            mileage: (it.mileageFromOdometer as { value?: number } | undefined)?.value,
            condition: /used/i.test(String(it.itemCondition ?? "")) ? "used" : /new/i.test(String(it.itemCondition ?? "")) ? "new" : undefined,
            badges: [],
          });
        }
      } catch {
        /* malformed JSON-LD is common */
      }
    }
  }
  return out.slice(0, 60);
}
