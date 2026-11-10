"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BadgeDollarSign, Check, ExternalLink, Loader2, RefreshCw, Sparkles, Tag } from "lucide-react";
import clsx from "clsx";
import type { AdInputs, Special, SpecialOffer } from "@/lib/types";
import type { Dealer } from "@/lib/workspace";
import { headlineFor, inputsForSpecial } from "@/lib/specials";
import { Portal } from "./Portal";
import { Button, SectionLabel, ease } from "./ui";

const KIND_LABEL: Record<SpecialOffer["kind"], string> = {
  lease: "Lease",
  finance: "Finance",
  cash: "Cash",
  discount: "Discount",
  msrp: "MSRP",
  price: "Price",
  trade: "Trade-in",
  bonus: "Bonus",
  other: "Offer",
};

function ago(ts?: number) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/**
 * Every special the dealer is running, one card per car with all its offers.
 * Pick a car, keep all of its offers or just one or two, then make a viral
 * video or offer spots with exactly those.
 */
export function SpecialsView({
  dealer,
  onSave,
  onUse,
}: {
  dealer: Dealer;
  onSave: (specials: Special[]) => void;
  onUse: (inputs: AdInputs, to: "create" | "spots") => void;
}) {
  const specials = dealer.brand.specials ?? [];
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  // the car being built, and which of its offers are in
  const [pick, setPick] = useState<{ id: string; on: number[] } | null>(() =>
    dealer.inputs.specialId && specials.some((s) => s.id === dealer.inputs.specialId)
      ? {
          id: dealer.inputs.specialId,
          on: (specials.find((s) => s.id === dealer.inputs.specialId)?.offers ?? []).flatMap((o, i) => (dealer.inputs.offers?.some((p) => p.label === o.label && p.value === o.value) ? [i] : [])),
        }
      : null
  );
  const picked = pick ? specials.find((s) => s.id === pick.id) : undefined;
  const chosen = picked ? picked.offers.filter((_, i) => pick!.on.includes(i)) : [];

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [busy]);

  const scan = async () => {
    setBusy(true);
    setErr(null);
    setElapsed(0);
    try {
      const r = await fetch("/api/specials", { method: "POST", body: JSON.stringify({ url: dealer.brand.url }) });
      const d = (await r.json()) as { specials?: Special[]; pages?: string[]; error?: string };
      if (!r.ok || !d.specials) throw new Error(d.error ?? "Couldn't read the specials");
      setPages(d.pages?.length ?? 0);
      if (!d.specials.length) throw new Error(`Firecrawl read ${d.pages?.length ?? 0} specials page${d.pages?.length === 1 ? "" : "s"} but found no vehicle offers on them.`);
      onSave(d.specials);
      setPick(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleCar = (sp: Special) => setPick((p) => (p?.id === sp.id ? null : { id: sp.id, on: sp.offers.map((_, i) => i) }));
  const toggleOffer = (sp: Special, i: number) =>
    setPick((p) => {
      if (!p || p.id !== sp.id) return { id: sp.id, on: [i] };
      const on = p.on.includes(i) ? p.on.filter((x) => x !== i) : [...p.on, i].sort((a, b) => a - b);
      return { id: sp.id, on };
    });
  const use = (to: "create" | "spots") => picked && chosen.length && onUse(inputsForSpecial(dealer.inputs, picked, chosen), to);
  const offerCount = specials.reduce((n, s) => n + s.offers.length, 0);

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-40 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Specials</SectionLabel>
          <h1 className="mt-4 text-[38px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[52px]">Every special they&apos;re running.</h1>
          <p className="mt-3 max-w-[600px] text-[15px] text-muted">
            Read straight from {dealer.brand.name}&apos;s specials pages. Pick a car, keep all of its offers or just one or two, then make the video.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button onClick={scan} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {busy ? `Reading specials… ${elapsed}s` : specials.length ? "Rescan specials" : "Scan specials"}
          </Button>
          {(dealer.brand.specialsScannedAt || pages != null) && !busy && (
            <span className="text-[12px] text-muted">
              {specials.length} cars · {offerCount} offers{pages != null ? ` · ${pages} pages` : ""}
              {dealer.brand.specialsScannedAt ? ` · ${ago(dealer.brand.specialsScannedAt)}` : ""}
            </span>
          )}
        </div>
      </div>

      {busy && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-blue/[.06] px-4 py-3 text-[13.5px] text-ink-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue" />
          Finding the specials, lease and incentives pages and reading every offer on them. This usually takes 1–2 minutes.
        </div>
      )}
      {err && !busy && <div className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-[13.5px] text-red-700">{err}</div>}

      {!specials.length && !busy && (
        <div className="mt-10 grid place-items-center rounded-[28px] border border-dashed border-line-2 px-6 py-20 text-center">
          <BadgeDollarSign className="h-9 w-9 text-blue" />
          <div className="mt-4 text-[20px] font-semibold tracking-[-0.03em]">No specials yet</div>
          <p className="mt-2 max-w-[440px] text-[14px] text-muted">We&apos;ll find {dealer.brand.name}&apos;s specials pages and list every car with all of its offers: lease, finance, cash back, discounts, MSRP and bonuses.</p>
          <Button className="mt-6" onClick={scan}>
            <RefreshCw className="h-4 w-4" /> Scan specials
          </Button>
        </div>
      )}

      {specials.length > 0 && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {specials.map((sp, k) => {
            const active = pick?.id === sp.id;
            return (
              <motion.div
                key={sp.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease, delay: Math.min(k, 9) * 0.03 }}
                className={clsx(
                  "flex flex-col overflow-hidden rounded-[22px] border bg-white transition",
                  active ? "border-blue shadow-[0_0_0_2px_var(--blue),0_30px_60px_-30px_rgba(59,123,255,.6)]" : "border-line hover:border-ink/15"
                )}
              >
                <button onClick={() => toggleCar(sp)} className="relative block text-left">
                  <div className="grid h-40 place-items-center bg-gradient-to-b from-white to-bg-2">
                    {sp.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sp.image} alt="" className="h-36 w-full object-contain" loading="lazy" />
                    ) : (
                      <Tag className="h-8 w-8 text-muted" />
                    )}
                  </div>
                  <span className={clsx("absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full border transition", active ? "border-blue bg-blue text-white" : "border-line-2 bg-white/80")}>
                    {active && <Check className="h-4 w-4" />}
                  </span>
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <div className="text-[16px] font-semibold leading-snug tracking-[-0.02em]">{sp.vehicle}</div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {sp.expires ? `Ends ${sp.expires}` : "No end date shown"}
                    {sp.stock ? ` · Stock #${sp.stock.replace(/^#+/, "")}` : ""}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {sp.offers.map((o, i) => {
                      const on = active && pick!.on.includes(i);
                      return (
                        <button
                          key={i}
                          onClick={() => toggleOffer(sp, i)}
                          className={clsx("flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition", on ? "border-blue bg-blue/[.07]" : "border-line hover:border-ink/15")}
                        >
                          <span className={clsx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-blue bg-blue text-white" : "border-line-2")}>{on && <Check className="h-3 w-3" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-[12.5px] text-ink-2">
                                <span className="mr-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted">{KIND_LABEL[o.kind]}</span>
                                {o.label}
                              </span>
                              <span className="shrink-0 text-[14px] font-semibold tabular-nums">{o.value}</span>
                            </span>
                            {o.detail && <span className="mt-0.5 block text-[11.5px] text-muted">{o.detail}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {active && sp.offers.length > 1 && (
                    <div className="mt-2 flex gap-3 text-[12px] font-medium">
                      <button onClick={() => setPick({ id: sp.id, on: sp.offers.map((_, i) => i) })} className="text-blue hover:underline">
                        All offers
                      </button>
                      <button onClick={() => setPick({ id: sp.id, on: [] })} className="text-muted hover:text-ink">
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3 pt-3 text-[11.5px] text-muted">
                    {sp.disclaimer ? (
                      <details className="min-w-0">
                        <summary className="cursor-pointer select-none hover:text-ink">Fine print</summary>
                        <p className="mt-1 leading-relaxed">{sp.disclaimer}</p>
                      </details>
                    ) : (
                      <span />
                    )}
                    {sp.page && (
                      <a href={sp.page} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 hover:text-ink">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Portal>
        <AnimatePresence>
          {picked && (
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 lg:pl-[264px]"
            >
              <div className="ai-ring flex w-full max-w-[760px] flex-wrap items-center gap-3 rounded-[28px] border border-line bg-white/90 py-2 pl-3 pr-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,.6)] backdrop-blur-xl sm:flex-nowrap sm:rounded-full">
                {picked.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picked.image} alt="" className="h-10 w-14 shrink-0 rounded-lg bg-bg-2 object-contain" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">
                    {chosen.length ? `${chosen.length} of ${picked.offers.length} offer${picked.offers.length === 1 ? "" : "s"}` : "Pick at least one offer"} · {picked.vehicle}
                  </div>
                  <div className="truncate text-[12px] text-muted">{chosen.length ? headlineFor(picked, chosen) : "Tick the offers you want in the video"}</div>
                </div>
                <Button variant="soft" className="h-11" disabled={!chosen.length} onClick={() => use("spots")}>
                  <BadgeDollarSign className="h-4 w-4" /> Offer spots
                </Button>
                <Button className="h-11" disabled={!chosen.length} onClick={() => use("create")}>
                  <Sparkles className="h-4 w-4" /> Viral video
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
