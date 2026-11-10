"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdInputs, Brand, Platform } from "./types";
import type { Scene as SceneDef, SpotFields } from "./spot";
import { byId } from "./ad/catalog";

/**
 * Everything the user has made, kept in this browser: dealerships, their
 * brand kits, and every ad generated for them. Videos aren't stored — they
 * re-render identically from the saved template + inputs, so a saved ad is
 * a few hundred bytes and can be re-downloaded any time.
 */

export type InventoryCar = {
  /** VIN, stock number or URL — stable across scans. */
  id: string;
  title: string;
  year?: number;
  price?: number;
  msrp?: number;
  mileage?: number;
  stock?: string;
  vin?: string;
  image?: string;
  url: string;
  condition: "new" | "used" | "cpo";
  badges: string[];
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

  /** When the listing first appeared (from the photo upload date, or our first scan). */
  listedAt: number;
  firstSeen: number;
  lastSeen: number;
};

export type PlanItem = { templateId: string; inputs: AdInputs };

/** A background being generated from the dealer's description. */
export type SceneJob = { requestId: string; place: string; status: "queued" | "in_progress" | "completed" | "failed"; error?: string; startedAt: number };

export type ClipJob = { requestId: string; status: "queued" | "in_progress" | "completed" | "failed"; url?: string; error?: string; startedAt: number };

/** The offer-spot builder's working state. Edits are per style and belong to one offer. */
export type SpotDraft = {
  styles: string[];
  focus: string;
  scene: string;
  offer: string;
  edits: Record<string, Partial<SpotFields>>;
  /** AI rolling clips keyed by `${style}|${car image}|${scene}`. */
  clips: Record<string, ClipJob>;
};

export type Dealer = {
  id: string;
  brand: Brand;
  inputs: AdInputs;
  /** Templates currently picked in the library. */
  selected: string[];
  createdAt: number;
  updatedAt: number;
  inventory?: InventoryCar[];
  inventoryScannedAt?: number;
  /** The dealer's own inventory feed link, re-read on every refresh when set. */
  inventoryFeed?: string;
  /** Active seasonal event (see lib/events). */
  event?: string | null;
  /** A prepared multi-car batch (inventory → ads); takes priority over `selected`. */
  plan?: PlanItem[];
  spot?: SpotDraft;
  /** Backgrounds this dealer generated (with their fit settings). */
  scenes?: SceneDef[];
  sceneJob?: SceneJob;
  /** Front three-quarter studio shots, keyed by the original car photo. */
  fronts?: Record<string, ClipJob>;
  /** Dealer chose to keep the side-view photos in spots. */
  frontOff?: boolean;
  /** Film the dealer's car with AI for cinematic templates as soon as ads are generated. */
  film?: { on: boolean; tier: import("./cinematic").TierId };
};

export type Rating = "great" | "ok" | "flop";
export type Slot = { at: number; posted?: boolean };

export type SavedAd = {
  id: string;
  dealerId: string;
  batchId: string;
  templateId: string;
  inputs: AdInputs;
  score: number;
  createdAt: number;
  aiCaptions?: Partial<Record<Platform, { text: string; hashtags: string[] }>>;
  downloads?: number;
  /** How it performed once posted — feeds the library's per-dealer ranking. */
  rating?: Rating;
  views?: number;
  /** Posting calendar slots per platform. */
  schedule?: Partial<Record<Platform, Slot>>;
  /** Cinematic templates: the Higgsfield render of this ad's car (`car` = the photo it was made from). */
  cine?: ClipJob & { car: string; direction?: string; mode?: "add" | "own" };
};

export type Workspace = { dealers: Dealer[]; ads: SavedAd[]; activeId: string | null };

const KEY = "viralot.v2.workspace";
const EMPTY: Workspace = { dealers: [], ads: [], activeId: null };

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function migrateV1(): Workspace | null {
  try {
    const brand = JSON.parse(localStorage.getItem("viralot.v1.brand") ?? "null") as Brand | null;
    const inputs = JSON.parse(localStorage.getItem("viralot.v1.inputs") ?? "null") as AdInputs | null;
    const selected = JSON.parse(localStorage.getItem("viralot.v1.selected") ?? "[]") as string[];
    if (!brand || !inputs) return null;
    const d: Dealer = { id: uid(), brand, inputs, selected: selected.filter((s) => byId(s)), createdAt: Date.now(), updatedAt: Date.now() };
    return { dealers: [d], ads: [], activeId: d.id };
  } catch {
    return null;
  }
}

export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = JSON.parse(raw) as Workspace;
      // drop ads and picks whose template has been retired
      const dealers = (ws.dealers ?? []).map((d) => ({ ...d, selected: (d.selected ?? []).filter((s) => byId(s)) }));
      return { ...EMPTY, ...ws, dealers, ads: (ws.ads ?? []).filter((a) => byId(a.templateId)) };
    }
    const migrated = migrateV1();
    if (migrated) {
      // save it right away, or every reload would mint a new dealer id
      persist(migrated);
      return migrated;
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
  return EMPTY;
}

function persist(ws: Workspace) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    /* quota or private mode — the session still works, it just won't survive a reload */
  }
}

/** Workspace state with write-through persistence and cross-tab sync. */
export function useWorkspace() {
  const [ws, setWs] = useState<Workspace | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWs(loadWorkspace());
    const onStorage = (e: StorageEvent) => e.key === KEY && setWs(loadWorkspace());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((fn: (w: Workspace) => Workspace) => {
    setWs((prev) => {
      const next = fn(prev ?? EMPTY);
      persist(next);
      return next;
    });
  }, []);

  return { ws, update };
}

// ---------- tiny hash router (refresh-safe, back button works) ----------

export type Route =
  | { name: "welcome" }
  | { name: "new" }
  | { name: "create"; id: string }
  | { name: "ads"; id: string; batch?: string; ad?: string }
  | { name: "brand"; id: string; fresh?: boolean }
  | { name: "generating"; id: string }
  | { name: "inventory"; id: string }
  | { name: "spots"; id: string }
  | { name: "specials"; id: string }
  | { name: "calendar"; id: string; week?: number };

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const q = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return { name: "new" };
  if (parts[0] === "d" && parts[1]) {
    const id = parts[1];
    switch (parts[2]) {
      case "ads":
        return { name: "ads", id, batch: q.get("batch") ?? undefined, ad: q.get("ad") ?? undefined };
      case "brand":
        return { name: "brand", id, fresh: q.get("fresh") === "1" };
      case "generating":
        return { name: "generating", id };
      case "inventory":
        return { name: "inventory", id };
      case "spots":
        return { name: "spots", id };
      case "specials":
        return { name: "specials", id };
      case "calendar":
        return { name: "calendar", id, week: q.get("week") ? Number(q.get("week")) : undefined };
      default:
        return { name: "create", id };
    }
  }
  return { name: "welcome" };
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case "welcome":
      return "#/";
    case "new":
      return "#/new";
    case "create":
      return `#/d/${r.id}/create`;
    case "generating":
      return `#/d/${r.id}/generating`;
    case "inventory":
      return `#/d/${r.id}/inventory`;
    case "spots":
      return `#/d/${r.id}/spots`;
    case "specials":
      return `#/d/${r.id}/specials`;
    case "calendar":
      return `#/d/${r.id}/calendar${r.week ? `?week=${r.week}` : ""}`;
    case "brand":
      return `#/d/${r.id}/brand${r.fresh ? "?fresh=1" : ""}`;
    case "ads": {
      const q = new URLSearchParams();
      if (r.batch) q.set("batch", r.batch);
      if (r.ad) q.set("ad", r.ad);
      const s = q.toString();
      return `#/d/${r.id}/ads${s ? "?" + s : ""}`;
    }
  }
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route | null>(null);
  useEffect(() => {
    const read = () => setRoute(parseRoute(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = useCallback((r: Route, replace = false) => {
    const h = routeHash(r);
    if (replace) history.replaceState(null, "", h);
    else history.pushState(null, "", h);
    setRoute(r);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);
  return { route, go };
}
