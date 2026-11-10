import type { Category, Platform } from "../types";
import type { Scene } from "./draw";
import * as SP from "./engines-spot";
import { cinematic } from "./engines-cinematic";
import { CINEMATIC, CUSTOM, PREVIEW_SECONDS, previewOf } from "../cinematic";
import { EVENTS, defaultEventParams } from "../events";

export const ENGINES = {
  cinematic,
  spotDiagonal: SP.spotDiagonal,
  spotPrice: SP.spotPrice,
  spotMinimal: SP.spotMinimal,
  spotEvent: SP.spotEvent,
  spotSpotlight: SP.spotSpotlight,
} satisfies Record<string, (s: Scene) => void>;

export type EngineId = keyof typeof ENGINES;

export type Template = {
  id: string;
  name: string;
  engine: EngineId;
  category: Category;
  dur: number;
  plate?: string;
  /** Use a make-specific plate when the dealer sells that make. */
  makePlate?: { make: string; plate: string; params: Record<string, unknown>; dur: number };
  params: Scene["p"];
  /** Base virality estimate, 0–100, from how the format performs in the wild. */
  score: number;
  platforms: Platform[];
  why: string;
  tags: string[];
  signature?: boolean;
  /** The frame (seconds) that best sells the template as a still. */
  poster: number;
  /** Which visual format this belongs to — variants of one format share it. */
  format: string;
  /** Colour look for themed engines; absent means the default. */
  look?: Look;
  /** Seasonal event this variant is written for (see lib/events). */
  event?: string;
};

export type Look = "light" | "dark" | "brand";

const ALL: Platform[] = ["tiktok", "reels", "shorts", "facebook", "x"];
const SHORT: Platform[] = ["tiktok", "reels", "shorts"];

type Variant = { id?: string; name: string; p?: Record<string, unknown>; score?: number; tags?: string[]; dur?: number };
type Family = {
  engine: EngineId;
  category: Category;
  dur: number;
  poster: number;
  score: number;
  why: string;
  tags: string[];
  platforms?: Platform[];
  plate?: string;
  makePlate?: Template["makePlate"];
  signature?: boolean;
  base?: Record<string, unknown>;
  variants: Variant[];
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const FAMILIES: Family[] = [
  // ------------------------------------------------------------ cinematic (the viral library)
  ...CINEMATIC.map(
    (c, i): Family => ({
      engine: "cinematic",
      category: c.source === "original" ? "Original" : "Katana",
      dur: PREVIEW_SECONDS,
      poster: 2.2,
      score: 96 - i,
      plate: previewOf(c.id),
      platforms: SHORT,
      why: c.vibe,
      tags: c.bestFor,
      signature: c.source === "katana",
      base: { cid: c.id, clipAudio: true },
      variants: [{ id: c.id, name: c.name }],
    })
  ),
  // "Create your own" (hidden from the grid): the dealer's prompt + reference images, offer on top
  {
    engine: "cinematic",
    category: "Original",
    dur: CUSTOM.seconds,
    poster: 0,
    score: 0,
    platforms: SHORT,
    why: CUSTOM.vibe,
    tags: ["custom"],
    base: { cid: CUSTOM.id, clipAudio: true },
    variants: [{ id: CUSTOM.id, name: CUSTOM.name }],
  },
  // ------------------------------------------------------------ pro offer spots
  {
    engine: "spotDiagonal",
    category: "Pro spot",
    dur: 8,
    poster: 3.6,
    score: 84,
    platforms: ALL,
    why: "The classic dealer spot: real scene, your car driving in, bold stacked headline and a diagonal panel with the call to action. Reads instantly and looks like an OEM campaign.",
    tags: ["pro", "offer", "diagonal"],
    variants: [
      {
        name: "Trade Value",
        p: { spot: { kind: "trade", kicker: "WHAT'S YOUR", lines: ["TRADE", "VALUE"], badge: "Instant trade-in offer", cta: "FIND OUT NOW" } },
        score: 2,
      },
      { name: "Offer Headline", p: {} },
    ],
  },
  {
    engine: "spotPrice",
    category: "Pro spot",
    dur: 8,
    poster: 3.6,
    score: 85,
    platforms: ALL,
    why: "Built for payment and rate offers: model name up top, the number huge in your brand colour with a roll-up and shine, terms and fine print underneath.",
    tags: ["pro", "lease", "APR", "price"],
    variants: [{ name: "Price Hero", p: {} }],
  },
  {
    engine: "spotEvent",
    category: "Pro spot",
    dur: 8,
    poster: 3.6,
    score: 82,
    platforms: ALL,
    why: "Sales-event energy: the event name stacked big over your car, the offer on a clean card, one clear button.",
    tags: ["pro", "event"],
    variants: [{ name: "Sales Event", p: {} }],
  },
  {
    engine: "spotSpotlight",
    category: "Pro spot",
    dur: 8,
    poster: 3.4,
    score: 81,
    platforms: ALL,
    why: "One specific car from your lot — in stock badge, real price, stock number and mileage. Built for inventory and aged units.",
    tags: ["pro", "inventory"],
    variants: [{ name: "Vehicle Spotlight", p: {} }],
  },
  {
    engine: "spotMinimal",
    category: "Pro spot",
    dur: 8,
    poster: 3.6,
    score: 76,
    platforms: ALL,
    why: "Quiet, premium and very clean — the car on a soft studio floor with a reflection, thin type, the offer underneath. Great for luxury and new arrivals.",
    tags: ["pro", "minimal", "premium"],
    variants: [{ name: "Clean Showroom", p: {} }],
  },
];

function build(): Template[] {
  const out: Template[] = [];
  const seen = new Set<string>();
  for (const f of FAMILIES) {
    for (const v of f.variants) {
      let id = v.id ?? slug(v.name);
      while (seen.has(id)) id += "-2";
      seen.add(id);
      out.push({
        id,
        name: v.name,
        engine: f.engine,
        category: f.category,
        dur: v.dur ?? f.dur,
        plate: f.plate,
        makePlate: f.makePlate,
        params: { ...(f.base ?? {}), ...(v.p ?? {}) },
        score: Math.min(99, f.score + (v.score ?? 0)),
        platforms: f.platforms ?? (f.plate ? SHORT : ALL),
        why: f.why,
        tags: [...f.tags, ...(v.tags ?? [])],
        signature: f.signature,
        poster: f.poster,
        format: f.engine + (f.plate ?? ""),
      });
    }
  }
  return out;
}

const BASE = build();

/** Cinematic templates and Pro spots each ship as one look — no colour-mode copies. */
const expand = (base: Template[]) => base;

/**
 * Seasonal variants: the same format with event copy. They live inside their
 * format as extra hooks and only surface while that event is active.
 */
function withEvents(all: Template[]): Template[] {
  const out = [...all];
  for (const ev of EVENTS) {
    const params = { ...defaultEventParams(ev), ...(ev.hooks ?? {}) };
    for (const [engine, p] of Object.entries(params)) {
      const base = all.find((t) => t.engine === engine && !t.plate && !t.look && !t.params.mode);
      if (!base) continue;
      out.push({
        ...base,
        id: `${base.id}--${ev.id}`,
        name: `${ev.emoji} ${ev.name}`,
        params: { ...base.params, ...p },
        tags: [...base.tags, "event"],
        event: ev.id,
      });
    }
  }
  return out;
}

export const TEMPLATES: Template[] = withEvents(expand(BASE));
/** Viral formats only — Pro spots live in their own tab. */
export const VIRAL_FORMATS = () => FORMATS.filter((f) => f.category !== "Pro spot");
export const SPOT_FORMATS = () => FORMATS.filter((f) => f.category === "Pro spot");

export const CATEGORIES: Category[] = ["Katana", "Original"];

export function byId(id: string) {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * One entry per distinct visual format. Hook copy and colour looks are
 * options inside a format, never separate cards — the library must not show
 * the same video twice.
 */
export type Format = {
  key: string;
  name: string;
  category: Category;
  signature?: boolean;
  plate?: string;
  why: string;
  score: number;
  /** Base variants: same visuals, different hook copy. */
  hooks: Template[];
  /** Colour looks available for hooks that don't fix their own. */
  looks: Look[];
};

export const FORMATS: Format[] = (() => {
  const map = new Map<string, Format>();
  for (const t of TEMPLATES) {
    let f = map.get(t.format);
    if (!f) {
      f = { key: t.format, name: t.name, category: t.category, signature: t.signature, plate: t.plate, why: t.why, score: t.score, hooks: [], looks: [] };
      map.set(t.format, f);
    }
    if (t.look) {
      if (!f.looks.includes(t.look)) f.looks.push(t.look);
    } else f.hooks.push(t);
    f.score = Math.max(f.score, t.score);
  }
  for (const f of map.values()) if (f.looks.length) f.looks.unshift("light");
  return [...map.values()];
})();

export const formatOf = (id: string) => {
  const t = byId(id);
  return t ? FORMATS.find((f) => f.key === t.format) : undefined;
};

/** The template id for a hook + look combination (falls back to the hook itself). */
export function variantId(hook: Template, look: Look) {
  if (look === "light" || hook.params.mode) return hook.id;
  const id = `${hook.id}-${look}`;
  return byId(id) ? id : hook.id;
}

export const HOOK_COUNT = TEMPLATES.filter((t) => !t.look && !t.event).length;

/** This format's variant for an event, if it has one. */
export function eventVariant(f: Format, eventId?: string | null) {
  return eventId ? f.hooks.find((h) => h.event === eventId) : undefined;
}

/** Resolve the plate and params for a dealer — Honda dealers get the Honda footage. */
export function resolveTemplate(t: Template, makes: string[]) {
  if (t.makePlate && makes.some((m) => m.toLowerCase() === t.makePlate!.make.toLowerCase())) {
    return { plate: t.makePlate.plate, params: { ...t.params, ...t.makePlate.params }, dur: t.makePlate.dur };
  }
  return { plate: t.plate, params: t.params, dur: t.dur };
}
