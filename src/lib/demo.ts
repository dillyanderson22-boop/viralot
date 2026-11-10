import type { AdInputs, Brand, Vehicle } from "./types";

export const STOCK_VEHICLES: Vehicle[] = [
  { image: "/cars/suv.jpg", title: "Pearl White SUV", stock: true },
  { image: "/cars/sedan.jpg", title: "Midnight Sedan", stock: true },
  { image: "/cars/truck.jpg", title: "Graphite Pickup", stock: true },
  { image: "/cars/ev.jpg", title: "Silver EV Crossover", stock: true },
];

export const DEMO_BRAND: Brand = {
  url: "https://northline-motors.example",
  name: "Northline Motors",
  logo: "/demo-logo.svg",
  colors: { primary: "#2563eb", secondary: "#0b1220" },
  palette: ["#2563eb", "#0b1220", "#93c5fd"],
  phone: "(303) 555-0142",
  address: "1200 Peak Ave, Denver, CO",
  city: "Denver",
  state: "CO",
  makes: [],
  tagline: "Denver's no-haggle dealership",
  vehicles: STOCK_VEHICLES,
  offers: ["$0 down on every SUV this weekend", "2.9% APR for 60 months", "$2,000 over book for your trade"],
  socials: {},
};

/** The scraped photo whose model name appears in the offer ("Lease a new Camry…" → Camry). */
export function matchVehicle(offer: string, vehicles: Vehicle[]): Vehicle | undefined {
  const o = offer.toLowerCase();
  let best: Vehicle | undefined;
  let bestLen = 0;
  for (const v of vehicles) {
    if (v.stock || v.banner || !v.title) continue;
    const words = v.title.replace(/\b(19|20)\d{2}\b/g, "").split(/\s+/).filter((w) => w.length > 2);
    const model = words.filter((w) => o.includes(w.toLowerCase()));
    const score = model.join(" ").length;
    if (score > bestLen && model.some((w) => !/^(toyota|honda|ford|chevrolet|new|used)$/i.test(w))) {
      best = v;
      bestLen = score;
    }
  }
  return best;
}

export function defaultInputs(b: Brand): AdInputs {
  // Headlines need to be punchy; long informational sentences stay as options only.
  const offer = b.offers.find((o) => o.length <= 60) ?? "$0 down this weekend";
  const v =
    matchVehicle(offer, b.vehicles) ?? b.vehicles.find((x) => !x.stock && !x.banner) ?? b.vehicles.find((x) => x.stock) ?? STOCK_VEHICLES[0];
  return {
    offer,
    offerSub: "On approved credit. Limited time.",
    cta: "Claim this deal",
    vehicleImage: v.image,
    vehicleName: v.title && !/featured/i.test(v.title) ? v.title : b.makes[0] ? `New ${b.makes[0]}` : "Your next car",
  };
}

/** Offers we suggest when a site has none we can read. Always shown as editable suggestions. */
export const SUGGESTED_OFFERS = [
  "$0 down this weekend",
  "We'll pay off your trade — no matter what you owe",
  "0.9% APR on select models",
  "$1,500 bonus for your trade-in",
  "First payment on us",
];
