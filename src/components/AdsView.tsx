"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Flame, Play, Search, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { byId } from "@/lib/ad/catalog";
import { captionWithTags } from "@/lib/captions";
import type { Dealer, SavedAd } from "@/lib/workspace";
import { AdCanvas } from "./AdCanvas";
import { AdDetail, captionsFor, copyText } from "./AdDetail";
import { Portal } from "./Portal";
import { Button, Orb, SectionLabel, SplitFlap, ease } from "./ui";

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function AdsView({
  dealer,
  ads,
  batch,
  openId,
  onOpen,
  onUpdate,
  onDelete,
  onCreate,
  onSchedule,
}: {
  onSchedule?: (id: string) => void;
  dealer: Dealer;
  ads: SavedAd[];
  batch?: string;
  openId?: string;
  onOpen: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<SavedAd>) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  const [q, setQ] = useState("");
  const brand = dealer.brand;
  const sorted = useMemo(() => [...ads].sort((a, b) => b.createdAt - a.createdAt), [ads]);
  const filtered = useMemo(() => {
    if (!q.trim()) return sorted;
    const n = q.toLowerCase();
    return sorted.filter((a) => `${byId(a.templateId)?.name} ${a.inputs.vehicleName} ${a.inputs.offer}`.toLowerCase().includes(n));
  }, [sorted, q]);
  const fresh = useMemo(() => (batch ? sorted.filter((a) => a.batchId === batch).sort((a, b) => b.score - a.score) : []), [sorted, batch]);
  const groups = useMemo(() => {
    const m = new Map<string, SavedAd[]>();
    for (const a of filtered) {
      const k = dayLabel(a.createdAt);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [filtered]);
  const avg = ads.length ? Math.round(ads.reduce((s, a) => s + a.score, 0) / ads.length) : 0;
  const downloads = ads.reduce((s, a) => s + (a.downloads ?? 0), 0);
  const open = openId ? ads.find((a) => a.id === openId) : undefined;

  if (!ads.length) {
    return (
      <div className="relative grid min-h-[70vh] place-items-center overflow-hidden px-4 text-center">
        <Orb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" size={520} />
        <div className="relative">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-line bg-white shadow-sm">
            <Sparkles className="h-6 w-6 text-blue" />
          </div>
          <h1 className="mt-6 text-[34px] font-semibold tracking-[-0.045em]">No ads yet for {brand.name}</h1>
          <p className="mx-auto mt-2 max-w-[420px] text-[15px] text-muted">Pick a few formats and generate. Everything you make lands here — ready to re-copy, tweak and download any time.</p>
          <Button size="lg" className="mt-7" onClick={onCreate}>
            <Sparkles className="h-4 w-4" /> Create ads
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-32 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>My ads</SectionLabel>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[48px]">Everything you&apos;ve made.</h1>
          <p className="mt-2 text-[15px] text-muted">Click any ad to replay it, change the car or offer, copy captions or download again.</p>
        </div>
        <div className="flex items-end gap-6">
          {[
            ["Ads", String(ads.length)],
            ["Avg. score", String(avg)],
            ["Downloads", String(downloads)],
          ].map(([l, v]) => (
            <div key={l} className="text-right">
              <SplitFlap value={v} className="text-[26px]" />
              <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {fresh.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue" />
              </span>
              <h2 className="text-[20px] font-semibold tracking-[-0.03em]">Just generated · ranked by virality</h2>
            </div>
            <button onClick={() => onOpen(null)} className="text-[13px] font-medium text-muted hover:text-ink">
              Collapse
            </button>
          </div>
          <div className="mt-5 space-y-6">
            {fresh.map((a, i) => {
              const t = byId(a.templateId)!;
              return <AdDetail key={a.id} t={t} ad={a} brand={brand} rank={i + 1} autoplay={i === 0} onUpdate={(p) => onUpdate(a.id, p)} onDelete={() => onDelete(a.id)} onSchedule={onSchedule && (() => onSchedule(a.id))} />;
            })}
          </div>
        </section>
      )}

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <h2 className="text-[20px] font-semibold tracking-[-0.03em]">All ads</h2>
        <div className="flex h-10 items-center gap-2 rounded-full border border-line-2 bg-white px-4 focus-within:border-blue">
          <Search className="h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by format, car or offer" className="w-56 bg-transparent text-[13.5px] outline-none" />
        </div>
      </div>

      {groups.map(([day, list]) => (
        <section key={day} className="mt-8">
          <div className="mb-4 flex items-baseline gap-2">
            <h3 className="text-[14px] font-semibold">{day}</h3>
            <span className="text-[12.5px] text-muted">{list.length} ad{list.length > 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {list.map((a) => (
              <AdTile key={a.id} ad={a} dealer={dealer} onOpen={() => onOpen(a.id)} />
            ))}
          </div>
        </section>
      ))}
      {!filtered.length && <div className="py-20 text-center text-muted">No ads match that search.</div>}

      <Portal>
        <AnimatePresence>
          {open && byId(open.templateId) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] overflow-y-auto p-3 sm:p-8">
              <div className="fixed inset-0 bg-white/65 backdrop-blur-xl" onClick={() => onOpen(null)} />
              <motion.div
                initial={{ y: 30, scale: 0.97 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 20, opacity: 0 }}
                transition={{ duration: 0.5, ease }}
                className="relative mx-auto max-w-[1180px]"
              >
                <button
                  onClick={() => onOpen(null)}
                  className="absolute -top-1 right-1 z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-white shadow-sm sm:-right-3 sm:-top-3"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                <AdDetail
                  t={byId(open.templateId)!}
                  ad={open}
                  brand={brand}
                  autoplay
                  onSchedule={onSchedule && (() => onSchedule(open.id))}
                  onUpdate={(p) => onUpdate(open.id, p)}
                  onDelete={() => {
                    onDelete(open.id);
                    onOpen(null);
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

function AdTile({ ad, dealer, onOpen }: { ad: SavedAd; dealer: Dealer; onOpen: () => void }) {
  const t = byId(ad.templateId)!;
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const ctx = useMemo(() => ({ brand: dealer.brand, ad: ad.inputs }), [dealer.brand, ad.inputs]);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="group">
      <div
        onClick={onOpen}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        className="relative cursor-pointer overflow-hidden rounded-[20px] bg-bg-2 shadow-[0_0_0_1px_rgba(10,11,13,.07)] transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-[0_30px_50px_-28px_rgba(10,11,13,.45)]"
      >
        <AdCanvas tpl={t} ctx={ctx} playing={hover} width={230} maxDpr={1.5} />
        <span className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm">
          <Flame className="h-3 w-3 text-orange-500" />
          {ad.score}
        </span>
        <span className="pointer-events-none absolute right-2.5 top-2.5 flex gap-1">
          {ad.rating && (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/95 text-[12px] shadow" title={`Rated ${ad.rating}`}>
              {ad.rating === "great" ? "🔥" : ad.rating === "ok" ? "👍" : "👎"}
            </span>
          )}
          {(ad.downloads ?? 0) > 0 && (
            <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white shadow" title="Downloaded">
              <Download className="h-3 w-3" />
            </span>
          )}
        </span>
        <div className="absolute inset-x-2.5 bottom-2.5 flex translate-y-2 gap-1.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const { captions } = captionsFor(t, dealer.brand, ad);
              await copyText(captionWithTags(captions.tiktok));
              setCopied(true);
            }}
            className={clsx(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] font-medium shadow-md transition",
              copied ? "bg-emerald-500 text-white" : "bg-white/95 text-ink"
            )}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Caption"}
          </button>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white shadow-md">
            <Play className="h-3.5 w-3.5 translate-x-px" />
          </span>
        </div>
      </div>
      <div className="mt-2.5 px-0.5">
        <div className="truncate text-[13.5px] font-medium">{t.name}</div>
        <div className="truncate text-[12px] text-muted">
          {ad.inputs.vehicleName || "—"} · {ad.inputs.offer}
        </div>
      </div>
    </motion.div>
  );
}
