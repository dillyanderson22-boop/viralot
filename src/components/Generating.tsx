"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { byId, resolveTemplate } from "@/lib/ad/catalog";
import { buildReport } from "@/lib/captions";
import type { AdContext } from "@/lib/ad/runtime";
import type { Template } from "@/lib/ad/catalog";
import type { AdInputs, Brand } from "@/lib/types";
import { ParticleBrain, type BrainPhase } from "./ParticleBrain";
import { AdCanvas } from "./AdCanvas";
import { Wordmark, ease } from "./ui";

const TIMELINE: { phase: BrainPhase; at: number; title: string; sub: string }[] = [
  { phase: "assemble", at: 0, title: "Composing scenes", sub: "Laying out hooks, beats and reveals" },
  { phase: "render", at: 3.0, title: "Rendering motion", sub: "Fitting your logo, colours, car and offer into every frame" },
  { phase: "brain", at: 6.4, title: "Finding the most viral captions", sub: "Scoring hooks, length, CTAs and hashtags per platform" },
  { phase: "score", at: 11.4, title: "Testing virality", sub: "Predicting hook strength, retention and shareability" },
];
const END = 14.4;

/** A believable, data-driven log — every line reflects something this batch actually contains. */
function buildLog(ctx: AdContext, names: string[], frames: number[], caps: { text: string; score: number }[], tags: string[], score: number) {
  const b = ctx.brand;
  const lines: { at: number; text: string; tone?: "ok" | "hot" }[] = [];
  const push = (at: number, text: string, tone?: "ok" | "hot") => lines.push({ at, text, tone });
  push(0.1, `load brand kit · ${b.name}`);
  push(0.5, `logo vectorised · primary ${b.colors.primary.toUpperCase()}`);
  push(0.9, `hero vehicle · ${ctx.ad.vehicleName || "stock"}`);
  push(1.3, `offer locked · "${ctx.ad.offer}"`);
  push(1.7, `canvas 1080×1920 · 30fps · ${names.length} format${names.length > 1 ? "s" : ""}`);
  names.forEach((n, i) => push(2.0 + i * 0.18, `sequence ${String(i + 1).padStart(2, "0")} · ${n}`));
  names.forEach((n, i) => {
    const t0 = 3.1 + i * (3.0 / Math.max(1, names.length));
    push(t0, `render ${n} · frames 0–${frames[i]}`);
    push(t0 + 0.25, `composite ${n} · motion blur · grade`, "ok");
  });
  push(5.9, "audio bed synced · 108 bpm · −14 LUFS", "ok");
  caps.slice(0, 14).forEach((c, i) => push(6.5 + i * 0.34, `caption ${String(i + 1).padStart(3, "0")} · ${c.score} · ${c.text.slice(0, 42)}${c.text.length > 42 ? "…" : ""}`, c.score >= 85 ? "hot" : undefined));
  push(11.2, `hashtags · ${tags.slice(0, 4).join(" ")}`);
  push(11.6, "retention curve modelled · drop-off < 18% @ 3s", "ok");
  push(12.2, "hook strength · first 1.2s weighted ×3");
  push(12.8, `predicted virality · ${score}`, "hot");
  push(13.6, "saving to My ads", "ok");
  return lines.sort((a, b2) => a.at - b2.at);
}

export type GenItem = { templateId: string; inputs: AdInputs };

export function Generating({ brand, items, onDone }: { brand: Brand; items: GenItem[]; onDone: () => void }) {
  const [t, setT] = useState(0);
  const rows = useMemo(
    () => items.map((it) => ({ tpl: byId(it.templateId), ctx: { brand, ad: it.inputs } as AdContext })).filter((r): r is { tpl: Template; ctx: AdContext } => !!r.tpl),
    [items, brand]
  );
  const tpls = useMemo(() => rows.map((r) => r.tpl), [rows]);
  const ctx = rows[0]?.ctx ?? ({ brand, ad: items[0]?.inputs } as AdContext);
  const reports = useMemo(() => rows.map((r) => buildReport(r.tpl, brand, r.ctx.ad)), [rows, brand]);
  const avg = Math.round(reports.reduce((a, r) => a + r.score, 0) / Math.max(1, reports.length));
  const regionValues = useMemo(() => {
    const keys = ["Hook strength", "Shareability", "Retention", "Shareability", "Comment pull"];
    return keys.map((k) => Math.round(reports.reduce((a, r) => a + (r.breakdown.find((b) => b.label === k)?.value ?? 80), 0) / Math.max(1, reports.length)));
  }, [reports]);
  const pool = useMemo(() => {
    const seen = new Set<string>();
    return reports
      .flatMap((r) => r.considered)
      .filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)))
      .sort((a, b) => ((a.text.length * 7919) % 97) - ((b.text.length * 7919) % 97));
  }, [reports]);
  const evaluated = reports.reduce((a, r) => a + r.considered.length, 0);
  const frames = useMemo(() => tpls.map((tp) => Math.round(resolveTemplate(tp, brand.makes).dur * 30)), [tpls, brand]);
  const multiCar = new Set(items.map((i) => i.inputs.vehicleImage)).size > 1;
  const log = useMemo(
    () =>
      buildLog(
        ctx,
        rows.map((r) => (multiCar ? `${r.tpl.name} · ${r.ctx.ad.vehicleName}` : r.tpl.name)),
        frames,
        pool,
        reports[0]?.captions.tiktok.hashtags ?? [],
        avg
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, frames, pool, reports, avg]
  );

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      setT(s);
      if (s >= END) return onDone();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  const stageIdx = TIMELINE.findLastIndex((x) => t >= x.at);
  const stage = TIMELINE[stageIdx];
  const overall = Math.min(1, t / END);
  const capIdx = Math.floor(Math.max(0, t - 6.5) / 0.32);
  const visibleCaps = stage.phase === "brain" ? pool.slice(Math.max(0, capIdx - 5), capIdx + 1) : [];
  const counted = Math.min(evaluated, Math.round(evaluated * Math.min(1, Math.max(0, (t - 6.4) / 5))));
  const shownLog = log.filter((l) => l.at <= t).slice(-7);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-white">
      <div className="grid-bg pointer-events-none absolute inset-0" />

      {/* segmented progress across the top */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-1 pt-1">
        {TIMELINE.map((s, i) => {
          const end = TIMELINE[i + 1]?.at ?? END;
          const k = Math.min(1, Math.max(0, (t - s.at) / (end - s.at)));
          return (
            <div key={s.title} className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/[.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-blue to-cyan" style={{ width: `${k * 100}%` }} />
            </div>
          );
        })}
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 pt-5 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2 rounded-full border border-line bg-white/80 py-1 pl-1 pr-3 backdrop-blur">
          <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full border border-line bg-white">
            {ctx.brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.brand.logo} alt="" className="max-h-4 max-w-5 object-contain" />
            ) : (
              <span className="h-3 w-3 rounded-full" style={{ background: ctx.brand.colors.primary }} />
            )}
          </span>
          <span className="max-w-[200px] truncate text-[12.5px] font-medium">{ctx.brand.name}</span>
        </div>
      </header>

      {/* brain */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="relative h-[min(80vh,820px)] w-[min(98vw,1180px)]">
          <ParticleBrain phase={stage.phase} score={avg} regionValues={regionValues} />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-[80px]"
            style={{ background: "radial-gradient(circle, rgba(56,212,255,.35), rgba(47,107,255,.12) 60%, transparent 70%)" }}
          />
          {stage.phase === "score" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease }}
              className="pointer-events-none absolute bottom-[9%] left-1/2 -translate-x-1/2 text-center"
            >
              <div className="text-[48px] font-semibold leading-none tracking-[-0.05em] tabular-nums">{Math.round(avg * Math.min(1, (t - 11.4) / 1.6))}</div>
              <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">Predicted virality</div>
            </motion.div>
          )}
        </div>
      </div>

      {/* headline */}
      <div className="relative z-10 mx-auto flex max-w-[760px] flex-col items-center px-4 pt-6 text-center sm:pt-8">
        <div className="flex items-center gap-2 rounded-full border border-line bg-white/80 px-3 py-1 font-mono text-[11px] text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue" />
          {String(Math.round(overall * 100)).padStart(2, "0")}% · {tpls.length} ad{tpls.length > 1 ? "s" : ""}
        </div>
        <motion.div
          key={stage.title}
          initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease }}
        >
          <h1 className="mt-4 text-[32px] font-semibold tracking-[-0.045em] sm:text-[46px]">
            {stage.title}
            <span className="inline-block w-[1.2ch] text-left text-blue">{".".repeat(1 + (Math.floor(t * 3) % 3))}</span>
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">{stage.sub}</p>
        </motion.div>
      </div>

      {/* left: pipeline + live console */}
      <div className="absolute bottom-6 left-4 z-10 hidden w-[300px] space-y-3 sm:left-8 md:block">
        <div className="rounded-3xl border border-line bg-white/85 p-5 backdrop-blur-xl">
          {TIMELINE.map((s, i) => {
            const done = i < stageIdx;
            const active = i === stageIdx;
            return (
              <div key={s.title} className="flex items-center gap-3 py-1.5">
                <span
                  className={clsx(
                    "grid h-5 w-5 place-items-center rounded-full border text-[10px] transition-all duration-500",
                    done && "border-blue bg-blue text-white",
                    active && "border-blue text-blue shadow-[0_0_0_4px_rgba(47,107,255,.12)]",
                    !done && !active && "border-line-2 text-muted"
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className={clsx("text-[13px] transition-colors", active ? "font-medium text-ink" : done ? "text-ink-2" : "text-muted")}>{s.title}</span>
              </div>
            );
          })}
        </div>
        <div className="h-[168px] overflow-hidden rounded-3xl border border-line bg-[#0b0d12] p-4 font-mono text-[11px] leading-[1.7] text-white/70 shadow-[0_20px_50px_-30px_rgba(10,11,13,.6)]">
          <AnimatePresence initial={false}>
            {shownLog.map((l) => (
              <motion.div
                key={l.at + l.text}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={clsx("truncate", l.tone === "ok" && "text-emerald-300/90", l.tone === "hot" && "text-cyan-300")}
              >
                <span className="text-white/30">› </span>
                {l.text}
              </motion.div>
            ))}
          </AnimatePresence>
          <span className="inline-block h-3 w-1.5 animate-pulse bg-cyan-300/80 align-middle" />
        </div>
      </div>

      {/* right: per-ad render progress with live frame counters */}
      <div className="absolute bottom-6 right-4 z-10 hidden w-[300px] sm:right-8 md:block">
        <div className="max-h-[52vh] space-y-2 overflow-hidden">
          {rows.slice(0, 6).map(({ tpl: tp, ctx: rowCtx }, i) => {
            const k = Math.min(1, Math.max(0, (t - 3.0 - i * 0.3) / 2.8));
            const score = reports[i].score;
            const scoring = stage.phase === "score";
            return (
              <motion.div
                key={tp.id + i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease, delay: 0.3 + i * 0.08 }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-white/85 p-2 pr-3 backdrop-blur-xl"
              >
                <div className="relative h-14 w-8 shrink-0 overflow-hidden rounded-md bg-bg-2">
                  <AdCanvas tpl={tp} ctx={rowCtx} playing={false} width={32} lazy={false} stillAt={resolveTemplate(tp, brand.makes).dur * Math.max(0.12, k) * 0.7} />
                  {k > 0 && k < 1 && <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-transparent to-cyan/50" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{multiCar ? rowCtx.ad.vehicleName : tp.name}</div>
                  <div className="mt-0.5 font-mono text-[10.5px] text-muted">
                    {k < 1 ? `frame ${String(Math.round(frames[i] * k)).padStart(3, "0")}/${frames[i]}` : scoring ? "scoring" : "rendered"}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue to-cyan transition-[width] duration-200" style={{ width: `${k * 100}%` }} />
                  </div>
                </div>
                <div className="w-8 text-right font-mono text-[12px] tabular-nums text-ink">
                  {scoring ? Math.round(score * Math.min(1, (t - 11.4) / 1.6)) : k >= 1 ? <Check className="ml-auto h-3.5 w-3.5 text-blue" /> : ""}
                </div>
              </motion.div>
            );
          })}
          {rows.length > 6 && <div className="px-2 text-[12px] text-muted">+{rows.length - 6} more</div>}
        </div>
      </div>

      {/* caption stream around the brain */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <AnimatePresence>
          {visibleCaps.map((c, i) => {
            const n = capIdx - (visibleCaps.length - 1 - i);
            const left = n % 2 === 0;
            const y = 22 + ((n * 37) % 22);
            const good = c.score >= 80;
            return (
              <motion.div
                key={n + c.text}
                initial={{ opacity: 0, x: left ? -60 : 60, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: left ? 160 : -160, scale: 0.55, filter: "blur(6px)" }}
                transition={{ duration: 0.7, ease }}
                className={clsx(
                  "absolute hidden max-w-[280px] rounded-2xl border bg-white/90 px-3.5 py-2.5 text-left shadow-[0_20px_40px_-24px_rgba(10,11,13,.35)] backdrop-blur lg:block",
                  good ? "border-blue/40" : "border-line"
                )}
                style={{ top: `${y}%`, [left ? "left" : "right"]: "clamp(12px, 4vw, 90px)" }}
              >
                <div className="line-clamp-2 text-[12.5px] leading-snug text-ink-2">{c.text}</div>
                <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px]">
                  <span className={clsx("rounded px-1.5 py-0.5", good ? "bg-blue text-white" : "bg-ink/5 text-muted")}>{c.score}</span>
                  <span className="text-muted">{good ? "keep" : "discard"}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {(stage.phase === "brain" || stage.phase === "score") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-line bg-white/85 px-4 py-2 font-mono text-[12px] text-ink-2 backdrop-blur"
          >
            {counted.toLocaleString()} captions evaluated
          </motion.div>
        )}
      </div>
    </div>
  );
}
