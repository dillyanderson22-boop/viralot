export type Vehicle = {
  image: string;
  title?: string;
  price?: string;
  /** Stock fallback rather than something scraped from the dealer. */
  stock?: boolean;
  /** Promo banner with text baked in — fine to pick, bad as a default hero. */
  banner?: boolean;
};

/** An offer as Claude read it — often off a banner image — with its real terms. */
/** One deal on a car, as the specials page states it: "Lease" · "$299/mo" · "36 mo · $4,771 due at signing". */
export type SpecialOffer = {
  kind: "lease" | "finance" | "cash" | "discount" | "msrp" | "price" | "trade" | "bonus" | "other";
  label: string;
  value: string;
  detail?: string;
  /** This offer's own fine print and end date, when the feed gives them per offer. */
  disclaimer?: string;
  expires?: string;
};

/** A car on the dealer's specials pages with every offer running on it. */
export type Special = {
  id: string;
  vehicle: string;
  image?: string;
  page?: string;
  expires?: string;
  disclaimer?: string;
  stock?: string;
  vin?: string;
  offers: SpecialOffer[];
};

export type OfferDetail = {
  /** Short headline, as advertised. Also listed in `Brand.offers`. */
  headline: string;
  model?: string;
  kind: "lease" | "apr" | "cash" | "price" | "trade" | "event" | "other";
  amount?: string;
  term?: string;
  dueAtSigning?: string;
  apr?: string;
  expires?: string;
  /** The fine print, verbatim (trimmed). */
  disclaimer?: string;
  source: "banner" | "text";
  /** Banner image it came from (proxied), when there is one. */
  image?: string;
  /** The dealer page the offer was read from. */
  page?: string;
};

/** Claude's suggestion for which ads to make from an offer. */
export type AdIdea = { offer: string; spotStyle?: string; viralFormats: string[]; hook?: string };

export type Brand = {
  url: string;
  name: string;
  logo?: string;
  colors: { primary: string; secondary: string };
  /** Every saturated colour we found, most frequent first. */
  palette: string[];
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  makes: string[];
  tagline?: string;
  vehicles: Vehicle[];
  offers: string[];
  socials: Record<string, string>;
  screenshot?: string;
  /** Set when the live site blocked us and the kit came from an Internet Archive copy. */
  archivedFrom?: string;
  /** New / used inventory listing pages found on the homepage. */
  inventoryLinks?: { new?: string; used?: string };
  /** One line on how the dealership talks about itself. */
  about?: string;
  hours?: string;
  offerDetails?: OfferDetail[];
  /** Applied from the admin's brand guidelines for the makes this dealer sells. */
  compliance?: {
    brand?: string;
    headingFont?: { name: string; url?: string };
    bodyFont?: { name: string; url?: string };
    headlineCase?: "upper" | "title" | "sentence" | "as-written";
    disclaimer?: string;
    /** OEM kit: the make's licensed face (Regular 400 + Bold 700), served by /api/brand-font. */
    make?: string;
    family?: string;
    faces?: { weight: number; url: string }[];
    figure?: { family: string; url: string };
    /** OEM kit §0: never uppercase for style; title case with the manufacturers' spellings. */
    noCaps?: boolean;
    /** OEM kit §7.8: stock renders carry "Vehicle shown may differ". */
    stockCaveat?: boolean;
  };
  /** Cars on the specials pages, each with all its offers (read by Firecrawl). */
  specials?: Special[];
  specialsScannedAt?: number;
  ideas?: AdIdea[];
  /** Set when Claude read the site during the scan. */
  readByClaude?: boolean;
};

/** What the dealer chose to put in this batch of ads. */
export type AdInputs = {
  offer: string;
  offerSub: string;
  cta: string;
  vehicleImage: string;
  vehicleName: string;
  /** Pro-spot overrides (headline, numbers, scene…); parsed from the offer when absent. */
  spot?: Partial<import("./spot").SpotFields>;
  /** URL of a generated rolling clip of this car; replaces the scene when set. */
  clip?: string;
  /** The dealer's own cinematic clips, by cinematic template id (text-free footage). */
  cinematic?: Record<string, string>;
  /** Offers picked from one special for this car (one, some or all of them). */
  offers?: SpecialOffer[];
  /** The special those offers came from. */
  specialId?: string;
  /** Backup photos of the same car (or model), tried in order if the main photo won't load. */
  vehicleImages?: string[];
  /** The inventory car (feed) this ad is for. */
  carId?: string;
  vin?: string;
  stock?: string;
  /** The car's description from the feed (used for captions). */
  description?: string;
  /** Optional text prompt for AI-filmed videos: notes on the template, or the dealer's own shot list. */
  direction?: string;
  promptMode?: "add" | "own";
  /** "Create your own": video length, and the reference images kept in private storage (+ small thumbnails to show). */
  seconds?: number;
  refIds?: string[];
  refThumbs?: string[];
  /** The car photo is already a front three-quarter shot (e.g. from the specials page). */
  angled?: boolean;
};

export type Platform = "tiktok" | "reels" | "shorts" | "facebook" | "x";

export type Category =
  | "Interactive"
  | "Illusion"
  | "Satisfying"
  | "POV"
  | "Phone UI"
  | "Game"
  | "News & Hype"
  | "Meme"
  | "Countdown"
  | "Cinematic"
  | "Aesthetic"
  | "Katana"
  | "Original"
  | "Pro spot";

export type ScanEvent =
  | { type: "step"; label: string }
  | { type: "screenshot"; data: string }
  | { type: "found"; key: string; value: string }
  | { type: "done"; brand: Brand }
  | { type: "error"; message: string };
