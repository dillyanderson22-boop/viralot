"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Film, Loader2, PenLine, RotateCcw, Wand2 } from "lucide-react";
import type { Template } from "@/lib/ad/catalog";
import { startFilm } from "@/lib/ad/film";
import clsx from "clsx";
import { CUSTOM_ID, TIERS, cinematicById, tierById, type TierId } from "@/lib/cinematic";
import type { SavedAd } from "@/lib/workspace";
import { Button } from "./ui";

type Avail = { available: boolean; demo?: boolean } | null;

const TIER_KEY = "viralot.cinematicTier";
type Job = NonNullable<SavedAd["cine"]>;

/**
 * Turns a cinematic sample into the dealer's own ad: Seedance 2.5 films their
 * car in the template's location, then the real offer is drawn on top.
 * The finished clip is saved on the ad and reused for every download.
 */
export function CinematicPanel({ t, ad, onUpdate }: { t: Template; ad: SavedAd; onUpdate: (patch: Partial<SavedAd>) => void }) {
  const c = cinematicById(String(t.params.cid ?? ""));
  const [avail, setAvail] = useState<Avail>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // optional text prompt: notes on top of the template, or the dealer's own shot list
  const [mode, setMode] = useState<"add" | "own">(ad.cine?.mode ?? ad.inputs.promptMode ?? "add");
  const [direction, setDirection] = useState(ad.cine?.direction ?? ad.inputs.direction ?? "");
  const custom = t.params.cid === CUSTOM_ID;
  const [showPrompt, setShowPrompt] = useState(custom || !!(ad.cine?.direction ?? ad.inputs.direction));
  // "Redo" on a finished video reopens the options instead of re-rendering straight away
  const [again, setAgain] = useState(false);
  const [tier, setTierState] = useState<TierId>(() => {
    try {
      return tierById(localStorage.getItem(TIER_KEY) ?? undefined).id;
    } catch {
      return "standard";
    }
  });
  const setTier = (t: TierId) => {
    setTierState(t);
    try {
      localStorage.setItem(TIER_KEY, t);
    } catch {}
  };
  const job = ad.cine && ad.cine.car === ad.inputs.vehicleImage ? ad.cine : undefined;
  const live = !!c && !!ad.inputs.cinematic?.[c.id];

  const latest = useRef({ ad, onUpdate });
  useEffect(() => {
    latest.current = { ad, onUpdate };
  });

  /** Save a job state; a finished clip goes straight into the ad's inputs. */
  const save = (j: Job | null) => {
    const { ad, onUpdate } = latest.current;
    if (!c) return;
    const cinematic = { ...(ad.inputs.cinematic ?? {}) };
    if (j?.status === "completed" && j.url) cinematic[c.id] = j.url;
    else delete cinematic[c.id];
    onUpdate({ cine: j ?? undefined, inputs: { ...ad.inputs, cinematic } });
  };

  // the car changed since the render: the old clip shows a different car, so drop it
  useEffect(() => {
    if (c && ad.cine && ad.cine.car !== ad.inputs.vehicleImage && ad.inputs.cinematic?.[c.id]) save(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.inputs.vehicleImage]);

  useEffect(() => {
    let alive = true;
    fetch("/api/cinematic", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Avail) => alive && setAvail(d))
      .catch(() => alive && setAvail({ available: false }));
    return () => {
      alive = false;
    };
  }, [t.params.cid]);

  const running = job && (job.status === "queued" || job.status === "in_progress");

  if (!c) return null;

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await startFilm(ad.inputs, c.id, tier, direction, mode);
      setAgain(false);
      save(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chosen = tierById(tier);
  const box = "rounded-[20px] border border-line bg-white p-4";
  if (avail && !avail.available)
    return (
      <div className={box + " text-[13px] text-muted"}>
        This is a sample. Add your Higgsfield API key and secret in{" "}
        <a href="/admin" className="font-medium text-ink underline underline-offset-4">
          /admin
        </a>{" "}
        to render {c.name} with your own car and offer.
      </div>
    );

  if (live && job?.status === "completed" && !again)
    return (
      <div className={box + " flex items-center gap-3"}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">Made with your car</div>
          <div className="truncate text-[12px] text-muted">
            {ad.inputs.seconds ?? c.seconds}s render with your real offer on top. Downloads use it.{job.direction ? ` · ${job.mode === "own" ? "Your prompt" : "Your notes"}: “${job.direction}”` : ""}
          </div>
        </div>
        <button onClick={() => setAgain(true)} disabled={busy} className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-bg-2 hover:text-ink">
          <RotateCcw className="h-3.5 w-3.5" /> Redo
        </button>
      </div>
    );

  return (
    <div className={box}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue/10 text-blue">
          <Film className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">{running ? "Filming your car…" : custom ? "Your own prompt" : "This preview is a sample"}</div>
          <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
            {running
              ? `Higgsfield is rendering ${c.seconds}s of ${c.name} with your car. This usually takes a few minutes. You can leave this page.`
              : avail?.demo
                ? "Demo mode: the sample comes back instead of your car."
                : `Render it with ${ad.inputs.vehicleName || "your car"}: ${c.seconds}s with sound. Your offer is added on top, never baked in.`}
          </div>
        </div>
      </div>
      {!running && (
        <div className="mt-3">
          {!showPrompt ? (
            <button onClick={() => setShowPrompt(true)} className="flex items-center gap-1.5 text-[12.5px] font-medium text-blue hover:underline">
              <PenLine className="h-3.5 w-3.5" /> Add a text prompt (optional)
            </button>
          ) : (
            <div className="rounded-2xl border border-line p-3">
              {custom && !!ad.inputs.refThumbs?.length && (
                <div className="mb-2 flex items-center gap-1.5">
                  {ad.inputs.refThumbs.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt={`Reference ${i + 1}`} className="h-10 w-10 rounded-lg border border-line object-cover" />
                  ))}
                  <span className="text-[11.5px] text-muted">your reference images, reused on redo</span>
                </div>
              )}
              <div className={clsx("flex items-center justify-between gap-2", custom && "hidden")}>
                <div className="inline-flex rounded-full border border-line p-0.5 text-[12px] font-medium">
                  {(
                    [
                      ["add", "Add to template"],
                      ["own", "Write your own"],
                    ] as const
                  ).map(([m, l]) => (
                    <button key={m} onClick={() => setMode(m)} className={clsx("rounded-full px-3 py-1 transition", mode === m ? "bg-ink text-white" : "text-muted hover:text-ink")}>
                      {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setShowPrompt(false);
                    setDirection("");
                    setMode("add");
                  }}
                  className="text-[12px] text-muted hover:text-ink"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value.slice(0, 700))}
                rows={3}
                placeholder={
                  mode === "add"
                    ? "e.g. Make it golden hour, add a slow-motion drift and end on the car parked by the lake."
                    : "e.g. Night drive through downtown, neon reflections, rolling shots from the side, slow push-in on the grille at the end."
                }
                className="mt-2 w-full resize-none rounded-xl border border-line-2 bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-blue"
              />
              <div className="mt-1 text-[11.5px] text-muted">
                {mode === "add"
                  ? "Keeps this template's look and shots, and follows your notes on top."
                  : `Replaces the template's shots with yours. Still films your car in this template's location, ${c.seconds}s with sound.`}{" "}
                Your offer is always added on top, never baked in.
              </div>
            </div>
          )}
        </div>
      )}
      {!running && (
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {TIERS.map((q) => (
            <button
              key={q.id}
              onClick={() => setTier(q.id)}
              title={q.blurb}
              className={clsx(
                "rounded-xl border px-2.5 py-2 text-left transition",
                tier === q.id ? "border-blue bg-blue/[.05] shadow-[0_0_0_3px_rgba(47,107,255,.1)]" : "border-line hover:border-ink/20"
              )}
            >
              <div className="text-[12.5px] font-semibold">{q.label}</div>
              <div className="text-[11.5px] tabular-nums text-muted">
                {q.resolution}
              </div>
            </button>
          ))}
        </div>
      )}
      {!running && <div className="mt-1.5 text-[11.5px] text-muted">{chosen.blurb}</div>}
      {!running && (
        <Button className="mt-3 w-full" onClick={start} disabled={busy || !avail}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Make it with my car
        </Button>
      )}
      {running && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue/25">
          <div className="shimmer h-full w-full" />
        </div>
      )}
      {(err || job?.status === "failed") && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err ?? job?.error ?? "The render failed. Try again."}</div>}
    </div>
  );
}
