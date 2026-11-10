import type { AdInputs, OfferDetail, Special, SpecialOffer } from "./types";
import type { InventoryCar } from "./workspace";
import { isExpired } from "./oem";
import type { SpotFields } from "./spot";

/**
 * Specials → ad inputs. A special is one car with every offer on it; the
 * dealer picks one, some or all, and the ad shows exactly those, with the
 * car's own photo and fine print. Nothing is invented: every string comes
 * from the specials page.
 */

const KIND_TO_DETAIL: Record<SpecialOffer["kind"], OfferDetail["kind"]> = {
  lease: "lease",
  finance: "apr",
  cash: "cash",
  discount: "cash",
  msrp: "price",
  price: "price",
  trade: "trade",
  bonus: "cash",
  other: "other",
};

/** Short model name for headlines: "2026 Honda CR-V LX FWD" → "CR-V LX". */
export function shortVehicle(v: string) {
  return v
    .replace(/^\s*(new|used|certified)\s+/i, "")
    .replace(/^\d{4}\s+/, "")
    .replace(/^(honda|toyota|ford|chevrolet|chevy|nissan|hyundai|kia|subaru|mazda|jeep|ram|gmc|bmw|audi|lexus|acura|volkswagen|vw|buick|cadillac|dodge|chrysler|mitsubishi|volvo|infiniti|genesis|lincoln|mercedes-benz|tesla)\s+/i, "")
    .replace(/\s+(fwd|awd|4wd|2wd|cvt|automatic|4d.*)$/i, "")
    .trim();
}

/** One line per offer, as an ad headline: "Lease a CR-V LX for $299/mo · 2.99% APR · $1,000 Trade-In Bonus". */
export function headlineFor(sp: Special, picked: SpecialOffer[]) {
  const car = shortVehicle(sp.vehicle);
  const [first, ...rest] = picked;
  if (!first) return car;
  const lead =
    first.kind === "lease"
      ? `Lease a ${car} for ${first.value}`
      : first.kind === "finance"
        ? `${first.value} on the ${car}`
        : first.kind === "price" || first.kind === "msrp"
          ? `${car} · ${first.label} ${first.value}`
          : `${first.value} ${first.label} on the ${car}`;
  return [lead, ...rest.map((o) => (o.kind === "finance" ? o.value : `${o.value} ${o.label}`))].join(" · ");
}

/** Spot fields for the picked offers: the first is the big number, the rest ride along underneath. */
export function spotFieldsFor(sp: Special, picked: SpecialOffer[]): Partial<SpotFields> {
  const [first, ...rest] = picked;
  if (!first) return {};
  const m = first.value.match(/^(\$?[\d,.]+%?)\s*(.*)$/);
  const big = m ? m[1] : first.value;
  const unit = m ? m[2].replace(/^per\s+/i, "/").toUpperCase() : "";
  const detail = [first.detail?.slice(0, 60), ...rest.map((o) => `${o.label} ${o.value}`)].filter(Boolean).join(" · ");
  return {
    big,
    unit,
    detail: detail || undefined,
    // only the fine print of the offers actually in the ad
    disclaimer: [...new Set(picked.map((o) => o.disclaimer).filter(Boolean))].join(" ") || sp.disclaimer,
  };
}

/** An inventory car (from the dealer's feed) in the shape the pickers use. */
export function carAsSpecial(c: InventoryCar): Special {
  return {
    id: c.id,
    vehicle: c.title,
    image: c.images?.[0] ?? c.image,
    page: c.url,
    stock: c.stock,
    disclaimer: c.disclaimer,
    expires: c.expires,
    vin: c.vin,
    // saved inventory can outlive an offer: expired ones are never offered (OEM kit §7.12)
    offers: c.offers?.length ? c.offers.filter((o) => !isExpired(o.expires ?? c.expires)) : c.price ? [{ kind: "price", label: "Price", value: "$" + c.price.toLocaleString("en-US") }] : [],
  };
}

/** The ad inputs for a car from the feed: its photo, description and the chosen offers. */
export function inputsForCar(base: AdInputs, c: InventoryCar, picked: SpecialOffer[]): AdInputs {
  const sp = carAsSpecial(c);
  const ad = inputsForSpecial(base, sp, picked);
  return {
    ...ad,
    offer: picked.length ? ad.offer : `${shortVehicle(c.title)} · ask about today's price`,
    offerSub: [ad.offerSub.startsWith("Ends") ? ad.offerSub.split(" · ")[0] : "", c.stock && `Stock #${c.stock.replace(/^#+/, "")}`, c.condition === "new" ? "New" : c.mileage ? `${c.mileage.toLocaleString("en-US")} mi` : "Pre-owned"].filter(Boolean).join(" · "),
    // stock "jelly bean" shots (Chrome Data, EVOX, OEM carshots, transparent PNGs) are already front three-quarter;
    // real lot photos aren't, so offer spots turn those into studio shots on Generate
    angled: /\/chrome\/|chromedata|evox|izmo|jelly|carshot|\.png(\?|$)/i.test(decodeURIComponent(ad.vehicleImage)),
    specialId: undefined,
    carId: c.id,
    vehicleImages: [c.image, ...(c.images ?? [])].filter(Boolean) as string[],
    vin: c.vin,
    stock: c.stock,
    description: c.description,
  };
}

/** The ad inputs for a special: its car, its photo and the chosen offers. */
export function inputsForSpecial(base: AdInputs, sp: Special, picked: SpecialOffer[]): AdInputs {
  return {
    ...base,
    offer: headlineFor(sp, picked),
    offerSub: [picked.find((o) => o.expires)?.expires ?? sp.expires ? `Ends ${picked.find((o) => o.expires)?.expires ?? sp.expires}` : "", sp.stock ? `Stock #${sp.stock.replace(/^#+/, "")}` : ""].filter(Boolean).join(" · ") || base.offerSub,
    vehicleName: sp.vehicle,
    vehicleImage: sp.image ?? base.vehicleImage,
    angled: !!sp.image,
    offers: picked,
    specialId: sp.id,
    carId: undefined,
    spot: spotFieldsFor(sp, picked),
    clip: undefined,
    cinematic: undefined,
  };
}

/** Flat offer list (headline per offer) for the parts of the app that take a single offer. */
export function detailsFromSpecials(specials: Special[]): OfferDetail[] {
  return specials.flatMap((sp) =>
    sp.offers.map((o) => ({
      headline: headlineFor(sp, [o]),
      model: sp.vehicle,
      kind: KIND_TO_DETAIL[o.kind],
      amount: o.value,
      term: o.detail,
      expires: sp.expires,
      disclaimer: sp.disclaimer,
      source: "text" as const,
      image: sp.image,
      page: sp.page,
    }))
  );
}

/** Model words for matching photos across trims: "New 2027 Honda CR-V LX 2WD" → "cr v". */
const modelOf = (t: string) =>
  shortVehicle(t)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");

/**
 * Every photo worth trying for a car, best first: its own photos, then the same
 * model's photos from other cars in the feed, then the dealer's site photos of
 * that model. Cards walk this list until one loads.
 */
export function photosFor(c: { title: string; image?: string; images?: string[] }, inventory: { title: string; image?: string; images?: string[] }[] = [], siteVehicles: { image: string; title?: string }[] = []) {
  const m = modelOf(c.title);
  const first = m.split(" ")[0];
  const same = inventory.filter((o) => o !== c && modelOf(o.title) === m).flatMap((o) => [o.image, ...(o.images ?? [])]);
  const site = siteVehicles.filter((v) => v.title && first && v.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(first)).map((v) => v.image);
  return [...new Set([c.image, ...(c.images ?? []), ...same, ...site].filter(Boolean) as string[])];
}
