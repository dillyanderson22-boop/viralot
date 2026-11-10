"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clapperboard, Film, Loader2, RotateCcw, Sparkles, Trash2, Wand2 } from "lucide-react";
import clsx from "clsx";
import { TEMPLATES, byId, type Template } from "@/lib/ad/catalog";
import { clipReady, composeClipFrame, type AdContext } from "@/lib/ad/runtime";
import { BADGE, offerDetailFor, parseOffer, withDetail, type SpotFields } from "@/lib/spot";
import { ScenePicker } from "./ScenePicker";
import type { AdInputs } from "@/lib/types";
import type { ClipJob, Dealer, PlanItem, SpotDraft } from "@/lib/workspace";
import { AdCanvas } from "./AdCanvas";
import { DealPicker } from "./DealPicker";
import { CarPicker } from "./CarPicker";
import { FrontNote, useFront } from "./FrontView";
import { Portal } from "./Portal";
import { Button, SectionLabel, ease } from "./ui";

const STYLES = TEMPLATES.filter((t) => t.category === "Pro spot");

/** Which copy fields each layout actually shows. */
const FIELDS: Record<string, (keyof SpotFields)[]> = {
  spotDiagonal: ["kicker", "lines", "big", "unit", "badge", "cta", "disclaimer"],
  spotPrice: ["kicker", "lines", "big", "unit", "detail", "cta", "disclaimer"],
  spotEvent: ["kicker", "lines", "cta", "disclaimer"],
  spotSpotlight: ["lines", "big", "cta", "disclaimer"],
  spotMinimal: ["kicker", "cta", "disclaimer"],
};
const LABEL: Partial<Record<keyof SpotFields, string>> = {
  kicker: "Kicker",
  lines: "Headline (one line per row)",
  big: "Big number",
  unit: "Unit",
  detail: "Terms line",
  badge: "Badge",
  cta: "Button",
  disclaimer: "Fine print",
};

const freshDraft = (offer: string): SpotDraft => ({
  styles: ["offer-headline", "price-hero"],
  focus: "offer-headline",
  scene: "city",
  offer,
  edits: {},
  clips: {},
});

export function SpotStudio({
  dealer,
  setInputs,
  setDraft,
  patchDealer,
  onGenerate,
  onImport,
}: {
  dealer: Dealer;
  setInputs: (i: AdInputs) => void;
  setDraft: (d: SpotDraft) => void;
  patchDealer: (p: Partial<Dealer>) => void;
  onGenerate: (plan: PlanItem[]) => void;
  onImport?: () => void;
}) {
  const [manual, setManual] = useState(false);
  const inputs = dealer.inputs;
  const brand = dealer.brand;
  const styles = STYLES;
  // edits belong to the offer they were written for
  const draft: SpotDraft = dealer.spot && dealer.spot.offer === inputs.offer ? dealer.spot : { ...freshDraft(inputs.offer), ...(dealer.spot ? { styles: dealer.spot.styles, focus: dealer.spot.focus, scene: dealer.spot.scene, clips: dealer.spot.clips } : {}) };
  const patch = (p: Partial<SpotDraft>) => setDraft({ ...draft, ...p });
  const focus = byId(draft.focus) ?? styles[0];

  const front = useFront(dealer, patchDealer);
  const [preparing, setPreparing] = useState(false);
  const clipKey = (tid: string) => `${tid}|${inputs.vehicleImage}|${draft.scene}`;
  const clipFor = (tid: string): ClipJob | undefined => draft.clips[clipKey(tid)];
  /** `image` is the car to draw: the preview car while browsing, the real one in finished ads. */
  const adFor = (tid: string, image = front.preview): AdInputs => {
    const c = clipFor(tid);
    const customScene = dealer.scenes?.find((sc) => sc.id === draft.scene);
    return { ...inputs, vehicleImage: image, spot: { ...inputs.spot, ...draft.edits[tid], scene: draft.scene, customScene }, clip: c?.status === "completed" ? c.url : undefined };
  };
  const ctxFor = (tid: string): AdContext => ({ brand, ad: adFor(tid) });
  const focusCtx = useMemo(() => ctxFor(focus.id), [focus.id, inputs, draft, brand, front.preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const detail = offerDetailFor(brand, inputs.offer);
  const parsed = withDetail(parseOffer(inputs.offer, inputs.vehicleName, brand.name), detail);
  const idea = brand.ideas?.find((i) => i.offer.trim().toLowerCase() === inputs.offer.trim().toLowerCase());
  const fields: SpotFields = { badge: BADGE[parsed.kind], ...parsed, ...((focus.params.spot as Partial<SpotFields>) ?? {}), ...(inputs.spot ?? {}), ...(draft.edits[focus.id] ?? {}) } as SpotFields;
  const setField = (k: keyof SpotFields, v: string) => {
    const val = k === "lines" ? v.split("\n").map((l) => l.toUpperCase()).filter((l, i, a) => l.trim() || i < a.length - 1).slice(0, 3) : v;
    patch({ edits: { ...draft.edits, [focus.id]: { ...draft.edits[focus.id], [k]: val } } });
  };
  const edited = Object.keys(draft.edits[focus.id] ?? {}).length > 0;

  const toggleStyle = (t: Template) => {
    const on = draft.styles.includes(t.id);
    if (on && draft.focus !== t.id) return patch({ focus: t.id });
    patch({ styles: on ? draft.styles.filter((x) => x !== t.id) : [...draft.styles, t.id], focus: t.id });
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-40 pt-8 sm:px-8 sm:pt-12">
      <SectionLabel>Offer spots</SectionLabel>
      <h1 className="mt-4 max-w-[760px] text-[34px] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[48px]">Polished offer ads, built from your real offers.</h1>
      <p className="mt-3 max-w-[620px] text-[15px] text-muted">
        Dealer-grade spots in {brand.name}&apos;s colours: your car on a real street, the offer set big, compliant fine print. Edit every word, then add an AI rolling clip if you want real driving footage.
      </p>

      <div className="mt-6 rounded-[24px] border border-line bg-white p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Pick the car and its offers</span>
          <button onClick={() => setManual((m) => !m)} className="text-[12px] font-medium text-muted hover:text-ink">
            {manual ? "Hide" : "Offer without a specific car"}
          </button>
        </div>
        <CarPicker brand={brand} inventory={dealer.inventory} value={inputs} onChange={setInputs} onImport={onImport} />
        {manual && (
          <div className="mt-3 border-t border-line pt-3">
            <DealPicker brand={brand} value={inputs} onChange={(p) => setInputs({ ...inputs, ...p, carId: undefined, vin: undefined, stock: undefined, description: undefined })} />
          </div>
        )}
      </div>
      <FrontNote dealer={dealer} front={front} patchDealer={patchDealer} />

      {(detail || idea) && (
        <div className="mt-3 flex flex-wrap items-start gap-3 rounded-2xl bg-blue/[.05] px-4 py-3 text-[13px]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
          <div className="min-w-0 flex-1">
            {detail && (
              <div className="text-ink-2">
                Read from the site{detail.source === "banner" ? " (off a banner image)" : ""}
                {[detail.term, detail.dueAtSigning && `${detail.dueAtSigning} due at signing`, detail.apr && `${detail.apr} APR`, detail.expires && `ends ${detail.expires}`].filter(Boolean).length > 0 && (
                  <>: {[detail.term, detail.dueAtSigning && `${detail.dueAtSigning} due at signing`, detail.apr && `${detail.apr} APR`, detail.expires && `ends ${detail.expires}`].filter(Boolean).join(" · ")}</>
                )}
                {detail.disclaimer ? ". Its fine print is already in the ad." : "."}
              </div>
            )}
            {idea && (idea.spotStyle || idea.hook) && (
              <div className="mt-0.5 text-muted">
                Claude suggests {idea.spotStyle ? <b className="font-medium text-ink">{byId(idea.spotStyle)?.name ?? idea.spotStyle}</b> : "these"}
                {idea.hook ? <> · hook: “{idea.hook}”</> : null}
              </div>
            )}
          </div>
          {idea?.spotStyle && byId(idea.spotStyle) && !draft.styles.includes(idea.spotStyle) && (
            <button
              onClick={() => patch({ styles: [...draft.styles, idea.spotStyle!], focus: idea.spotStyle! })}
              className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-white"
            >
              Use it
            </button>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:gap-12">
        {/* live preview */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="relative mx-auto w-full max-w-[380px] overflow-hidden rounded-[28px] bg-ink shadow-[0_40px_90px_-30px_rgba(10,11,13,.45)]">
            <AdCanvas key={focus.id} tpl={focus} ctx={focusCtx} playing width={380} lazy={false} />
            {clipFor(focus.id)?.status === "completed" && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                <Film className="h-3 w-3" /> AI rolling clip
              </span>
            )}
          </div>
          <div className="mx-auto mt-3 max-w-[380px] text-center text-[12.5px] text-muted">
            {focus.name} · {focus.why.split(".")[0]}.
          </div>
        </div>

        <div className="min-w-0 space-y-8">
          {/* styles */}
          <section>
            <Head n={1} title="Pick styles" sub="Each selected style becomes its own ad. Click one to edit it." />
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {styles.map((t) => {
                const on = draft.styles.includes(t.id);
                const focused = draft.focus === t.id;
                return (
                  <motion.button
                    key={t.id}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => toggleStyle(t)}
                    className="text-left"
                  >
                    <div
                      className={clsx(
                        "relative overflow-hidden rounded-2xl bg-bg-2 transition",
                        focused ? "ring-2 ring-blue ring-offset-2" : on ? "ring-2 ring-ink/70 ring-offset-2" : "ring-1 ring-line hover:ring-ink/20"
                      )}
                    >
                      <AdCanvas tpl={t} ctx={ctxFor(t.id)} playing={false} width={140} maxDpr={2} />
                      <span
                        className={clsx(
                          "absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 transition",
                          on ? "border-blue bg-blue text-white" : "border-white/90 bg-black/20"
                        )}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                    </div>
                    <div className={clsx("mt-2 truncate text-[12.5px] font-medium", focused ? "text-blue" : "text-ink")}>{t.name}</div>
                  </motion.button>
                );
              })}
            </div>
          </section>

          {/* scene */}
          <section>
            <Head n={2} title="Choose the background" sub="Your car is fitted to each one: on the road, in its light. Or generate your own." />
            <ScenePicker
              selected={draft.scene}
              onSelect={(id) => patch({ scene: id })}
              scenes={dealer.scenes ?? []}
              setScenes={(scenes) => patchDealer({ scenes })}
              job={dealer.sceneJob}
              setJob={(sceneJob) => patchDealer({ sceneJob })}
            />
          </section>

          {/* copy */}
          <section>
            <div className="flex items-end justify-between gap-4">
              <Head n={3} title={`Edit the words · ${focus.name}`} sub="Pre-filled from your offer. Nothing is added that isn't in it." />
              {edited && (
                <button
                  onClick={() => {
                    const rest = { ...draft.edits };
                    delete rest[focus.id];
                    patch({ edits: rest });
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(FIELDS[focus.engine] ?? []).map((k) => {
                const value = k === "lines" ? fields.lines.join("\n") : String(fields[k] ?? "");
                const wide = k === "lines" || k === "disclaimer" || k === "detail";
                return (
                  <label key={k} className={clsx("block", wide && "sm:col-span-2")}>
                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{LABEL[k]}</span>
                    {k === "lines" || k === "disclaimer" ? (
                      <textarea
                        value={value}
                        onChange={(e) => setField(k, e.target.value)}
                        rows={k === "lines" ? 3 : 2}
                        className={clsx(
                          "w-full resize-none rounded-xl border border-line-2 bg-white px-3.5 py-2.5 text-[14px] leading-snug outline-none transition focus:border-blue focus:shadow-[0_0_0_4px_rgba(47,107,255,.12)]",
                          k === "lines" && "font-semibold uppercase tracking-[-0.01em]"
                        )}
                      />
                    ) : (
                      <input
                        value={value}
                        onChange={(e) => setField(k, e.target.value)}
                        placeholder={k === "big" ? "e.g. $319" : k === "unit" ? "e.g. /MO" : k === "detail" ? "e.g. for 36 months · $2,999 due at signing" : ""}
                        className="h-11 w-full rounded-xl border border-line-2 bg-white px-3.5 text-[14px] outline-none transition focus:border-blue focus:shadow-[0_0_0_4px_rgba(47,107,255,.12)]"
                      />
                    )}
                  </label>
                );
              })}
            </div>
            {(parsed.kind === "lease" || parsed.kind === "apr") && (
              <p className="mt-3 text-[12.5px] text-muted">Payment and rate ads need full terms in the fine print (term, due at signing, APR, credit tier). Paste your OEM disclaimer above.</p>
            )}
          </section>

          {/* rolling clip */}
          <section>
            <Head n={4} title="Rolling clip (optional)" sub="Turn the still scene into real driving footage with your Higgsfield account." />
            <ClipPanel
              key={clipKey(focus.id)}
              tpl={focus}
              ctx={focusCtx}
              job={clipFor(focus.id)}
              prepare={front.ensure}
              onJob={(job) => patch({ clips: job ? { ...draft.clips, [clipKey(focus.id)]: job } : omit(draft.clips, clipKey(focus.id)) })}
            />
          </section>
        </div>
      </div>

      <Portal>
        <AnimatePresence>
          {draft.styles.length > 0 && (
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 lg:pl-[264px]"
            >
              <div className="ai-ring flex w-full max-w-[640px] items-center gap-3 rounded-full border border-line bg-white/90 py-2 pl-3 pr-2 shadow-[0_30px_80px_-20px_rgba(10,11,13,.35)] backdrop-blur-xl">
                <div className="flex -space-x-2">
                  {draft.styles.slice(0, 6).map((id) => {
                    const t = byId(id);
                    return (
                      <div key={id} className="h-10 w-[23px] overflow-hidden rounded-md border-2 border-white bg-bg-2 shadow">
                        {t && <AdCanvas tpl={t} ctx={ctxFor(id)} playing={false} width={24} lazy={false} />}
                      </div>
                    );
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">
                    {draft.styles.length} offer spot{draft.styles.length > 1 ? "s" : ""}
                  </div>
                  <div className="truncate text-[12px] text-muted">{inputs.offer}</div>
                </div>
                <Button
                  onClick={async () => {
                    setPreparing(true);
                    // the real car goes in only now, facing the camera (made once per car)
                    const image = await front.ensure();
                    setPreparing(false);
                    onGenerate(draft.styles.filter((id) => byId(id)).map((templateId) => ({ templateId, inputs: adFor(templateId, image) })));
                  }}
                  disabled={preparing}
                  className="h-11"
                >
                  {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {preparing ? "Adding your car…" : "Generate"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

function omit<T>(o: Record<string, T>, k: string) {
  const r = { ...o };
  delete r[k];
  return r;
}

function Head({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11.5px] font-semibold text-white">{n}</span>
      <div>
        <div className="text-[16px] font-semibold tracking-[-0.02em]">{title}</div>
        <div className="text-[13px] text-muted">{sub}</div>
      </div>
    </div>
  );
}

type Avail = { available: boolean; demo?: boolean; credits?: number | null } | null;

function ClipPanel({ tpl, ctx, job, onJob, prepare }: { tpl: Template; ctx: AdContext; job?: ClipJob; onJob: (j: ClipJob | null) => void; prepare: () => Promise<string> }) {
  const [model, setModel] = useState<"seedance" | "kling">("seedance");
  const [direction, setDirection] = useState("");
  const [avail, setAvail] = useState<Avail>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = clipReady(tpl);
  // the exact first frame Higgsfield will animate — shown before any credits are spent
  const [frame, setFrame] = useState<{ blob: Blob; url: string } | null | "none">(null);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let url = "";
    composeClipFrame(tpl, ctx).then((b) => {
      if (!alive) return;
      if (!b) return setFrame("none");
      url = URL.createObjectURL(b);
      setFrame({ blob: b, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ready, tpl, ctx]);
  const onJobRef = useRef(onJob);
  useEffect(() => {
    onJobRef.current = onJob;
  });

  useEffect(() => {
    let alive = true;
    fetch(`/api/clips?model=${model}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Avail) => alive && setAvail(d))
      .catch(() => alive && setAvail({ available: false }));
    return () => {
      alive = false;
    };
  }, [model]);

  // poll a running job
  const running = job && (job.status === "queued" || job.status === "in_progress");
  useEffect(() => {
    if (!running || !job) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/clips?id=${job.requestId}`, { cache: "no-store" });
        const d = (await r.json()) as Partial<ClipJob> & { error?: string };
        if (!alive) return;
        if (!r.ok) {
          // transient? keep polling; auth errors stop it
          if (r.status === 401) onJobRef.current({ ...job, status: "failed", error: d.error ?? "Higgsfield rejected the key" });
          return;
        }
        if (d.status && d.status !== job.status) onJobRef.current({ ...job, status: d.status, url: d.url, error: d.error });
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [running, job]);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      // the clip films the real car: make its front view first (once per car), then compose the frame with it
      const image = await prepare();
      const real = image === ctx.ad.vehicleImage ? (frame && frame !== "none" ? frame.blob : null) : await composeClipFrame(tpl, { ...ctx, ad: { ...ctx.ad, vehicleImage: image } });
      if (!real) throw new Error("This car photo isn't on a clean background, so it can't be placed in a scene. Pick another photo or a stock car.");
      const fd = new FormData();
      fd.append("frame", real, "frame.jpg");
      fd.append("model", model);
      if (direction.trim()) fd.append("direction", direction.trim());
      const r = await fetch("/api/clips", { method: "POST", body: fd });
      const d = (await r.json()) as { requestId?: string; error?: string };
      if (!r.ok || !d.requestId) throw new Error(d.error ?? "Couldn't start the clip");
      onJob({ requestId: d.requestId, status: "queued", startedAt: Date.now() });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const box = "mt-4 rounded-[20px] border border-line bg-white p-4 sm:p-5";
  if (!ready) return <div className={clsx(box, "text-[13.5px] text-muted")}>{tpl.name} is a studio look, so it stays a still scene. Pick another style for driving footage.</div>;
  if (avail && !avail.available)
    return (
      <div className={clsx(box, "text-[13.5px] text-muted")}>
        Add your Higgsfield API key and secret in <a href="/admin" className="font-medium text-ink underline underline-offset-4">/admin</a> to make rolling clips. Without it, spots still look great with the car driving into a still scene.
      </div>
    );

  return (
    <div className={box}>
      <AnimatePresence mode="wait" initial={false}>
        {job?.status === "completed" ? (
          <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <Check className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">Rolling clip is live in this spot</div>
              <div className="text-[12.5px] text-muted">Change the car or scene and you can make a new one.</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onJob(null)}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          </motion.div>
        ) : running ? (
          <motion.div key="run" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="flex items-center gap-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue/10 text-blue">
              <Clapperboard className="h-5 w-5" />
              <span className="absolute inset-0 animate-ping rounded-xl bg-blue/10" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{job!.status === "queued" ? "Queued at Higgsfield…" : "Filming your car…"}</div>
              <Elapsed since={job!.startedAt} />
            </div>
            <Loader2 className="h-4 w-4 animate-spin text-muted" />
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }} className="flex gap-4">
            <div className="w-[72px] shrink-0">
              <div className="aspect-[9/16] overflow-hidden rounded-xl bg-bg-2 ring-1 ring-line">
                {frame && frame !== "none" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={frame.url} alt="First frame" className="h-full w-full object-cover" />
                ) : frame === "none" ? null : (
                  <div className="grid h-full place-items-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted" />
                  </div>
                )}
              </div>
              <div className="mt-1 text-center text-[10.5px] text-muted">Start frame</div>
            </div>
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-full bg-bg-2 p-1">
                {(["seedance", "kling"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={clsx("h-8 rounded-full px-3.5 text-[12.5px] font-medium transition", model === m ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
                  >
                    {m === "seedance" ? "Seedance 2.0" : "Kling 3.0"}
                  </button>
                ))}
              </div>
              <div className="text-[12.5px] text-muted">
                {avail?.demo
                  ? "Demo mode: a sample clip (not your car) comes back."
                  : "8 s · 720p · 1–4 min"}
              </div>
              <Button onClick={start} disabled={busy || !avail || !frame || frame === "none"} size="sm" className="ml-auto">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Make rolling clip
              </Button>
            </div>
            <input
              value={direction}
              onChange={(e) => setDirection(e.target.value.slice(0, 500))}
              placeholder="Optional prompt, e.g. drive through falling autumn leaves, low camera, golden light"
              className="mt-3 h-10 w-full rounded-xl border border-line-2 bg-transparent px-3 text-[13px] outline-none placeholder:text-muted/70 focus:border-blue"
            />
            {(err || job?.status === "failed") && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err ?? job?.error ?? "The clip failed. Try again."}</div>}
            <p className="mt-3 text-[12px] text-muted">
              {frame === "none"
                ? "This car photo isn't on a clean white background, so it can't be placed in a scene. Pick another photo or a stock car."
                : "Your car is placed exactly where this layout puts it, and Higgsfield films it driving. One clip per style, car and scene; it's reused every time you download."}
            </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const s = Math.max(0, Math.round((now - since) / 1000));
  return <div className="text-[12.5px] tabular-nums text-muted">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} elapsed · keep this tab open or come back later</div>;
}
