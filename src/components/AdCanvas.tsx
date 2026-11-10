"use client";

import { useEffect, useRef, useState } from "react";
import type { Template } from "@/lib/ad/catalog";
import type { Assets } from "@/lib/ad/draw";
import {
  AdContext, baseAssets, drawFrame, makePlateVideo, ownAudio, resolveFor, scheduleBeat, stillPlate, waitForVideo,
} from "@/lib/ad/runtime";

/**
 * Play with sound when allowed. Browsers block audio until the visitor has
 * clicked, tapped or typed on the page, so a blocked play falls back to muted
 * and is unmuted on that first interaction — mid-preview, no re-hover needed.
 */
const blocked = new Set<HTMLVideoElement>();
let soundUnlocked = false;
const listeners = new Set<(b: boolean) => void>();
const notify = () => listeners.forEach((f) => f(!soundUnlocked && blocked.size > 0));

function unlock() {
  soundUnlocked = true;
  for (const v of blocked) {
    v.muted = false;
    if (!v.paused) v.play().catch(() => {});
  }
  blocked.clear();
  notify();
}
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true, once: true });
}

/** True while a preview wants sound but the browser is waiting for a first click. */
export function useSoundBlocked() {
  const [b, setB] = useState(false);
  useEffect(() => {
    listeners.add(setB);
    return () => {
      listeners.delete(setB);
    };
  }, []);
  return b;
}

function playVideo(v: HTMLVideoElement) {
  v.play().catch(() => {
    if (v.muted) return;
    v.muted = true;
    blocked.add(v);
    notify();
    v.play().catch(() => {});
  });
}

type Props = {
  tpl: Template;
  ctx: AdContext;
  /** still = one poster frame; play = loop in real time. */
  playing: boolean;
  className?: string;
  /** Render resolution (CSS px width). Height follows 9:16. */
  width?: number;
  sound?: boolean;
  onTime?: (t: number, dur: number) => void;
  /** Seek request in seconds; applied once when it changes. */
  seek?: number | null;
  stillAt?: number;
  lazy?: boolean;
  /** Cap on device-pixel ratio — library thumbnails use less memory. */
  maxDpr?: number;
};

/**
 * One ad, drawn live. The library renders ~200 of these as stills, so a card
 * only draws once it scrolls into view and only animates while hovered.
 */
export function AdCanvas({ tpl, ctx, playing, className, width = 270, sound = false, onTime, seek, stillAt, lazy = true, maxDpr = 2 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const assetsRef = useRef<Omit<Assets, "plate"> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clock = useRef({ start: 0, offset: 0 });
  const audio = useRef<{ ac: AudioContext; gain: GainNode } | null>(null);
  const resolved = resolveFor(tpl, ctx);
  const [ready, setReady] = useState(false);
  // bumps every time a new set of images lands, so stills redraw with the new car/logo
  const [assetsVersion, setAssetsVersion] = useState(0);

  useEffect(() => {
    if (!lazy || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [lazy]);

  // size the backing store
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    c.width = Math.round(width * dpr);
    c.height = Math.round((width * 16 * dpr) / 9);
  }, [width, maxDpr]);

  // load images whenever the brand / offer / vehicle changes
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    baseAssets(ctx).then((a) => {
      if (!alive) return;
      assetsRef.current = a;
      setReady(true);
      setAssetsVersion((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, [visible, ctx.brand.logo, ctx.ad.vehicleImage, ctx]);

  // still frame
  useEffect(() => {
    if (!visible || !ready || playing || !ref.current) return;
    const t = stillAt ?? tpl.poster;
    let alive = true;
    (async () => {
      const plate = await stillPlate(resolved.plate, t);
      if (!alive || !ref.current || !assetsRef.current) return;
      drawFrame(ref.current, tpl, ctx, { ...assetsRef.current, plate }, t, resolved);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready, playing, tpl, ctx, stillAt, assetsVersion]);

  // live playback
  useEffect(() => {
    if (!visible || !ready || !playing || !ref.current) return;
    let raf = 0;
    let alive = true;
    const canvas = ref.current;
    let video: HTMLVideoElement | null = null;
    if (resolved.plate) {
      video = videoRef.current?.src.endsWith(resolved.plate) ? videoRef.current : makePlateVideo(resolved.plate, !sound);
      videoRef.current = video;
      video.muted = !sound;
    }
    const startBeat = (from: number) => {
      if (!sound || ownAudio(tpl) || (video && !resolved.clip)) return;
      audio.current?.ac.close();
      const ac = new AudioContext();
      const gain = scheduleBeat(ac, ac.destination, ac.currentTime + 0.02, Math.max(0.1, resolved.dur - from), tpl.id.length);
      audio.current = { ac, gain };
    };

    (async () => {
      if (video) await waitForVideo(video);
      if (!alive) return;
      clock.current.start = performance.now() - clock.current.offset * 1000;
      if (video) {
        video.currentTime = Math.min(clock.current.offset, video.duration || 0);
        playVideo(video);
      }
      startBeat(clock.current.offset);
      const tick = () => {
        if (!alive) return;
        let t = (performance.now() - clock.current.start) / 1000;
        if (t >= resolved.dur) {
          // loop
          clock.current.start = performance.now();
          t = 0;
          if (video) {
            video.currentTime = 0;
            playVideo(video);
          }
          startBeat(0);
        }
        if (video && !video.ended && video.duration && t < video.duration && Math.abs(video.currentTime - t) > 0.2) {
          video.currentTime = t;
        }
        clock.current.offset = t;
        if (assetsRef.current) drawFrame(canvas, tpl, ctx, { ...assetsRef.current, plate: video }, t, resolved);
        onTime?.(t, resolved.dur);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      video?.pause();
      if (video && blocked.delete(video)) notify();
      audio.current?.ac.close();
      audio.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ready, playing, tpl, ctx, sound]);

  // reset to start when stopped (cards restart on next hover)
  useEffect(() => {
    if (!playing && !onTime) clock.current.offset = 0;
  }, [playing, onTime]);

  // external seek
  useEffect(() => {
    if (seek == null) return;
    clock.current.offset = seek;
    clock.current.start = performance.now() - seek * 1000;
    if (videoRef.current && videoRef.current.duration) videoRef.current.currentTime = Math.min(seek, videoRef.current.duration);
    if (!playing && ref.current && assetsRef.current) {
      const c = ref.current;
      const a = assetsRef.current;
      (async () => {
        const plate = await stillPlate(resolved.plate, seek);
        drawFrame(c, tpl, ctx, { ...a, plate }, seek, resolved);
        onTime?.(seek, resolved.dur);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek]);

  return <canvas ref={ref} className={className} style={{ width: "100%", height: "auto", aspectRatio: "9 / 16", display: "block" }} />;
}
