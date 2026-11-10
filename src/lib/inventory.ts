import type { AdInputs } from "./types";
import type { InventoryCar } from "./workspace";
import { CINEMATIC } from "./cinematic";

export type RawScanCar = {
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
  listedAt?: number;
  kind: "new" | "used";
  make?: string;
  model?: string;
  trim?: string;
  color?: string;
  description?: string;
  disclaimer?: string;
  expires?: string;
  /** Every photo from the feed (first = hero). */
  images?: string[];
  /** Offers on this car from the feed. */
  offers?: import("./types").SpecialOffer[];
};

const money = (n?: number) => (n ? "$" + n.toLocaleString("en-US") : "");

/** Merge a fresh scan into what we already know, keeping first-seen dates so age keeps counting across scans. */
export function mergeInventory(prev: InventoryCar[] = [], scanned: RawScanCar[]): InventoryCar[] {
  const now = Date.now();
  const byId = new Map(prev.map((c) => [c.id, c]));
  const out: InventoryCar[] = [];
  for (const s of scanned) {
    // offer feeds have no VIN/stock and share model-page links across trims: the title keeps them apart
    const id = s.vin ?? s.stock ?? `${s.url}#${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const old = byId.get(id);
    const year = Number(s.title.match(/\b(19|20)\d{2}\b/)?.[0]) || undefined;
    const condition: InventoryCar["condition"] = s.condition === "cpo" ? "cpo" : s.kind === "used" || s.condition === "used" ? "used" : "new";
    const firstSeen = old?.firstSeen ?? now;
    const badges = [...new Set([...(s.badges ?? []), ...(old && s.price && old.price && s.price < old.price ? ["price drop"] : [])])];
    out.push({
      id,
      title: s.title,
      year,
      price: s.price,
      msrp: s.msrp,
      mileage: s.mileage,
      stock: s.stock,
      vin: s.vin,
      image: s.image,
      url: s.url,
      make: s.make ?? old?.make,
      model: s.model ?? old?.model,
      trim: s.trim ?? old?.trim,
      color: s.color ?? old?.color,
      description: s.description ?? old?.description,
      images: s.images ?? old?.images,
      disclaimer: s.disclaimer ?? old?.disclaimer,
      expires: s.expires ?? old?.expires,
      offers: s.offers?.length ? s.offers : old?.offers,
      condition,
      badges,
      listedAt: Math.min(s.listedAt ?? firstSeen, firstSeen),
      firstSeen,
      lastSeen: now,
    });
  }
  return out;
}

export const daysOnLot = (c: InventoryCar) => Math.max(0, Math.floor((Date.now() - c.listedAt) / 864e5));

/** The current model year rolls over in late summer. */
export function currentModelYear(now = new Date()) {
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

/** Why a car counts as aged inventory, or null if it doesn't. */
export function agedReason(c: InventoryCar): string | null {
  const days = daysOnLot(c);
  if (c.condition === "new" && c.year && c.year <= currentModelYear() - 2) return `Outgoing ${c.year} model`;
  if (c.condition === "new" && days >= 60) return `${days} days on lot`;
  if (c.condition !== "new" && days >= 45) return `${days} days on lot`;
  if (c.badges.includes("price drop") || c.badges.includes("reduced")) return "Price dropped";
  return null;
}

export type OfferStyle = "price" | "aged" | "custom";

/** Ad inputs that feature one specific vehicle. */
export function inputsForCar(c: InventoryCar, base: AdInputs, style: OfferStyle, custom = ""): AdInputs {
  const p = money(c.price);
  const offer =
    style === "custom" && custom.trim()
      ? custom.replaceAll("{price}", p || "a great price").replaceAll("{car}", c.title)
      : !p
        ? `${c.title} — ask about today's price`
        : style === "aged"
          ? `Priced to move: ${p}`
          : c.msrp && c.price && c.msrp > c.price
            ? `${p} — ${money(c.msrp - c.price)} under MSRP`
            : `Only ${p}`;
  const sub = [c.stock && `Stock #${c.stock}`, c.condition === "new" ? "New" : c.mileage ? `${c.mileage.toLocaleString("en-US")} mi` : "Pre-owned"]
    .filter(Boolean)
    .join(" · ");
  return { ...base, offer, offerSub: sub, vehicleImage: c.image ?? base.vehicleImage, vehicleName: c.title, cta: style === "aged" ? "Grab it before it's gone" : base.cta };
}

/** Cinematic templates built from the car's own photo — every one takes a specific vehicle. */
export const CAR_FORMATS = CINEMATIC.map((c) => c.id);
/** Cars that have sat too long: the hard-sell and loopable ones. */
export const AGED_FORMATS = ["price-drop-countdown", "pov-test-drive", "showroom-light-sweep", "car-edit", "rain-night-drive", "nocturne"];
