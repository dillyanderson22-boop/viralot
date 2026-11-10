"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Clock, Copy, Download, Package, Pause, Play, Trash2, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { resolveTemplate, type Template } from "@/lib/ad/catalog";
import { buildReport, captionWithTags, PLATFORM_META, scoreCaption, type Caption } from "@/lib/captions";
import { SIZES, exportAds, type AdSize } from "@/lib/ad/runtime";
import { zipSync } from "fflate";
import type { AdInputs, Brand, Platform } from "@/lib/types";
import type { Rating, SavedAd } from "@/lib/workspace";
import { CinematicPanel } from "./CinematicPanel";
import { ComplianceCard } from "./ComplianceCard";
import { DealPicker } from "./DealPicker";
import { AdCanvas } from "./AdCanvas";
import { Button, PlatformIcon, ScoreRing, ease } from "./ui";

const PLATFORMS: Platform[] = ["tiktok", "reels", "shorts", "facebook", "x"];

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** Captions for a saved ad: Claude's if we have them, otherwise the built-in engine's. */
export function captionsFor(t: Template, brand: Brand, ad: SavedAd) {
  const report = buildReport(t, brand, ad.inputs);
  const out = { ...report.captions };
  for (const pl of PLATFORMS) {
    const c = ad.aiCaptions?.[pl];
    if (!c) continue;
    const sc = scoreCaption(c.text, c.hashtags, pl, brand, ad.inputs);
    out[pl] = { platform: pl, text: c.text, hashtags: c.hashtags, score: sc.score, notes: ["Written by Claude", ...sc.notes], bestTime: PLATFORM_META[pl].time };
  }
  return { report, captions: out as Record<Platform, Caption> };
}

// Once the server says Claude isn't configured, stop asking for this session.
let claudeUnavailable = false;

/**
 * One saved ad, fully interactive: player, score, per-ad car/offer, captions
 * per platform with one-click copy, and MP4 download. Every change is saved.
 */
export function AdDetail({
  t,
  ad,
  brand,
  onUpdate,
  onDelete,
  onSchedule,
  rank,
  autoplay = false,
}: {
  t: Template;
  ad: SavedAd;
  brand: Brand;
  onUpdate: (patch: Partial<SavedAd>) => void;
  onDelete?: () => void;
  /** Puts this ad on the next free day of the posting calendar. */
  onSchedule?: () => void;
  rank?: number;
  autoplay?: boolean;
}) {
  const ctx = useMemo(() => ({ brand, ad: ad.inputs }), [brand, ad.inputs]);
  const { report: r, captions } = useMemo(() => captionsFor(t, brand, ad), [t, brand, ad]);
  const [playing, setPlaying] = useState(autoplay);
  const [sound, setSound] = useState(false);
  const [time, setTime] = useState({ t: 0, d: resolveTemplate(t, brand.makes).dur });
  const [seek, setSeek] = useState<number | null>(null);
  const [p, setP] = useState<Platform>("tiktok");
  const [copied, setCopied] = useState<string | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const cap = captions[p];
  const captionTexts = useMemo(() => Object.values(captions).map((c) => `${c.text} ${c.hashtags.map((h) => "#" + h).join(" ")}`), [captions]);

  // Ask Claude once per ad (and again only if its car/offer changes). The result is saved.
  useEffect(() => {
    if (ad.aiCaptions || claudeUnavailable) return;
    let alive = true;
    fetch("/api/captions", {
      method: "POST",
      body: JSON.stringify({
        template: { name: t.name, category: t.category, why: t.why, hook: t.params.hook },
        brand: { name: brand.name, city: brand.city, state: brand.state, makes: brand.makes },
        offer: ad.inputs.offer,
        cta: ad.inputs.cta,
        vehicle: ad.inputs.vehicleName,
        description: ad.inputs.description,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { captions?: SavedAd["aiCaptions"]; available?: boolean } | null) => {
        if (d?.available === false) claudeUnavailable = true;
        if (alive && d?.captions) onUpdate({ aiCaptions: d.captions });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.id, ad.inputs.offer, ad.inputs.vehicleImage, !!ad.aiCaptions]);

  const copy = async (text: string, key: string) => {
    await copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  };

  const [exportLabel, setExportLabel] = useState("");
  const save = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const download = async (all = false) => {
    setExporting(0);
    const sizes: AdSize[] = all ? ["9x16", "4x5", "1x1", "16x9"] : ["9x16"];
    setExportLabel(all ? "All 4 sizes" : "Rendering");
    try {
      const outs = await exportAds(t, ctx, sizes, (k) => setExporting(k));
      const base = `${slugify(brand.name)}-${t.id}`;
      if (!all) save(outs[0].blob, `${base}.${outs[0].ext}`);
      else {
        setExportLabel("Zipping");
        const files: Record<string, Uint8Array> = {};
        for (const o of outs) files[`${base}-${SIZES[o.size].label.replace(":", "x")}.${o.ext}`] = new Uint8Array(await o.blob.arrayBuffer());
        // videos are already compressed — store, don't deflate
        save(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), `${base}-all-sizes.zip`);
      }
      onUpdate({ downloads: (ad.downloads ?? 0) + 1 });
      fetch("/api/track", { method: "POST", body: JSON.stringify({ type: "export", label: `${brand.name} · ${t.name}${all ? " (all sizes)" : ""}` }) }).catch(() => {});
    } finally {
      setExporting(null);
    }
  };

  const setInputs = (patch: Partial<AdInputs>) => {
    const inputs = { ...ad.inputs, ...patch };
    onUpdate({ inputs, aiCaptions: undefined, score: buildReport(t, brand, inputs).score });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
      className="grid gap-6 rounded-[32px] border border-line bg-white p-4 shadow-[0_30px_80px_-50px_rgba(10,11,13,.35)] sm:p-6 lg:grid-cols-[300px_1fr]"
    >
      {/* player */}
      <div>
        <div className="relative overflow-hidden rounded-[24px] bg-bg-2">
          <AdCanvas
            tpl={t}
            ctx={ctx}
            playing={playing}
            sound={sound}
            width={300}
            lazy={false}
            seek={seek}
            stillAt={0.6}
            onTime={(tt, d) => setTime({ t: tt, d })}
          />
          {rank !== undefined && (
            <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 font-mono text-[11px] font-medium backdrop-blur">#{rank}</div>
          )}
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-black/45 p-1.5 text-white backdrop-blur-md">
            <button onClick={() => setPlaying(!playing)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
            </button>
            <input
              type="range"
              min={0}
              max={time.d}
              step={0.01}
              value={time.t}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSeek(v);
                setTime((x) => ({ ...x, t: v }));
              }}
              className="h-1 flex-1 cursor-pointer accent-white"
            />
            <span className="w-9 text-right font-mono text-[11px] tabular-nums">{time.t.toFixed(1)}</span>
            <button onClick={() => setSound(!sound)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15" aria-label="Sound">
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button className="mt-3 w-full" size="lg" onClick={() => download(false)} disabled={exporting !== null}>
          {exporting !== null ? (
            <>
              <span className="relative h-4 w-4">
                <svg viewBox="0 0 20 20" className="h-4 w-4 -rotate-90">
                  <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,.25)" strokeWidth="2.5" fill="none" />
                  <circle cx="10" cy="10" r="8" stroke="#fff" strokeWidth="2.5" fill="none" strokeDasharray={50.3} strokeDashoffset={50.3 * (1 - exporting)} strokeLinecap="round" />
                </svg>
              </span>
              {exportLabel} {Math.round(exporting * 100)}%
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Download video
            </>
          )}
        </Button>
        <Button className="mt-2 w-full" variant="soft" onClick={() => download(true)} disabled={exporting !== null}>
          <Package className="h-4 w-4" /> All 4 sizes (.zip)
        </Button>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">
          {exporting !== null ? "Keep this tab open while it records" : "9:16 · 4:5 · 1:1 · 16:9 — with sound"}
        </p>
      </div>

      {/* insights */}
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
              {t.category}
              <span className="text-line-2">·</span>
              {new Date(ad.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {(ad.downloads ?? 0) > 0 && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Downloaded{ad.downloads! > 1 ? ` ×${ad.downloads}` : ""}</span>
              )}
            </div>
            <h3 className="mt-1 text-[28px] font-semibold tracking-[-0.04em]">{t.name}</h3>
            <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-muted">{t.why}</p>
          </div>
          <div className="flex items-start gap-2">
            <ScoreRing score={r.score} delay={0.2} />
            {onDelete && (
              <button
                onClick={onDelete}
                className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-red-50 hover:text-red-600"
                aria-label="Delete ad"
                title="Delete ad"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-5">
          <DealPicker brand={brand} value={ad.inputs} onChange={setInputs} compact />
        </div>
        {t.engine === "cinematic" && (
          <div className="mt-4">
            <CinematicPanel t={t} ad={ad} onUpdate={onUpdate} />
          </div>
        )}
        <div className="mt-4">
          <ComplianceCard ad={ad} brand={brand} captions={captionTexts} />
        </div>

        {/* results feedback + schedule */}
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-line p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">How did it do?</div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["great", "🔥 Great"],
                  ["ok", "👍 OK"],
                  ["flop", "👎 Flop"],
                ] as [Rating, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => onUpdate({ rating: ad.rating === v ? undefined : v })}
                  className={clsx(
                    "h-8 rounded-full border px-3 text-[12.5px] font-medium transition",
                    ad.rating === v ? "border-ink bg-ink text-white" : "border-line-2 text-ink-2 hover:border-ink/30"
                  )}
                >
                  {label}
                </button>
              ))}
              <input
                type="number"
                min={0}
                placeholder="Views"
                value={ad.views ?? ""}
                onChange={(e) => onUpdate({ views: e.target.value ? Number(e.target.value) : undefined })}
                className="h-8 w-24 rounded-full border border-line-2 px-3 text-[12.5px] outline-none focus:border-blue"
              />
            </div>
            <div className="mt-2 text-[11.5px] text-muted">Your ratings re-rank the template library for this dealership.</div>
          </div>
          <div className="rounded-2xl border border-line p-3.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Posting plan</div>
              {onSchedule && !Object.keys(ad.schedule ?? {}).length && (
                <button onClick={onSchedule} className="flex items-center gap-1 text-[12px] font-medium text-blue hover:underline">
                  <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
                </button>
              )}
            </div>
            {Object.keys(ad.schedule ?? {}).length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(Object.entries(ad.schedule ?? {}) as [Platform, { at: number; posted?: boolean }][]).map(([pl, slot]) => (
                  <button
                    key={pl}
                    onClick={() => onUpdate({ schedule: { ...ad.schedule, [pl]: { ...slot, posted: !slot.posted } } })}
                    title={slot.posted ? "Posted — click to undo" : "Click when you've posted it"}
                    className={clsx(
                      "flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition",
                      slot.posted ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line-2 text-ink-2 hover:border-ink/30"
                    )}
                  >
                    {slot.posted ? <Check className="h-3.5 w-3.5" /> : <PlatformIcon p={pl} className="h-3.5 w-3.5" />}
                    {new Date(slot.at).toLocaleDateString("en-US", { weekday: "short" })} {new Date(slot.at).toLocaleTimeString("en-US", { hour: "numeric" })}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2.5 text-[12.5px] text-muted">Not scheduled yet.</div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
          {r.breakdown.map((b, i) => (
            <div key={b.label}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-muted">{b.label}</span>
                <span className="font-mono tabular-nums">{b.value}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/5">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${b.value}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, ease, delay: 0.3 + i * 0.08 }}
                  className="h-full rounded-full bg-gradient-to-r from-blue to-cyan"
                />
              </div>
            </div>
          ))}
        </div>

        {/* captions */}
        <div className="mt-8 rounded-[24px] border border-line bg-bg-2/60 p-2">
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {PLATFORMS.map((pl) => (
              <button
                key={pl}
                onClick={() => setP(pl)}
                className={clsx(
                  "relative flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
                  p === pl ? "text-ink" : "text-muted hover:text-ink"
                )}
              >
                {p === pl && (
                  <motion.span
                    layoutId={`pl-${ad.id}`}
                    className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(10,11,13,.08),0_0_0_1px_rgba(10,11,13,.06)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <PlatformIcon p={pl} className="relative h-3.5 w-3.5" />
                <span className="relative">{PLATFORM_META[pl].label}</span>
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={p}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease }}
              className="p-3 sm:p-4"
            >
              <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink">{cap.text}</div>
              <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[14px] font-medium text-blue">
                {cap.hashtags.map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={() => copy(captionWithTags(cap), "cap")}>
                  {copied === "cap" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === "cap" ? "Copied" : "Copy caption"}
                </Button>
                <Button size="sm" variant="soft" onClick={() => copy(cap.hashtags.join(" "), "tags")}>
                  {copied === "tags" ? "Copied" : "Copy hashtags"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(PLATFORMS.map((pl) => `— ${PLATFORM_META[pl].label} —\n${captionWithTags(captions[pl])}`).join("\n\n"), "all")}>
                  {copied === "all" ? "Copied all" : "Copy all platforms"}
                </Button>
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <Clock className="h-3.5 w-3.5" /> Best time: <span className="text-ink-2">{cap.bestTime}</span>
                </span>
                <span className="ml-auto rounded-full bg-white px-2.5 py-1 font-mono text-[11px] text-ink-2 shadow-[0_0_0_1px_rgba(10,11,13,.06)]">
                  caption score {cap.score}
                </span>
              </div>
              {cap.notes.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {cap.notes.map((n) => (
                    <span key={n} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11.5px] text-ink-2 shadow-[0_0_0_1px_rgba(10,11,13,.06)]">
                      <Check className="h-3 w-3 text-blue" /> {n}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
