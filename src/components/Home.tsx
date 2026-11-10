"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Globe, Play, Sparkles, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { CINEMATIC, posterOf, previewOf } from "@/lib/cinematic";
import { Portal } from "./Portal";
import { Wordmark, ease } from "./ui";

/**
 * The storefront. Plays like a film trailer: letterbox bars open on a
 * full-bleed hero, the real template reel runs in tilted phone frames, and the
 * pitch is told in three acts. Dark only; the app itself stays light.
 */


/** Kinetic type: each word rises out of a blur, one after another. */
function Kinetic({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          {/* the gradient sits on each word: background-clip text doesn't reach through animated children */}
          <motion.span
            className={clsx("inline-block", className)}
            initial={{ y: "110%", filter: "blur(10px)", opacity: 0 }}
            animate={{ y: "0%", filter: "blur(0px)", opacity: 1 }}
            transition={{ duration: 1.1, ease, delay: delay + i * 0.09 }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Camera-style timecode that runs from page load. */
function Timecode() {
  const [t, setT] = useState("00:00:00:00");
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const s = (performance.now() - t0) / 1000;
      const p = (n: number) => String(Math.floor(n)).padStart(2, "0");
      setT(`${p(s / 3600)}:${p((s / 60) % 60)}:${p(s % 60)}:${p((s * 24) % 24)}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span className="tabular-nums">{t}</span>;
}

function UrlForm({ onScan, onDemo, big = false }: { onScan: (u: string) => void; onDemo: () => void; big?: boolean }) {
  const [url, setUrl] = useState("");
  const [focus, setFocus] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onScan(url.trim());
      }}
      className="w-full max-w-[600px]"
    >
      <div
        className={clsx(
          "rounded-full border bg-white/[.07] p-1.5 backdrop-blur-2xl transition-all duration-500",
          focus ? "border-white/40 shadow-[0_0_0_6px_rgba(255,255,255,.06),0_30px_80px_-20px_rgba(59,123,255,.5)]" : "border-white/15 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]"
        )}
      >
        <div className="flex items-center gap-2">
          <Globe className="ml-4 h-[18px] w-[18px] shrink-0 text-white/50" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="yourdealership.com"
            className={clsx("min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40", big ? "h-14 text-[17px]" : "h-12 text-[16px]")}
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!url.trim()}
            className={clsx(
              "group flex shrink-0 items-center gap-2 rounded-full bg-white px-5 font-semibold text-black shadow-[0_0_40px_-8px_rgba(255,255,255,.5)] transition hover:scale-[1.02] hover:bg-white disabled:cursor-default sm:px-6",
              big ? "h-14 text-[15px]" : "h-12 text-[14px]"
            )}
          >
            <span className="hidden sm:inline">Make my trailer</span>
            <span className="sm:hidden">Start</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
      <button type="button" onClick={onDemo} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition hover:text-white">
        <Sparkles className="h-3.5 w-3.5" /> or try a demo dealership
      </button>
    </form>
  );
}

/** One template in the reel: a phone-sized frame that plays muted in view and with sound on hover. */
function ReelCard({ id, name, tag, seconds, i, active, onActive }: { id: string; name: string; tag: string; seconds: number; i: number; active: boolean; onActive: (on: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (inView || active) v.play().catch(() => {});
    else v.pause();
  }, [inView, active]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !active;
    if (active) {
      v.currentTime = 0;
      // browsers allow sound only after a click; stay muted until then
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [active]);
  return (
    <motion.div
      ref={box}
      initial={{ opacity: 0, y: 60, rotateY: -18 }}
      whileInView={{ opacity: 1, y: 0, rotateY: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 1.1, ease, delay: (i % 4) * 0.08 }}
      onPointerEnter={() => onActive(true)}
      onPointerLeave={() => onActive(false)}
      onClick={() => onActive(!active)}
      className="group relative w-[220px] shrink-0 snap-center cursor-pointer [perspective:1200px] sm:w-[250px]"
    >
      <div
        className={clsx(
          "relative overflow-hidden rounded-[30px] border bg-black transition-all duration-700 ease-out",
          active ? "-translate-y-3 scale-[1.03] border-white/40 shadow-[0_50px_100px_-30px_rgba(59,123,255,.55)]" : "border-white/10 shadow-[0_40px_80px_-40px_rgba(0,0,0,.9)]"
        )}
      >
        <video ref={ref} src={previewOf(id)} poster={posterOf(id)} muted loop playsInline preload="metadata" className="aspect-[9/16] w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80 backdrop-blur">
          {tag}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white/80 backdrop-blur">
          {active ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </div>
        <div className="pointer-events-none absolute inset-x-4 bottom-4">
          <div className="text-[15px] font-semibold leading-tight tracking-[-0.02em] text-white">{name}</div>
          <div className="mt-0.5 font-mono text-[11px] text-white/55">
            {seconds}s · 9:16 · with sound
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const ACTS = [
  {
    n: "I",
    title: "Paste your link.",
    body: "We read your site the way a shopper does: logo, brand colours, the cars on your lot and the offers you're running this week.",
  },
  {
    n: "II",
    title: "Cast your car.",
    body: "Pick a car and a look. It's filmed in the scene, facing the camera, with real motion and sound. Not a template with a cutout pasted on.",
  },
  {
    n: "III",
    title: "Premiere everywhere.",
    body: "Your real offer lands on the final frames with compliant fine print, plus captions written for TikTok, Reels, Shorts and Facebook.",
  },
];

/** Wide hero on desktop, a vertical cut on phones (picked after mount so only one file loads). */
function useHeroSrc() {
  const [src, setSrc] = useState<{ video: string; poster: string } | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 4/5)");
    const pick = () => setSrc(mq.matches ? { video: "/hero/hero-mobile.mp4", poster: "/hero/hero-mobile.jpg" } : { video: "/hero/hero.mp4", poster: "/hero/hero.jpg" });
    pick();
    mq.addEventListener("change", pick);
    return () => mq.removeEventListener("change", pick);
  }, []);
  return src;
}

export function Home({ onScan, onDemo, adding = false, onBack }: { onScan: (u: string) => void; onDemo: () => void; adding?: boolean; onBack?: () => void }) {
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const videoScale = useTransform(scrollYProgress, [0, 1], [1.05, 1.25]);
  const heroFade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const [activeReel, setActiveReel] = useState<string | null>(null);
  const heroSrc = useHeroSrc();
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("theme-dark");
    return () => html.classList.add("theme-dark");
  }, []);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const reels = CINEMATIC.map((c) => ({ id: c.id, name: c.name.replace(/\s*\(.*\)$/, ""), tag: c.source === "original" ? "Original" : "Katana", seconds: c.seconds }));

  return (
    <div className="relative bg-[#050506] text-white selection:bg-white/20">
      {/* nav — portalled: the page transition's filter would trap position:fixed */}
      <Portal>
      <header className={clsx("fixed inset-x-0 top-0 z-50 text-white transition-all duration-500", scrolled ? "border-b border-white/[.06] bg-black/55 backdrop-blur-2xl" : "border-b border-transparent")}>
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-5 sm:px-8">
          <Wordmark light />
          <nav className="hidden items-center gap-7 text-[13px] text-white/60 md:flex">
            <a href="#reel" className="transition hover:text-white">
              The reel
            </a>
            <a href="#how" className="transition hover:text-white">
              How it works
            </a>
          </nav>
          {adding && onBack ? (
            <button onClick={onBack} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-medium backdrop-blur-xl transition hover:bg-white/10">
              <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
            </button>
          ) : (
            <button onClick={onDemo} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-medium backdrop-blur-xl transition hover:bg-white/10">
              Try the demo
            </button>
          )}
        </div>
      </header>
      </Portal>

      {/* hero */}
      <section ref={hero} className="relative h-[100svh] min-h-[640px] overflow-hidden">
        <motion.div style={{ scale: videoScale }} className="absolute inset-0">
          {heroSrc && <video key={heroSrc.video} src={heroSrc.video} poster={heroSrc.poster} autoPlay muted loop playsInline className="h-full w-full object-cover" />}
        </motion.div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(5,5,6,.55)_75%,#050506_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-[#050506]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_45%_32%_at_50%_46%,rgba(0,0,0,.42),transparent)]" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="film-grain" />
        </div>

        {/* letterbox bars open like a projector */}
        <motion.div initial={{ height: "50%" }} animate={{ height: "7%" }} transition={{ duration: 1.6, ease: [0.76, 0, 0.24, 1], delay: 0.2 }} className="absolute inset-x-0 top-0 z-20 bg-black" />
        <motion.div initial={{ height: "50%" }} animate={{ height: "7%" }} transition={{ duration: 1.6, ease: [0.76, 0, 0.24, 1], delay: 0.2 }} className="absolute inset-x-0 bottom-0 z-20 bg-black" />

        {/* viewfinder chrome */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 1 }} className="pointer-events-none absolute inset-x-5 top-[calc(7%+14px)] z-20 flex justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-white/55 sm:inset-x-8">
          <span className="flex items-center gap-2">
            <span className="rec-dot h-2 w-2 rounded-full bg-[#ff3d3d]" /> Rec <Timecode />
          </span>
          <span className="hidden sm:inline">Viralot pictures · Scene 01 · Take 1</span>
        </motion.div>

        <motion.div style={{ opacity: heroFade }} className="relative z-10 mx-auto flex h-full max-w-[1200px] flex-col items-center justify-center px-5 text-center">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 1, ease }} className="mb-6 font-mono text-[11px] uppercase tracking-[0.32em] text-white/60">
            {adding ? "Add a dealership" : "AI ad studio for car dealers"}
          </motion.div>
          <h1 className="text-[38px] font-semibold leading-[0.92] tracking-[-0.055em] sm:text-[92px] lg:text-[118px]">
            <Kinetic text="Every car on your lot" delay={1.0} className="text-chrome" />
            <br />
            <span className="font-serif-display font-normal italic tracking-[-0.03em]">
              <Kinetic text="deserves a trailer." delay={1.45} className="text-ember" />
            </span>
          </h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.1, duration: 1, ease }} className="mt-7 max-w-[560px] text-[16px] leading-relaxed text-white/70 sm:text-[18px]">
            Paste your website. Viralot turns your real cars and real offers into cinematic ads for TikTok, Reels and Shorts, in minutes.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.35, duration: 1, ease }} className="mt-9 flex w-full justify-center">
            <UrlForm onScan={onScan} onDemo={onDemo} big />
          </motion.div>
        </motion.div>

        <motion.a
          href="#reel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3, duration: 1 }}
          className="absolute bottom-[calc(7%+18px)] left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/50"
        >
          Now showing
          <span className="relative h-8 w-px overflow-hidden bg-white/15">
            <span className="scroll-cue absolute inset-x-0 top-0 h-1/2 bg-white/80" />
          </span>
        </motion.a>
      </section>

      {/* platforms ticker */}
      <div className="relative overflow-hidden border-y border-white/[.06] py-5">
        <div className="marquee flex w-max gap-12 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.3em] text-white/35">
          {Array.from({ length: 2 }).flatMap((_, k) =>
            ["TikTok", "Instagram Reels", "YouTube Shorts", "Facebook", "1080 × 1920", "Real motion", "Real sound", "Your real offer", "Compliant fine print"].map((w) => (
              <span key={w + k} className="flex items-center gap-12">
                {w} <span className="text-white/15">✦</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* the reel */}
      <section id="reel" className="relative py-28 sm:py-36">
        <div className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-[#2f6bff]/10 blur-[120px]" />
        <div className="relative mx-auto max-w-[1300px] px-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/45">The reel · {CINEMATIC.length} looks</div>
              <h2 className="mt-4 max-w-[720px] text-[40px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[64px]">
                Ads that look like <span className="font-serif-display font-normal italic text-ember">movies,</span> not flyers.
              </h2>
            </div>
            <p className="max-w-[340px] text-[15px] leading-relaxed text-white/55">
              <Play className="mr-1 inline h-3.5 w-3.5 -translate-y-px" /> Hover or tap to play with sound. Each look is filmed again with your car and ends on your offer.
            </p>
          </div>
        </div>
        <div className="no-scrollbar relative mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-16 pt-4 sm:gap-7 sm:px-[max(2rem,calc((100vw-1300px)/2+2rem))]">
          {reels.map((r, i) => (
            <ReelCard key={r.id} {...r} i={i} active={activeReel === r.id} onActive={(on) => setActiveReel(on ? r.id : activeReel === r.id ? null : activeReel)} />
          ))}
        </div>
      </section>

      {/* three acts */}
      <section id="how" className="relative border-t border-white/[.06] py-28 sm:py-36">
        <div className="mx-auto max-w-[1300px] px-5 sm:px-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/45">How it works</div>
          <h2 className="mt-4 max-w-[760px] text-[40px] font-semibold leading-[0.98] tracking-[-0.045em] sm:text-[64px]">
            A full production in <span className="font-serif-display font-normal italic text-ember">three acts.</span>
          </h2>
          <div className="mt-16 grid gap-px overflow-hidden rounded-[32px] border border-white/[.08] bg-white/[.06] md:grid-cols-3">
            {ACTS.map((a, i) => (
              <motion.div
                key={a.n}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.9, ease, delay: i * 0.12 }}
                className="group relative overflow-hidden bg-[#08080a] p-8 transition-colors duration-700 hover:bg-[#080c16] sm:p-10"
              >
                <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-[#2f6bff]/0 blur-[80px] transition-colors duration-700 group-hover:bg-[#2f6bff]/20" />
                <div className="font-serif-display text-[88px] italic leading-none text-white/[.08] transition-colors duration-700 group-hover:text-[#3b7bff]/40">{a.n}</div>
                <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">Act {a.n}</div>
                <div className="mt-4 text-[26px] font-semibold tracking-[-0.035em]">{a.title}</div>
                <p className="mt-3 text-[15px] leading-relaxed text-white/55">{a.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* finale */}
      <section className="relative overflow-hidden border-t border-white/[.06]">
        {heroSrc && <video src={heroSrc.video} autoPlay muted loop playsInline preload="none" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-[2px]" />}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050506] via-[#050506]/60 to-[#050506]" />
        <div className="absolute inset-0 overflow-hidden">
          <div className="film-grain" />
        </div>
        <div className="relative mx-auto flex max-w-[900px] flex-col items-center px-5 py-36 text-center sm:py-48">
          <h2 className="text-[44px] font-semibold leading-[0.95] tracking-[-0.05em] sm:text-[84px]">
            <span className="text-chrome">Roll camera on</span>
            <br />
            <span className="font-serif-display font-normal italic text-ember">your lot.</span>
          </h2>
          <p className="mt-6 max-w-[480px] text-[16px] leading-relaxed text-white/60">One link. Your logo, cars and offers, made into ads in minutes.</p>
          <div className="mt-10 flex w-full justify-center">
            <UrlForm onScan={onScan} onDemo={onDemo} big />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[.06] py-10">
        <div className="mx-auto flex max-w-[1300px] flex-wrap items-center justify-between gap-4 px-5 sm:px-8">
          <Wordmark light />
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/35">Made for dealers · © {new Date().getFullYear()} Viralot</span>
        </div>
      </footer>
    </div>
  );
}
