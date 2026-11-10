"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { photoJpeg } from "@/lib/ad/runtime";
import type { ClipJob, Dealer } from "@/lib/workspace";

type Avail = { available: boolean; demo?: boolean; usd?: number | null } | null;

/** Our stock cars, and photos whose file name says they're already angled, need no front view. */
export const needsFront = (src: string) => {
  if (!src || src.startsWith("/cars/")) return false;
  const name = decodeURIComponent(src).toLowerCase();
  return !/angular|three-?quarter|3-?4-?front|front-?3-?4|frontquarter|front-?angle|34front/.test(name);
};

/** An unbranded front-3/4 stand-in of the same body type, for previews. */
export function sampleCar(name = "") {
  const n = name.toLowerCase();
  if (/ridgeline|truck|pickup|f-?1[05]0|silverado|sierra|ram\b|tacoma|tundra|frontier|ranger|colorado|canyon|gladiator|maverick|santa cruz/.test(n)) return "/cars/truck.jpg";
  if (/prologue|\bev\b|electric|ioniq|bolt|mach-e|model [3sxy]|bz4x|\bid\.|lyriq|equinox ev|blazer ev/.test(n)) return "/cars/ev.jpg";
  if (/cr-?v|hr-?v|pilot|passport|odyssey|suv|highlander|rav4|4runner|sequoia|grand highlander|tahoe|suburban|explorer|escape|bronco|edge|expedition|equinox|traverse|blazer|trailblazer|tucson|santa fe|palisade|sorento|telluride|sportage|cx-|forester|outback|ascent|crosstrek|wrangler|cherokee|rogue|pathfinder|murano|kicks|atlas|tiguan|x[1-7]\b|q[3-8]\b|gl[abcse]|rx\b|nx\b|van|sienna|pacifica|carnival/.test(n)) return "/cars/suv.jpg";
  return "/cars/sedan.jpg";
}

/**
 * Front three-quarter views of real dealer cars, made only when they're about
 * to be used. Previews show an unbranded sample car; Generate (or a rolling
 * clip) calls `ensure()`, which makes the chosen car's front view once — one
 * Higgsfield image edit, cached on the dealer — and returns the photo to use.
 */
export function useFront(dealer: Dealer, patchDealer: (p: Partial<Dealer>) => void) {
  const src = dealer.inputs.vehicleImage;
  const job = dealer.fronts?.[src];
  const done = job?.status === "completed" && job.url ? job.url : undefined;
  const [avail, setAvail] = useState<Avail>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(dealer);
  useEffect(() => {
    latest.current = dealer;
  });

  useEffect(() => {
    let alive = true;
    fetch("/api/front", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Avail) => alive && setAvail(d))
      .catch(() => alive && setAvail({ available: false }));
    return () => {
      alive = false;
    };
  }, []);

  // photos from the specials pages are already shot front three-quarter
  const wanted = needsFront(src) && !dealer.inputs.angled && !dealer.frontOff && !!avail?.available;
  /** What the spots draw now: the real front view if made, else a sample car (or the photo when no front view will be made). */
  const preview = done && !dealer.frontOff ? done : wanted ? sampleCar(dealer.inputs.vehicleName) : src;

  const save = (key: string, j: ClipJob) => patchDealer({ fronts: { ...(latest.current.fronts ?? {}), [key]: j } });

  /** The photo to put in a finished ad, making the front view first if it's needed. */
  const ensure = async (force = false): Promise<string> => {
    const key = latest.current.inputs.vehicleImage;
    const have = latest.current.fronts?.[key];
    if (!force && have?.status === "completed" && have.url) return latest.current.frontOff ? key : have.url;
    if (!wanted && !force) return key;
    setBusy(true);
    setError(null);
    try {
      const photo = await photoJpeg(key);
      if (!photo) throw new Error("We couldn't load this car's photo.");
      const fd = new FormData();
      fd.append("photo", photo, "car.jpg");
      const r = await fetch("/api/front", { method: "POST", body: fd });
      const d = (await r.json()) as { requestId?: string; error?: string };
      if (!r.ok || !d.requestId) throw new Error(d.error ?? "Couldn't start the front view");
      const j: ClipJob = { requestId: d.requestId, status: "queued", startedAt: Date.now() };
      save(key, j);
      // usually ~20 s; give up after 2 minutes and use the original photo
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const s = (await fetch(`/api/front?id=${d.requestId}`, { cache: "no-store" }).then((x) => x.json())) as Partial<ClipJob> & { error?: string };
        if (s.status === "completed" && s.url) {
          save(key, { ...j, status: "completed", url: s.url });
          return s.url;
        }
        if (s.status === "failed") {
          save(key, { ...j, status: "failed", error: s.error });
          throw new Error(s.error ?? "The front view failed");
        }
      }
      throw new Error("The front view is taking too long");
    } catch (e) {
      setError(`${(e as Error).message} — used the original photo instead.`);
      return key;
    } finally {
      setBusy(false);
    }
  };

  return { avail, preview, done, wanted, busy, error, ensure };
}

/** One line under the car picker explaining what the preview car is and what Generate will do. */
export function FrontNote({ dealer, front, patchDealer }: { dealer: Dealer; front: ReturnType<typeof useFront>; patchDealer: (p: Partial<Dealer>) => void }) {
  const src = dealer.inputs.vehicleImage;
  if (!front.avail || !needsFront(src) || dealer.inputs.angled) return null;
  const name = dealer.inputs.vehicleName || "your car";
  const row = "mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-bg-2/70 px-4 py-2.5 text-[13px]";

  if (front.busy)
    return (
      <div className={row + " text-ink-2"}>
        <Loader2 className="h-4 w-4 animate-spin text-blue" /> Making a front 3/4 view of {name}…
      </div>
    );
  if (front.error) return <div className={row + " text-red-700"}>{front.error}</div>;
  if (!front.avail.available) return null;
  if (dealer.frontOff)
    return (
      <div className={row + " text-muted"}>
        Using your original photo.
        <button onClick={() => patchDealer({ frontOff: false })} className="font-medium text-ink underline underline-offset-4 hover:text-blue">
          Use a front 3/4 view instead
        </button>
      </div>
    );
  if (front.done)
    return (
      <div className={row}>
        <Check className="h-4 w-4 text-emerald-600" />
        <span className="text-ink-2">Front 3/4 view of {name} is ready and in every spot.</span>
        <span className="ml-auto flex items-center gap-3">
          <button onClick={() => front.ensure(true)} className="flex items-center gap-1 font-medium text-muted hover:text-ink">
            <RotateCcw className="h-3.5 w-3.5" /> Redo
          </button>
          <button onClick={() => patchDealer({ frontOff: true })} className="font-medium text-muted hover:text-ink">
            Use original photo
          </button>
        </span>
      </div>
    );
  return (
    <div className={row + " text-ink-2"}>
      Previews show a sample car. When you generate, {name} is added facing the camera (once per car).
      <button onClick={() => patchDealer({ frontOff: true })} className="ml-auto font-medium text-muted hover:text-ink">
        Use original photo
      </button>
    </div>
  );
}
