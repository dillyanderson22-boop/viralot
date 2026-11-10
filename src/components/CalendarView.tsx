"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, Wand2, X } from "lucide-react";
import clsx from "clsx";
import { byId } from "@/lib/ad/catalog";
import { captionWithTags, PLATFORM_META } from "@/lib/captions";
import { autoPlan, dayKey, startOfWeek, toICS } from "@/lib/calendar";
import type { Platform } from "@/lib/types";
import type { Dealer, SavedAd } from "@/lib/workspace";
import { AdCanvas } from "./AdCanvas";
import { captionsFor, copyText } from "./AdDetail";
import { Button, PlatformIcon, SectionLabel, ease } from "./ui";

type Entry = { ad: SavedAd; platform: Platform; at: number; posted: boolean };

export function CalendarView({
  dealer,
  ads,
  week,
  onWeek,
  onUpdate,
  onOpenAd,
  onCreate,
}: {
  dealer: Dealer;
  ads: SavedAd[];
  week?: number;
  onWeek: (ts: number) => void;
  onUpdate: (id: string, patch: Partial<SavedAd>) => void;
  onOpenAd: (id: string) => void;
  onCreate: () => void;
}) {
  // captured once per mount: render must not read the clock
  const [now] = useState(() => Date.now());
  const thisWeek = startOfWeek(now);
  const start = week ?? thisWeek;
  const days = Array.from({ length: 7 }, (_, i) => start + i * 864e5);
  const [copied, setCopied] = useState<string | null>(null);

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const ad of ads) for (const [p, s] of Object.entries(ad.schedule ?? {})) if (s) out.push({ ad, platform: p as Platform, at: s.at, posted: !!s.posted });
    return out.sort((a, b) => a.at - b.at);
  }, [ads]);
  const inWeek = entries.filter((e) => e.at >= start && e.at < start + 7 * 864e5);
  const unscheduled = ads.filter((a) => !Object.keys(a.schedule ?? {}).length);
  const postedCount = inWeek.filter((e) => e.posted).length;

  const plan = () => {
    const m = autoPlan(ads, Math.max(Date.now(), start));
    for (const [id, sched] of m) onUpdate(id, { schedule: sched });
  };
  const exportIcs = () => {
    const items = inWeek.map((e) => {
      const t = byId(e.ad.templateId);
      return { ad: e.ad, platform: e.platform, at: e.at, title: t?.name ?? "Ad", caption: t ? captionWithTags(captionsFor(t, dealer.brand, e.ad).captions[e.platform]) : "" };
    });
    const blob = new Blob([toICS(items, dealer.brand.name)], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${dealer.brand.name.replace(/\W+/g, "-").toLowerCase()}-posting-plan.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const setSlot = (e: Entry, patch: Partial<{ posted: boolean }> | null) => {
    const sched = { ...(e.ad.schedule ?? {}) };
    if (patch === null) delete sched[e.platform];
    else sched[e.platform] = { at: e.at, ...sched[e.platform], ...patch };
    onUpdate(e.ad.id, { schedule: sched });
  };

  const today = dayKey(now);
  const label = `${new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(start + 6 * 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-32 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Posting calendar</SectionLabel>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[48px]">What to post, and when.</h1>
          <p className="mt-2 max-w-[560px] text-[15px] text-muted">One ad a day, each at its platform&apos;s busiest hour. Copy the caption, post it, tick it off.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unscheduled.length > 0 && (
            <Button onClick={plan}>
              <Wand2 className="h-4 w-4" /> Auto-plan {unscheduled.length} ad{unscheduled.length > 1 ? "s" : ""}
            </Button>
          )}
          {inWeek.length > 0 && (
            <Button variant="soft" onClick={exportIcs}>
              <Download className="h-4 w-4" /> Add week to my calendar
            </Button>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => onWeek(start - 7 * 864e5)} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-ink/20" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => onWeek(start + 7 * 864e5)} className="grid h-9 w-9 place-items-center rounded-full border border-line hover:border-ink/20" aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-[15px] font-semibold">{label}</span>
          {start !== thisWeek && (
            <button onClick={() => onWeek(thisWeek)} className="ml-2 text-[12.5px] font-medium text-blue hover:underline">
              This week
            </button>
          )}
        </div>
        {inWeek.length > 0 && (
          <div className="flex items-center gap-3 text-[12.5px] text-muted">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ink/5">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(postedCount / inWeek.length) * 100}%` }} />
            </div>
            {postedCount}/{inWeek.length} posted
          </div>
        )}
      </div>

      {!ads.length ? (
        <div className="mt-10 grid place-items-center rounded-[28px] border border-dashed border-line-2 bg-bg-2/40 px-6 py-20 text-center">
          <CalendarDays className="h-9 w-9 text-muted" />
          <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em]">Nothing to schedule yet</h2>
          <p className="mt-1 text-[14px] text-muted">Make a few ads and they&apos;ll be planned across the week automatically.</p>
          <Button className="mt-5" onClick={onCreate}>
            Create ads
          </Button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = inWeek.filter((e) => dayKey(e.at) === dayKey(d));
            const isToday = dayKey(d) === today;
            return (
              <div key={d} className={clsx("min-h-[180px] rounded-[20px] border p-2.5", isToday ? "border-blue/40 bg-blue/[.03]" : "border-line bg-white")}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className={clsx("text-[12px] font-semibold uppercase tracking-[0.1em]", isToday ? "text-blue" : "text-muted")}>
                    {new Date(d).toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span className={clsx("text-[18px] font-semibold tabular-nums", isToday ? "text-blue" : "text-ink")}>{new Date(d).getDate()}</span>
                </div>
                <div className="space-y-2">
                  {list.map((e) => {
                    const t = byId(e.ad.templateId);
                    if (!t) return null;
                    const key = e.ad.id + e.platform;
                    return (
                      <motion.div
                        key={key}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease }}
                        className={clsx("group rounded-2xl border p-2 transition", e.posted ? "border-emerald-200 bg-emerald-50/60" : "border-line bg-white hover:border-ink/15")}
                      >
                        <div className="flex gap-2">
                          <button onClick={() => onOpenAd(e.ad.id)} className="h-[52px] w-[30px] shrink-0 overflow-hidden rounded-md bg-bg-2" aria-label="Open ad">
                            <Thumb t={t} dealer={dealer} ad={e.ad} />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1 text-[11px] text-muted">
                              <PlatformIcon p={e.platform} className="h-3 w-3" />
                              {new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: e.at % 3600000 ? "2-digit" : undefined })}
                            </div>
                            <div className="truncate text-[12px] font-medium leading-tight">{t.name}</div>
                            <div className="truncate text-[10.5px] text-muted">{PLATFORM_META[e.platform].label}</div>
                          </div>
                        </div>
                        <div className="mt-1.5 flex gap-1">
                          <button
                            onClick={async () => {
                              await copyText(captionWithTags(captionsFor(t, dealer.brand, e.ad).captions[e.platform]));
                              setCopied(key);
                              setTimeout(() => setCopied(null), 1400);
                            }}
                            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-full bg-bg-2 text-[11px] font-medium hover:bg-ink/10"
                          >
                            {copied === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copied === key ? "Copied" : "Caption"}
                          </button>
                          <button
                            onClick={() => setSlot(e, { posted: !e.posted })}
                            className={clsx(
                              "flex h-7 flex-1 items-center justify-center gap-1 rounded-full text-[11px] font-medium transition",
                              e.posted ? "bg-emerald-500 text-white" : "border border-line-2 hover:border-emerald-400 hover:text-emerald-700"
                            )}
                          >
                            <Check className="h-3 w-3" /> {e.posted ? "Posted" : "Mark"}
                          </button>
                          <button onClick={() => setSlot(e, null)} className="grid h-7 w-7 place-items-center rounded-full text-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" aria-label="Remove from calendar">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                  {!list.length && <div className="px-1 pt-6 text-center text-[11.5px] text-muted/70">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {ads.length > 0 && !entries.length && (
        <p className="mt-4 text-center text-[13px] text-muted">Press &ldquo;Auto-plan&rdquo; to spread your ads across the coming days.</p>
      )}
    </div>
  );
}

function Thumb({ t, dealer, ad }: { t: NonNullable<ReturnType<typeof byId>>; dealer: Dealer; ad: SavedAd }) {
  const ctx = useMemo(() => ({ brand: dealer.brand, ad: ad.inputs }), [dealer.brand, ad.inputs]);
  return <AdCanvas tpl={t} ctx={ctx} playing={false} width={30} maxDpr={2} />;
}
