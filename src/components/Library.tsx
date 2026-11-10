"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "./Portal";
import { Check, Eye, Flame, Search, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import clsx from "clsx";
import { CATEGORIES, FORMATS, byId, eventVariant, variantId, type Format, type Look, type Template } from "@/lib/ad/catalog";
import { eventById, upcomingEvents } from "@/lib/events";
import { learn } from "@/lib/learning";
import type { SavedAd } from "@/lib/workspace";
import type { AdInputs, Platform } from "@/lib/types";
import { DealPicker } from "./DealPicker";
import { CarPicker } from "./CarPicker";
import { CustomAdCard } from "./CustomAdCard";
import type { InventoryCar } from "@/lib/workspace";
import type { AdContext } from "@/lib/ad/runtime";
import { AdCanvas, useSoundBlocked } from "./AdCanvas";
import { CUSTOM_ID, OFFER_STYLE_LABEL, TIERS, cinematicById, type TierId } from "@/lib/cinematic";
import { Button, Chip, PlatformIcon, SectionLabel, SplitFlap, ease } from "./ui";

const MAX = 12;
const PAGE = 30;
type Sort = "viral" | "az" | "short";

export function Library({
  ctx,
  selected,
  setSelected,
  onGenerate,
  onEditBrand,
  setInputs,
  ads = [],
  event = null,
  setEvent,
  inventory,
  onImport,
  film,
  setFilm,
  onCustom,
}: {
  ctx: AdContext;
  selected: string[];
  setSelected: (s: string[]) => void;
  onGenerate: () => void;
  onEditBrand: () => void;
  setInputs: (i: AdInputs) => void;
  ads?: SavedAd[];
  event?: string | null;
  setEvent?: (id: string | null) => void;
  inventory?: InventoryCar[];
  onImport?: () => void;
  /** Film the car with AI for every video on Generate. */
  film?: { on: boolean; tier: TierId };
  setFilm?: (f: { on: boolean; tier: TierId }) => void;
  /** "Create your own": film the picked car from the dealer's prompt and reference images. */
  onCustom?: (o: { prompt: string; refs: Blob[]; thumbs: string[]; seconds: number; tier: TierId }) => Promise<void>;
}) {
  const [hf, setHf] = useState<{ available: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/cinematic", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setHf(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [manual, setManual] = useState(false);
  const lessons = useMemo(() => learn(ads), [ads]);
  const scoreOf = (f: Format) => Math.max(1, Math.min(99, f.score + lessons.boost(f.key, f.category)));
  const activeEvent = eventById(event);
  const upcoming = useMemo(() => upcomingEvents(), []);
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("viral");
  const [platform, setPlatform] = useState<Platform | null>(null);
  // page size resets whenever the filters change
  const sig = `${cat}|${q}|${sort}|${platform}`;
  const [paging, setPaging] = useState({ sig, n: PAGE });
  const limit = paging.sig === sig ? paging.n : PAGE;
  const [preview, setPreview] = useState<Format | null>(null);
  // the hook/look shown for each format when it isn't selected yet
  const [picks, setPicks] = useState<Record<string, string>>({});
  /** The variant a format card shows: its selected one, else the last pick, else the first hook. */
  const current = (f: Format): Template => {
    const sel = selected.find((id) => byId(id)?.format === f.key);
    const ev = eventVariant(f, event);
    return byId(sel ?? picks[f.key] ?? ev?.id ?? f.hooks[0].id) ?? f.hooks[0];
  };
  const [hover, setHover] = useState<string | null>(null);
  // previews play with their soundtrack on hover; the choice is remembered per browser
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem("viralot.previewSound") !== "off";
    } catch {
      return true;
    }
  });
  const soundBlocked = useSoundBlocked();
  const toggleSound = () => {
    setSoundOn((on) => {
      try {
        localStorage.setItem("viralot.previewSound", on ? "off" : "on");
      } catch {}
      return !on;
    });
  };
  const sentinel = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    let l = FORMATS.filter((f) => f.category !== "Pro spot" && f.hooks[0]?.id !== CUSTOM_ID);
    if (cat === "Event picks") l = l.filter((f) => eventVariant(f, event));
    else if (cat !== "All") l = l.filter((f) => f.category === cat);
    if (platform) l = l.filter((f) => f.hooks[0].platforms.includes(platform));
    if (q.trim()) {
      const n = q.toLowerCase();
      l = l.filter((f) => f.hooks.some((t) => (t.name + " " + t.category + " " + t.tags.join(" ") + " " + (t.params.hook ?? "")).toLowerCase().includes(n)));
    }
    if (sort === "viral") l.sort((a, b) => scoreOf(b) - scoreOf(a) || Number(!!b.signature) - Number(!!a.signature));
    if (sort === "az") l.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "short") l.sort((a, b) => a.hooks[0].dur - b.hooks[0].dur);
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, q, sort, platform, event, lessons]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setPaging((pg) => ({ sig, n: (pg.sig === sig ? pg.n : PAGE) + PAGE })),
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [list, sig]);

  /** One ad per format: selecting a different hook of the same format swaps it in. */
  const toggleFormat = (f: Format) => {
    const sel = selected.find((id) => byId(id)?.format === f.key);
    if (sel) setSelected(selected.filter((x) => x !== sel));
    else if (selected.length < MAX) setSelected([...selected, current(f).id]);
  };
  const choose = (f: Format, id: string, select = false) => {
    setPicks((p) => ({ ...p, [f.key]: id }));
    const sel = selected.find((x) => byId(x)?.format === f.key);
    if (sel) setSelected(selected.map((x) => (x === sel ? id : x)));
    else if (select && selected.length < MAX) setSelected([...selected, id]);
  };

  const cats = [...(activeEvent ? ["Event picks"] : []), "All", ...CATEGORIES];

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-40 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Create ads</SectionLabel>
          <h1 className="mt-4 text-[38px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[52px]">
            <SplitFlap value={String(FORMATS.filter((f) => f.category !== "Pro spot" && f.hooks[0]?.id !== CUSTOM_ID).length)} className="mr-3 align-[0.06em] text-[0.8em]" tile="h-[1.25em] w-[0.82em]" />
            cinematic templates.
          </h1>
          <p className="mt-3 max-w-[560px] text-[15px] text-muted">
            Previews show a sample car. Each ad you make is rendered with {ctx.brand.name}&apos;s own car and closes on your real offer. <span className="hidden sm:inline">Hover to play, click</span><span className="sm:hidden">Tap</span> to select up to {MAX}.{" "}
            <button onClick={onEditBrand} className="font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-blue">
              Edit brand kit
            </button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-11 items-center gap-2 rounded-full border border-line-2 bg-white px-4 focus-within:border-blue focus-within:shadow-[0_0_0_4px_rgba(47,107,255,.12)]">
            <Search className="h-4 w-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search formats" className="w-40 bg-transparent text-[14px] outline-none sm:w-56" />
          </div>
        </div>
      </div>

      {/* seasonal events */}
      {setEvent && upcoming.length > 0 && (
        <div className="mt-8">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Coming up</div>
            {activeEvent && (
              <button onClick={() => setEvent(null)} className="text-[12.5px] font-medium text-muted hover:text-ink">
                Turn off {activeEvent.name}
              </button>
            )}
          </div>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {upcoming.map(({ ev, start, live, daysAway }) => {
              const on = event === ev.id;
              return (
                <motion.button
                  key={ev.id}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (on) return setEvent(null);
                    setEvent(ev.id);
                    setInputs({ ...ctx.ad, offer: ev.offers[0] });
                    setCat("Event picks");
                  }}
                  className={clsx(
                    "relative flex min-w-[230px] shrink-0 items-center gap-3 rounded-2xl border p-3 text-left transition",
                    on ? "border-blue bg-blue/[.04] shadow-[0_0_0_3px_rgba(47,107,255,.12)]" : "border-line bg-white hover:border-ink/15"
                  )}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-bg-2 text-[22px]">{ev.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{ev.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {live ? (
                        <span className="font-medium text-emerald-600">● Live now</span>
                      ) : (
                        `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · in ${daysAway} day${daysAway === 1 ? "" : "s"}`
                      )}
                      {" · "}
                      {ev.blurb}
                    </span>
                  </span>
                  {on && <Check className="h-4 w-4 shrink-0 text-blue" />}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-[24px] border border-line bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">1 · Pick the car and its offers</span>
          <button onClick={() => setManual((m) => !m)} className="text-[12px] font-medium text-muted hover:text-ink">
            {manual ? "Hide" : "Offer without a specific car"}
          </button>
        </div>
        <CarPicker brand={ctx.brand} inventory={inventory} value={ctx.ad} onChange={setInputs} onImport={onImport} />
        {manual && (
          <div className="mt-3 border-t border-line pt-3">
            <DealPicker
              brand={ctx.brand}
              value={ctx.ad}
              onChange={(patch) => setInputs({ ...ctx.ad, ...patch, carId: undefined, vin: undefined, stock: undefined, description: undefined })}
              extraOffers={activeEvent?.offers}
              extraLabel={activeEvent ? activeEvent.emoji + " event" : undefined}
            />
          </div>
        )}
      </div>

      {onCustom && (
        <div className="mt-3">
          <CustomAdCard inputs={ctx.ad} carPicked={!!(ctx.ad.carId || ctx.ad.specialId)} available={hf ? hf.available : null} onMake={onCustom} />
        </div>
      )}

      {(() => {
        const idea = ctx.brand.ideas?.find((i) => i.offer.trim().toLowerCase() === ctx.ad.offer.trim().toLowerCase());
        const picks = (idea?.viralFormats ?? []).map((k) => FORMATS.find((f) => f.key === k)).filter((f): f is Format => !!f);
        if (!picks.length) return null;
        return (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-blue/[.05] px-4 py-2.5 text-[13px]">
            <Sparkles className="h-4 w-4 text-blue" />
            <span className="text-ink-2">Claude&apos;s picks for this offer:</span>
            {picks.map((f) => {
              const on = selected.some((id) => byId(id)?.format === f.key);
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFormat(f)}
                  className={clsx("rounded-full px-3 py-1 text-[12.5px] font-medium transition", on ? "bg-ink text-white" : "border border-line-2 bg-white text-ink hover:border-ink/30")}
                >
                  {on && <Check className="mr-1 inline h-3 w-3 -translate-y-px" />}
                  {f.name}
                </button>
              );
            })}
            {idea?.hook && <span className="text-muted">· hook idea: “{idea.hook}”</span>}
          </div>
        );
      })()}

      {lessons.rated > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-50/70 px-4 py-2.5 text-[13px] text-emerald-900">
          <Sparkles className="h-4 w-4" />
          Ranked for {ctx.brand.name}: {lessons.rated} rated ad{lessons.rated === 1 ? "" : "s"} are shaping this order. Formats that worked for you rise to the top.
        </div>
      )}

      <div className="sticky top-[98px] z-30 -mx-4 mt-6 border-b border-line lg:top-0 bg-white/80 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto pr-8 [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
            {cats.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)} layoutId="cat">
                {c}
              </Chip>
            ))}
          </div>
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            {(["tiktok", "reels", "shorts", "facebook", "x"] as Platform[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(platform === p ? null : p)}
                className={clsx(
                  "grid h-9 w-9 place-items-center rounded-full transition",
                  platform === p ? "bg-ink text-white" : "text-muted hover:bg-bg-2 hover:text-ink"
                )}
                title={p}
              >
                <PlatformIcon p={p} />
              </button>
            ))}
            <div className="mx-2 h-5 w-px bg-line-2" />
            <button
              onClick={toggleSound}
              className="grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-bg-2 hover:text-ink"
              title={soundOn ? "Mute previews" : "Play previews with sound"}
              aria-label={soundOn ? "Mute previews" : "Play previews with sound"}
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-9 rounded-full bg-transparent px-2 text-[13px] font-medium text-ink-2 outline-none"
            >
              <option value="viral">Most viral</option>
              <option value="short">Shortest</option>
              <option value="az">A–Z</option>
            </select>
          </div>
        </div>
      </div>

      <motion.div layout className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        <AnimatePresence mode="popLayout">
          {list.slice(0, limit).map((f, i) => {
            const t = current(f);
            const on = selected.some((id) => byId(id)?.format === f.key);
            const cin = cinematicById(String(t.params.cid ?? ""));
            return (
              <motion.div
                key={f.key}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.55, ease, delay: Math.min(i % PAGE, 12) * 0.025 }}
                onPointerEnter={() => setHover(f.key)}
                onPointerLeave={() => setHover(null)}
                className="group"
              >
                <div
                  onClick={() => toggleFormat(f)}
                  className={clsx(
                    "relative cursor-pointer overflow-hidden rounded-[20px] bg-bg-2 transition-all duration-500 ease-out",
                    f.signature && !on && "holo-ring",
                    on
                      ? "shadow-[0_0_0_2.5px_#2f6bff,0_24px_50px_-24px_rgba(47,107,255,.6)]"
                      : "shadow-[0_0_0_1px_rgba(10,11,13,.07)] group-hover:-translate-y-1 group-hover:shadow-[0_0_0_1px_rgba(10,11,13,.1),0_30px_50px_-28px_rgba(10,11,13,.45)]"
                  )}
                >
                  <AdCanvas tpl={t} ctx={ctx} playing={hover === f.key} sound={soundOn} width={230} maxDpr={1.5} />
                  {soundOn && soundBlocked && hover === f.key && (
                    <span className="pointer-events-none absolute left-1/2 top-2.5 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                      <Volume2 className="h-3 w-3" /> Click anywhere for sound
                    </span>
                  )}
                  <motion.span
                    animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
                    className="pointer-events-none absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-blue text-white shadow-lg"
                  >
                    <Check className="h-4 w-4" />
                  </motion.span>
                  <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center justify-between">
                    {cin ? (
                      <span className="rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">Sample</span>
                    ) : (
                      <span />
                    )}
                    <span className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm backdrop-blur transition-opacity duration-300 group-hover:opacity-0">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {scoreOf(f)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview(f);
                    }}
                    className="absolute bottom-2.5 right-2.5 grid h-8 w-8 translate-y-2 place-items-center rounded-full bg-white/95 opacity-0 shadow-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                    aria-label="Preview and customize"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-start justify-between gap-2 px-0.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-medium">{f.name}</span>
                      {(lessons.stats(f.key)?.great ?? 0) > 0 && (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Works for you</span>
                      )}
                      {(lessons.stats(f.key)?.flop ?? 0) > (lessons.stats(f.key)?.great ?? 0) && (
                        <span className="shrink-0 rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-muted">Flopped before</span>
                      )}
                      {t.event && <span className="shrink-0 text-[12px]">{eventById(t.event)?.emoji}</span>}
                    </div>
                    <div className="text-[12px] text-muted">
                      {f.category} · {cin ? cin.seconds : Math.round(t.dur)}s
                      {f.hooks.filter((h) => !h.event).length > 1 && (
                        <button
                          onClick={() => setPreview(f)}
                          className="ml-1 font-medium text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-blue"
                        >
                          · {f.hooks.filter((h) => !h.event).length} hooks
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
      <div ref={sentinel} className="h-10" />
      {list.length === 0 && <div className="py-24 text-center text-muted">No formats match that search.</div>}

      {/* selection tray — portalled: the page transition's filter would trap position:fixed */}
      <Portal>
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 lg:pl-[264px]"
          >
            <div className="ai-ring w-full max-w-[860px] rounded-[26px] border border-line bg-white/90 p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] backdrop-blur-xl">
              {/* prompt: notes on the templates, or your own shot list */}
              <div className="flex items-start gap-2 rounded-[18px] border border-line bg-bg-2/60 p-1.5">
                <div className="inline-flex shrink-0 rounded-full border border-line p-0.5 text-[11.5px] font-medium">
                  {(
                    [
                      ["add", "Add to template"],
                      ["own", "Write your own"],
                    ] as const
                  ).map(([m, l]) => (
                    <button
                      key={m}
                      onClick={() => setInputs({ ...ctx.ad, promptMode: m })}
                      className={clsx("rounded-full px-2.5 py-1 transition", (ctx.ad.promptMode ?? "add") === m ? "bg-ink text-white" : "text-muted hover:text-ink")}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <textarea
                  value={ctx.ad.direction ?? ""}
                  onChange={(e) => setInputs({ ...ctx.ad, direction: e.target.value.slice(0, 700) })}
                  rows={1}
                  placeholder={
                    (ctx.ad.promptMode ?? "add") === "own"
                      ? "Describe the video: e.g. night drive downtown, neon reflections, slow push-in on the grille at the end"
                      : "Optional prompt: e.g. golden hour, add a slow-motion drift, end on the car by the lake"
                  }
                  className="min-h-[34px] min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-snug outline-none placeholder:text-muted/70 focus:min-h-[72px]"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-1">
                <div className="flex -space-x-2">
                  {selected.slice(0, 5).map((id) => {
                    const t = byId(id);
                    return (
                      <motion.div key={id} layout initial={{ scale: 0 }} animate={{ scale: 1 }} className="h-10 w-[23px] overflow-hidden rounded-md border-2 border-white bg-bg-2 shadow">
                        {t && <AdCanvas tpl={t} ctx={ctx} playing={false} width={24} maxDpr={2} lazy={false} />}
                      </motion.div>
                    );
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">
                    {selected.length} ad{selected.length > 1 ? "s" : ""} · {ctx.ad.carId || ctx.ad.specialId ? ctx.ad.vehicleName : "no car picked"}
                  </div>
                  <div className="truncate text-[12px] text-muted">{ctx.ad.offers?.length ? `${ctx.ad.offers.length} offer${ctx.ad.offers.length === 1 ? "" : "s"}: ${ctx.ad.offer}` : ctx.ad.offer}</div>
                </div>
                {film && setFilm && hf?.available && (
                  <div className="flex items-center gap-2 rounded-full border border-line px-2.5 py-1.5">
                    <button
                      role="switch"
                      aria-checked={film.on}
                      onClick={() => setFilm({ ...film, on: !film.on })}
                      className={clsx("relative h-5 w-9 rounded-full transition", film.on ? "bg-blue" : "bg-line-2")}
                      title="Film your car with AI for each video as soon as you generate"
                    >
                      <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", film.on ? "left-[18px]" : "left-0.5")} />
                    </button>
                    <span className="text-[12.5px] font-medium">Film with my car</span>
                    {film.on && (
                      <select value={film.tier} onChange={(e) => setFilm({ ...film, tier: e.target.value as TierId })} className="h-7 rounded-full bg-transparent text-[12px] text-muted outline-none" title="Quality">
                        {TIERS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label} · {t.resolution}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <button onClick={() => setSelected([])} className="hidden h-9 rounded-full px-2 text-[13px] text-muted hover:text-ink sm:block">
                  Clear
                </button>
                <Button onClick={onGenerate} className="h-11">
                  <Sparkles className="h-4 w-4" /> Generate
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </Portal>

      <Portal>
      <AnimatePresence>
        {preview && (
          <PreviewModal
            f={preview}
            event={event}
            t={current(preview)}
            ctx={ctx}
            sound={soundOn}
            selected={selected.some((id) => byId(id)?.format === preview.key)}
            onChoose={(id) => choose(preview, id)}
            onToggle={() => toggleFormat(preview)}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
      </Portal>
    </div>
  );
}

const LOOK_LABEL: Record<Look, string> = { light: "Light", dark: "Night", brand: "Brand colour" };

function PreviewModal({
  f,
  event,
  t,
  ctx,
  sound,
  selected,
  onChoose,
  onToggle,
  onClose,
}: {
  f: Format;
  event?: string | null;
  t: Template;
  ctx: AdContext;
  sound: boolean;
  selected: boolean;
  onChoose: (id: string) => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const hooks = f.hooks.filter((h) => !h.event || h.event === event);
  const hook = hooks.find((h) => t.id === h.id) ?? hooks.find((h) => t.id.startsWith(h.id + "-") && !t.event) ?? hooks[0];
  const look: Look = t.look ?? "light";
  const cin = cinematicById(String(t.params.cid ?? ""));
  const hookLabel = (h: Template) =>
    ((h.params.hook as string | undefined) ?? (h.params.lines as string[] | undefined)?.[0] ?? h.name)
      .replaceAll("{dealer}", ctx.brand.name)
      .replaceAll("{city}", ctx.brand.city ?? "town")
      .replaceAll("{offer}", ctx.ad.offer)
      .replaceAll("{vehicle}", ctx.ad.vehicleName || "your next car")
      .replaceAll("{make}", ctx.brand.makes[0] ?? "car");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-xl" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ duration: 0.5, ease }}
        className="relative grid max-h-[92vh] w-full max-w-[920px] gap-8 overflow-auto rounded-[32px] border border-line bg-white p-5 shadow-[0_50px_120px_-40px_rgba(10,11,13,.5)] sm:grid-cols-[320px_1fr] sm:p-7"
      >
        <button onClick={onClose} className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full hover:bg-bg-2" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="self-start overflow-hidden rounded-[24px] bg-bg-2">
          <AdCanvas key={t.id} tpl={t} ctx={ctx} playing sound={sound} width={320} lazy={false} />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
            {f.category}
            {cin && <span className="rounded-full bg-ink/5 px-2 py-0.5 text-ink-2">{cin.seconds}s · made with your car</span>}
          </div>
          <h2 className="mt-2 text-[32px] font-semibold leading-[1.05] tracking-[-0.045em]">{f.name}</h2>
          <div className="mt-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-[15px] font-semibold tabular-nums">{t.score}</span>
            <span className="text-[13px] text-muted">base virality · {cin ? cin.seconds : Math.round(t.dur)}s</span>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{f.why}</p>
          {cin && (
            <div className="mt-4 space-y-1.5 rounded-2xl bg-bg-2/70 p-3.5 text-[13px] text-ink-2">
              <div>
                <span className="font-medium text-ink">Best for:</span> {cin.bestFor.join(", ")}
              </div>
              <div>
                <span className="font-medium text-ink">Your offer:</span> {OFFER_STYLE_LABEL[cin.offerStyle]} ({cin.offerSeconds}s)
              </div>
              <div className="text-muted">
                This preview uses a sample car and offer. Your version is filmed with your car photo in a few minutes, then your real offer is added.
              </div>
            </div>
          )}

          {hooks.length > 1 && (
            <div className="mt-6">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Hook</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {hooks.map((h) => {
                  const on = h.id === hook.id;
                  return (
                    <button
                      key={h.id}
                      onClick={() => onChoose(variantId(h, look))}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[13px] transition",
                        on ? "border-blue bg-blue/5 text-ink" : "border-line text-ink-2 hover:border-ink/20"
                      )}
                    >
                      <span className={clsx("grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-blue bg-blue text-white" : "border-line-2")}>
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{hookLabel(h)}</span>
                      <span className="shrink-0 text-[11px] text-muted">{h.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {f.looks.length > 0 && !hook.params.mode && (
            <div className="mt-5">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Look</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.looks.map((l) => (
                  <button
                    key={l}
                    onClick={() => onChoose(variantId(hook, l))}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition",
                      look === l ? "border-ink bg-ink text-white" : "border-line-2 text-ink-2 hover:border-ink/30"
                    )}
                  >
                    {LOOK_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 text-muted">
            {t.platforms.map((p) => (
              <PlatformIcon key={p} p={p} className="h-[18px] w-[18px]" />
            ))}
          </div>
          <div className="mt-auto pt-7">
            <Button size="lg" onClick={onToggle} variant={selected ? "soft" : "primary"}>
              {selected ? (
                <>
                  <Check className="h-4 w-4" /> Selected
                </>
              ) : (
                "Add to batch"
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
