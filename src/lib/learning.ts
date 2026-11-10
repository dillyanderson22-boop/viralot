import { byId } from "./ad/catalog";
import type { SavedAd } from "./workspace";

export type FormatStats = { great: number; ok: number; flop: number; boost: number };

/**
 * What this dealer's own results say about each format. A "great" counts for
 * more than an "ok", a "flop" pulls a format down, and categories that keep
 * working get a smaller lift so similar formats benefit too.
 */
export function learn(ads: SavedAd[]) {
  const byFormat = new Map<string, FormatStats>();
  const byCategory = new Map<string, number>();
  for (const a of ads) {
    if (!a.rating) continue;
    const t = byId(a.templateId);
    if (!t) continue;
    const s = byFormat.get(t.format) ?? { great: 0, ok: 0, flop: 0, boost: 0 };
    s[a.rating]++;
    byFormat.set(t.format, s);
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + (a.rating === "great" ? 2 : a.rating === "flop" ? -2 : 0.5));
  }
  for (const s of byFormat.values()) s.boost = Math.max(-18, Math.min(15, s.great * 6 + s.ok * 1 - s.flop * 7));
  const rated = ads.filter((a) => a.rating).length;
  return {
    rated,
    stats: (format: string) => byFormat.get(format),
    /** Score adjustment for a format in this dealer's library. */
    boost: (format: string, category: string) =>
      (byFormat.get(format)?.boost ?? 0) + Math.max(-4, Math.min(4, byCategory.get(category) ?? 0)),
  };
}
