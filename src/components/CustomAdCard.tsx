"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, PenLine, Wand2, X } from "lucide-react";
import clsx from "clsx";
import { TIERS, type TierId } from "@/lib/cinematic";
import type { AdInputs } from "@/lib/types";
import { Button } from "./ui";

const MAX_REFS = 4;
const IDEAS = [
  "Driving along a coastal highway at golden hour, waves crashing below, drone shots then a slow push-in on the grille",
  "Parked in front of our dealership at night, neon reflections on wet pavement, slow orbit around the car",
  "Climbing a snowy mountain road, headlights on, close-ups of the wheels kicking up snow",
  "Downtown city streets at sunset, rolling shots from the side, ending parked under the skyline",
];

/** A reference image, downsized for upload (≤1600px JPEG) with a small thumbnail to keep on the ad. */
async function prepare(file: File): Promise<{ blob: Blob; thumb: string; url: string }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("That file isn't an image we can read."));
    i.src = url;
  });
  const draw = (max: number, q: number) => {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };
  const blob = await new Promise<Blob>((res) => draw(1600, 0.88).toBlob((b) => res(b!), "image/jpeg", 0.88));
  const thumb = draw(160, 0.7).toDataURL("image/jpeg", 0.7);
  return { blob, thumb, url };
}

/**
 * "Create your own" on Viral ads: the dealer describes the place, background and
 * shots, adds reference images, and their car is filmed there with the real
 * offer on top — no template needed.
 */
export function CustomAdCard({
  inputs,
  carPicked,
  available,
  onMake,
}: {
  inputs: AdInputs;
  carPicked: boolean;
  available: boolean | null;
  onMake: (o: { prompt: string; refs: Blob[]; thumbs: string[]; seconds: number; tier: TierId }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<{ blob: Blob; thumb: string; url: string }[]>([]);
  const [seconds, setSeconds] = useState(10);
  const [tier, setTier] = useState<TierId>("good");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => refs.forEach((r) => URL.revokeObjectURL(r.url)), [refs]);

  const add = async (files: FileList | File[]) => {
    setErr(null);
    const list = [...files].filter((f) => /^image\//.test(f.type)).slice(0, MAX_REFS - refs.length);
    if (!list.length) return setErr("Add JPG, PNG or WebP images.");
    try {
      const prepped = await Promise.all(list.map(prepare));
      setRefs((r) => [...r, ...prepped].slice(0, MAX_REFS));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const make = async () => {
    setErr(null);
    if (prompt.trim().length < 10) return setErr("Describe the place and the shots in a sentence or two.");
    setBusy(true);
    try {
      await onMake({ prompt: prompt.trim(), refs: refs.map((r) => r.blob), thumbs: refs.map((r) => r.thumb), seconds, tier });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) add(e.dataTransfer.files);
      }}
      className={clsx("rounded-[24px] border bg-white p-3 transition sm:p-4", drag ? "border-blue shadow-[0_0_0_4px_rgba(59,123,255,.15)]" : "border-line")}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          <PenLine className="h-3.5 w-3.5" /> Or create your own: describe it, add reference images
        </span>
        <span className="text-[12px] text-muted">{carPicked ? `Filmed with the ${inputs.vehicleName}` : "Pick a car above first"}</span>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, 700))}
        rows={3}
        placeholder="Where should your car be, and what should the camera do? e.g. Driving along a coastal highway at golden hour, drone shots, then a slow push-in on the grille."
        className="w-full resize-none rounded-2xl border border-line-2 bg-transparent px-3.5 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted/70 focus:border-blue"
      />
      {!prompt && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {IDEAS.map((i) => (
            <button key={i} onClick={() => setPrompt(i)} className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted transition hover:border-ink/20 hover:text-ink">
              {i.split(",")[0]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {refs.map((r, i) => (
          <span key={r.url} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
            <button
              onClick={() => setRefs((x) => x.filter((_, k) => k !== i))}
              className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
              aria-label="Remove reference"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {refs.length < MAX_REFS && (
          <button onClick={() => file.current?.click()} className="flex h-16 items-center gap-2 rounded-xl border border-dashed border-line-2 px-3 text-[12.5px] text-muted transition hover:border-blue hover:text-ink">
            <ImagePlus className="h-4 w-4" />
            <span className="text-left leading-tight">
              Reference images
              <span className="block text-[11px]">a place, background or look · up to {MAX_REFS} · or drop them here</span>
            </span>
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line p-0.5 text-[12px] font-medium">
          {[5, 10, 15].map((n) => (
            <button key={n} onClick={() => setSeconds(n)} className={clsx("rounded-full px-3 py-1 transition", seconds === n ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {n}s
            </button>
          ))}
        </div>
        <select value={tier} onChange={(e) => setTier(e.target.value as TierId)} className="h-8 rounded-full border border-line bg-transparent px-3 text-[12px] text-ink-2 outline-none" title="Quality">
          {TIERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} · {t.resolution}
            </option>
          ))}
        </select>
        <span className="text-[11.5px] text-muted">Your real offer and fine print are added on top.</span>
        <Button className="ml-auto h-10" onClick={make} disabled={busy || !carPicked || available === false}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Make my ad
        </Button>
      </div>
      {available === false && <div className="mt-2 text-[12px] text-muted">Add your Higgsfield key in /admin to film custom ads.</div>}
      {err && <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err}</div>}
    </div>
  );
}
