"use client";

import { useEffect, useState } from "react";
import type { BrandRules } from "./guidelines";

const cache = new Map<string, Promise<BrandRules[]>>();

/** The admin's brand guideline sections for these makes (cached per set of makes). */
export function fetchBrandRules(makes: string[]): Promise<BrandRules[]> {
  const key = makes.map((m) => m.toLowerCase()).sort().join(",");
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/guidelines?makes=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { rules: [] }))
      .then((d: { rules?: BrandRules[] }) => d.rules ?? [])
      .catch(() => []);
    cache.set(key, p);
  }
  return p;
}

export function useBrandRules(makes: string[]) {
  const [rules, setRules] = useState<BrandRules[] | null>(null);
  const key = makes.join(",");
  useEffect(() => {
    let alive = true;
    fetchBrandRules(makes).then((r) => alive && setRules(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rules;
}
