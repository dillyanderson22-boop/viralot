import { byId } from "./ad/catalog";
import type { Platform } from "./types";
import type { SavedAd } from "./workspace";

/** Local posting hour per platform — when each feed is busiest for local car shoppers. */
export const BEST_HOUR: Record<Platform, number> = { facebook: 10, reels: 12, shorts: 15, tiktok: 19, x: 9 };
export const PLAN_PLATFORMS: Platform[] = ["tiktok", "reels", "shorts", "facebook"];

export function startOfWeek(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday first
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Spreads unscheduled ads one per day, best score first, each going to every
 * platform it's built for at that platform's best hour. Days that already
 * have something scheduled are skipped so the feed never doubles up.
 */
export function autoPlan(ads: SavedAd[], from = Date.now()): Map<string, SavedAd["schedule"]> {
  const busy = new Set<string>();
  for (const a of ads) for (const s of Object.values(a.schedule ?? {})) if (s) busy.add(dayKey(s.at));
  const todo = ads.filter((a) => !a.schedule || !Object.keys(a.schedule).length).sort((a, b) => b.score - a.score);
  const out = new Map<string, SavedAd["schedule"]>();
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  for (const a of todo) {
    while (busy.has(dayKey(day.getTime()))) day.setDate(day.getDate() + 1);
    const t = byId(a.templateId);
    const plats = PLAN_PLATFORMS.filter((p) => !t || t.platforms.includes(p));
    // never schedule into the past: if any of today's slots are gone, the whole ad starts on the next free day
    const passed = plats.some((p) => {
      const at = new Date(day);
      at.setHours(BEST_HOUR[p], 0, 0, 0);
      return at.getTime() <= from;
    });
    if (passed) {
      day.setDate(day.getDate() + 1);
      while (busy.has(dayKey(day.getTime()))) day.setDate(day.getDate() + 1);
    }
    const sched: NonNullable<SavedAd["schedule"]> = {};
    for (const p of plats) {
      const at = new Date(day);
      at.setHours(BEST_HOUR[p], 0, 0, 0);
      sched[p] = { at: at.getTime() };
    }
    out.set(a.id, sched);
    busy.add(dayKey(day.getTime()));
    day.setDate(day.getDate() + 1);
  }
  return out;
}

const icsDate = (ts: number) => new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

/** iCalendar file with a 15-minute reminder per post — imports into iPhone, Google and Outlook calendars. */
export function toICS(items: { ad: SavedAd; platform: Platform; at: number; title: string; caption: string }[], dealer: string) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Viralot//Posting plan//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(dealer)} posting plan`];
  for (const it of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.ad.id}-${it.platform}@viralot`,
      `DTSTAMP:${icsDate(Date.now())}`,
      `DTSTART:${icsDate(it.at)}`,
      `DTEND:${icsDate(it.at + 15 * 60_000)}`,
      `SUMMARY:${esc(`Post on ${it.platform === "reels" ? "Instagram Reels" : it.platform === "shorts" ? "YouTube Shorts" : it.platform[0].toUpperCase() + it.platform.slice(1)}: ${it.title}`)}`,
      `DESCRIPTION:${esc(it.caption)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Time to post",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
