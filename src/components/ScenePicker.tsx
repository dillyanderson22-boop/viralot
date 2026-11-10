"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Sparkles, SlidersHorizontal, Trash2, Wand2, X } from "lucide-react";
import clsx from "clsx";
import { CUSTOM_FIT, SCENES, estimateLight, type Scene as SceneDef } from "@/lib/spot";
import { loadImage } from "@/lib/ad/runtime";
import type { SceneJob } from "@/lib/workspace";
import { Button, ease } from "./ui";

const IDEAS = [
  "Desert highway at golden hour, red rocks",
  "Snowy mountain pass, fresh snow on the shoulders",
  "Beachfront boulevard with palm trees, midday sun",
  "Downtown street at dusk, warm shop lights",
  "Rainy city street at night, neon reflections",
  "Country road through autumn trees",
];

type Avail = { available: boolean; demo?: boolean; credits?: number | null } | null;

/**
 * Background picker: the built-in scenes, the dealer's generated ones, a
 * generator that writes a road-framed prompt for Higgsfield, and fit sliders
 * so any background lines up with the car.
 */
export function ScenePicker({
  selected,
  onSelect,
  scenes,
  setScenes,
  job,
  setJob,
}: {
  selected: string;
  onSelect: (id: string) => void;
  scenes: SceneDef[];
  setScenes: (s: SceneDef[]) => void;
  job?: SceneJob;
  setJob: (j: SceneJob | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tune, setTune] = useState(false);
  const [place, setPlace] = useState("");
  const [avail, setAvail] = useState<Avail>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const all = [...SCENES, ...scenes];
  const current = scenes.find((s) => s.id === selected);
  const running = job && (job.status === "queued" || job.status === "in_progress");

  useEffect(() => {
    if (!open && !running) return;
    let alive = true;
    fetch("/api/scenes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Avail) => alive && setAvail(d))
      .catch(() => alive && setAvail({ available: false }));
    return () => {
      alive = false;
    };
  }, [open, running]);

  // keep the latest callbacks for the poller without restarting it every render
  const cb = useRef({ setJob, setScenes, onSelect, scenes });
  useEffect(() => {
    cb.current = { setJob, setScenes, onSelect, scenes };
  });

  useEffect(() => {
    if (!running || !job) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/scenes?id=${job.requestId}`, { cache: "no-store" });
        const d = (await r.json()) as { status?: SceneJob["status"]; url?: string; error?: string };
        if (!alive) return;
        if (!r.ok) {
          if (r.status === 401) cb.current.setJob({ ...job, status: "failed", error: d.error ?? "Higgsfield rejected the key" });
          return;
        }
        if (d.status === "completed" && d.url) {
          // light the car to match: sample the new image's colour and brightness
          const img = await loadImage(d.url);
          const light = img ? estimateLight(img) : { tint: "#ffffff", tintAmount: 0.05, dark: false };
          const scene: SceneDef = {
            id: `custom-${job.requestId}`,
            label: job.place.length > 26 ? job.place.slice(0, 24) + "…" : job.place,
            src: d.url,
            ...CUSTOM_FIT,
            ...light,
            custom: true,
            prompt: job.place,
          };
          cb.current.setScenes([...cb.current.scenes.filter((s) => s.id !== scene.id), scene]);
          cb.current.onSelect(scene.id);
          cb.current.setJob(undefined);
          setOpen(false);
          setTune(true);
        } else if (d.status && d.status !== job.status) cb.current.setJob({ ...job, status: d.status, error: d.error });
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [running, job]);

  const generate = async (text = place) => {
    const p = text.trim();
    if (p.length < 3) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/scenes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ place: p }) });
      const d = (await r.json()) as { requestId?: string; error?: string };
      if (!r.ok || !d.requestId) throw new Error(d.error ?? "Couldn't start the background");
      setJob({ requestId: d.requestId, place: p, status: "queued", startedAt: Date.now() });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const patchScene = (p: Partial<SceneDef>) => current && setScenes(scenes.map((s) => (s.id === current.id ? { ...s, ...p } : s)));

  return (
    <div>
      <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1">
        {/* generate your own */}
        <button onClick={() => setOpen(!open)} className="shrink-0 text-left">
          <div
            className={clsx(
              "relative grid h-[132px] w-[76px] place-items-center overflow-hidden rounded-xl border-2 border-dashed transition",
              open || running ? "border-blue bg-blue/[.05] text-blue" : "border-line-2 text-muted hover:border-ink/30 hover:text-ink"
            )}
          >
            {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </div>
          <div className={clsx("mt-1.5 w-[76px] text-[11.5px] leading-tight", open || running ? "font-medium text-blue" : "text-muted")}>{running ? "Generating…" : "Generate your own"}</div>
        </button>
        {all.map((sc) => {
          const on = selected === sc.id;
          return (
            <div key={sc.id} className="group relative shrink-0">
              <button onClick={() => onSelect(sc.id)} className="text-left">
                <div className={clsx("h-[132px] w-[76px] overflow-hidden rounded-xl transition", on ? "ring-2 ring-blue ring-offset-2" : "ring-1 ring-line hover:ring-ink/25")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sc.src} alt="" crossOrigin="anonymous" className="h-full w-full object-cover" />
                </div>
                <div className={clsx("mt-1.5 w-[76px] text-[11.5px] leading-tight", on ? "font-medium text-blue" : "text-muted")}>
                  {sc.custom && <Sparkles className="mr-0.5 inline h-2.5 w-2.5 -translate-y-px" />}
                  {sc.label}
                </div>
              </button>
              {sc.custom && (
                <button
                  onClick={() => {
                    setScenes(scenes.filter((s) => s.id !== sc.id));
                    if (on) onSelect("city");
                  }}
                  title="Remove background"
                  className="absolute right-1 top-1 hidden h-6 w-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur group-hover:grid"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* generator */}
      <AnimatePresence initial={false}>
        {(open || running || job?.status === "failed") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-[20px] border border-line bg-white p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[14px] font-medium">Generate a background</div>
                  <div className="text-[12.5px] text-muted">Describe the place. We frame it as an empty road at eye level so your car sits right on it.</div>
                </div>
                {!running && (
                  <button onClick={() => (setOpen(false), setJob(undefined))} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-bg-2 hover:text-ink">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {running ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-bg-2 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">“{job!.place}”</div>
                    <div className="text-[12px] text-muted">{job!.status === "queued" ? "Queued at Higgsfield…" : "Painting the scene…"} usually under a minute</div>
                  </div>
                </div>
              ) : avail && !avail.available ? (
                <div className="mt-3 text-[13px] text-muted">
                  Add your Higgsfield API key and secret in <a href="/admin" className="font-medium text-ink underline underline-offset-4">/admin</a> to generate backgrounds.
                </div>
              ) : (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      generate();
                    }}
                    className="mt-4 flex flex-col gap-2 sm:flex-row"
                  >
                    <input
                      value={place}
                      onChange={(e) => setPlace(e.target.value)}
                      maxLength={300}
                      placeholder="e.g. Coastal road in Malibu at sunset"
                      className="h-11 flex-1 rounded-xl border border-line-2 bg-white px-3.5 text-[14px] outline-none transition focus:border-blue focus:shadow-[0_0_0_4px_rgba(47,107,255,.12)]"
                    />
                    <Button type="submit" disabled={busy || place.trim().length < 3 || !avail} className="h-11">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate
                    </Button>
                  </form>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {IDEAS.map((i) => (
                      <button key={i} onClick={() => setPlace(i)} className="rounded-full border border-line px-3 py-1 text-[12px] text-ink-2 transition hover:border-ink/25 hover:text-ink">
                        {i}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 text-[12px] text-muted">
                    {avail?.demo ? "Demo mode: a sample background comes back." : "9:16 · 1080p"}
                  </div>
                </>
              )}
              {(err || job?.status === "failed") && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err ?? job?.error ?? "That didn't work. Try again."}</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* fit controls for generated backgrounds */}
      {current && (
        <div className="mt-4 rounded-[20px] border border-line bg-white p-4">
          <button onClick={() => setTune(!tune)} className="flex w-full items-center gap-2 text-left">
            <SlidersHorizontal className="h-4 w-4 text-blue" />
            <span className="flex-1 text-[13.5px] font-medium">Fit the car to this background</span>
            <span className="text-[12px] text-muted">{tune ? "Hide" : "Adjust"}</span>
          </button>
          {tune && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Slider label="Road level" hint="Where the road meets the horizon" min={0.3} max={0.8} step={0.005} value={current.horizon} onChange={(v) => patchScene({ horizon: v })} />
              <Slider label="Road position" hint="Left ↔ right" min={0.15} max={0.85} step={0.01} value={current.roadX} onChange={(v) => patchScene({ roadX: v })} />
              <Slider label="Light match" hint="How much the scene's light colours the car" min={0} max={0.6} step={0.01} value={current.tintAmount} onChange={(v) => patchScene({ tintAmount: v })} />
              <Slider label="Reflection" hint="For wet roads and shiny floors" min={0} max={0.45} step={0.01} value={current.reflect} onChange={(v) => patchScene({ reflect: v })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Slider({ label, hint, min, max, step, value, onChange }: { label: string; hint: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-medium">{label}</span>
        <span className="text-[11px] tabular-nums text-muted">{Math.round(((value - min) / (max - min)) * 100)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-[#2f6bff]" />
      <div className="text-[11px] text-muted">{hint}</div>
    </label>
  );
}
