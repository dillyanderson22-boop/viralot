"use client";

import { motion, useMotionValue, useSpring, useTransform, animate } from "motion/react";
import { forwardRef, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import type { Platform } from "@/lib/types";

export const ease = [0.16, 1, 0.3, 1] as const;

export function Wordmark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2.5 select-none", className)}>
      <span className="relative grid h-7 w-7 place-items-center">
        <span className="liquid-orb absolute inset-0 bg-gradient-to-br from-blue to-cyan opacity-90 blur-[6px]" />
        <span className="liquid-orb relative h-7 w-7 bg-[radial-gradient(circle_at_30%_30%,#fff_0%,#9ec0ff_25%,#2f6bff_60%,#0b1a4a_100%)] shadow-[inset_0_1px_2px_rgba(255,255,255,.6)]" />
      </span>
      <span className={clsx("text-[17px] font-semibold tracking-[-0.03em]", light ? "text-white" : "text-ink")}>
        viralot<span className="text-blue">.</span>
      </span>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "soft"; size?: "md" | "lg" | "sm"; children: ReactNode };

/** Primary button: ink pill, a light sweep on hover, magnetic pull toward the cursor. */
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", className, children, ...rest },
  ref
) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });
  const local = useRef<HTMLButtonElement | null>(null);
  return (
    <motion.button
      ref={(el) => {
        local.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (variant !== "primary" || !local.current) return;
        const r = local.current.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.12);
        y.set((e.clientY - r.top - r.height / 2) * 0.2);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
      className={clsx(
        "group relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[box-shadow,background,color,opacity] duration-300 disabled:pointer-events-none disabled:opacity-40",
        size === "lg" && "h-14 px-7 text-[15px]",
        size === "md" && "h-11 px-5 text-[14px]",
        size === "sm" && "h-9 px-4 text-[13px]",
        variant === "primary" &&
          "bg-ink text-white shadow-[0_1px_0_rgba(255,255,255,.15)_inset,0_10px_30px_-10px_rgba(10,11,13,.5)] hover:shadow-[0_1px_0_rgba(255,255,255,.15)_inset,0_14px_40px_-10px_rgba(47,107,255,.55)]",
        variant === "ghost" && "text-ink-2 hover:bg-bg-2 hover:text-ink",
        variant === "soft" && "border border-line-2 bg-white text-ink hover:border-ink/20 hover:shadow-[0_8px_24px_-12px_rgba(10,11,13,.25)]",
        className
      )}
      {...(rest as object)}
    >
      {variant === "primary" && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
      )}
      <span className="relative flex items-center gap-2">{children}</span>
    </motion.button>
  );
});

export function Chip({ active, children, onClick, layoutId }: { active?: boolean; children: ReactNode; onClick?: () => void; layoutId?: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "relative h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors duration-300",
        active ? "text-white" : "text-ink-2 hover:text-ink"
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId ?? "chip"}
          className="absolute inset-0 rounded-full bg-ink"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

export function PlatformIcon({ p, className }: { p: Platform; className?: string }) {
  const c = clsx("h-4 w-4", className);
  switch (p) {
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" className={c} fill="currentColor">
          <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12V9.77a5.7 5.7 0 1 0 4.9 5.63V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.28 4.28 0 0 1-3.24-1.48Z" />
        </svg>
      );
    case "reels":
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "shorts":
      return (
        <svg viewBox="0 0 24 24" className={c} fill="currentColor">
          <path d="M17.8 9.3 15.5 8l2.1-1.1a3.6 3.6 0 0 0-3.4-6.3L6.6 4.7a3.6 3.6 0 0 0 0 6.3l2.3 1.2-2.1 1.1a3.6 3.6 0 0 0 3.4 6.3l7.6-4.1a3.6 3.6 0 0 0 0-6.2ZM10 15V9l5 3-5 3Z" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" className={c} fill="currentColor">
          <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.3H8v3h2.6V21h2.9Z" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" className={c} fill="currentColor">
          <path d="M17.7 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.7 3Zm-1.1 16.2h1.7L7.5 4.7H5.7l10.9 14.5Z" />
        </svg>
      );
  }
}

/** Animated count-up number. */
export function CountUp({ to, duration = 1.4, className }: { to: number; duration?: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, duration]);
  return <span className={className}>{v}</span>;
}

export function ScoreRing({ score, size = 112, stroke = 8, delay = 0 }: { score: number; size?: number; stroke?: number; delay?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useMotionValue(0);
  const dash = useTransform(v, (x) => c - (c * x) / 100);
  useEffect(() => {
    const a = animate(v, score, { duration: 1.6, delay, ease: [0.16, 1, 0.3, 1] });
    return () => a.stop();
  }, [score, delay, v]);
  const tone = score >= 90 ? "Viral" : score >= 80 ? "Strong" : "Solid";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`sg-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2f6bff" />
            <stop offset="100%" stopColor="#38d4ff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(10,11,13,.06)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#sg-${size})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          style={{ strokeDashoffset: dash }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
            <CountUp to={score} duration={1.6} />
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{tone}</div>
        </div>
      </div>
    </div>
  );
}

/** Gradient mesh: three slow-drifting colour fields — the ambient "AI presence". */
export function Orb({ className, size = 520 }: { className?: string; size?: number }) {
  return (
    <div className={clsx("pointer-events-none absolute", className)} style={{ width: size, height: size }} aria-hidden>
      <div className="mesh-blob" style={{ width: size * 0.62, height: size * 0.62, left: "8%", top: "10%", background: "#38d4ff", animation: "drift-a 14s ease-in-out infinite" }} />
      <div className="mesh-blob" style={{ width: size * 0.58, height: size * 0.58, right: "6%", top: "18%", background: "#2f6bff", animation: "drift-b 17s ease-in-out infinite" }} />
      <div className="mesh-blob" style={{ width: size * 0.5, height: size * 0.5, left: "28%", bottom: "4%", background: "#a78bfa", opacity: 0.35, animation: "drift-c 19s ease-in-out infinite" }} />
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted backdrop-blur">
      <span className="h-1.5 w-1.5 rounded-full bg-blue shadow-[0_0_10px_2px_rgba(47,107,255,.5)]" />
      {children}
    </div>
  );
}

export const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: (i = 0) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease, delay: i * 0.07 } }),
};

const FLAP_CHARS = "0123456789";

/**
 * Split-flap display (departure-board style). Each character shuffles, then
 * lands left to right with a flip — used for counters across the app.
 */
export function SplitFlap({ value, className, tile = "h-[1.35em] w-[0.92em]" }: { value: string; className?: string; tile?: string }) {
  const [shown, setShown] = useState(() => value.replace(/[0-9]/g, "0"));
  useEffect(() => {
    let frame = 0;
    const settleAt = value.split("").map((_, i) => 6 + i * 3);
    const id = setInterval(() => {
      frame++;
      setShown(
        value
          .split("")
          .map((ch, i) => (frame >= settleAt[i] || !/[0-9]/.test(ch) ? ch : FLAP_CHARS[(frame * 7 + i * 3) % 10]))
          .join("")
      );
      if (frame >= settleAt[settleAt.length - 1]) clearInterval(id);
    }, 55);
    return () => clearInterval(id);
  }, [value]);
  return (
    <span className={clsx("inline-flex gap-[0.08em] font-semibold tabular-nums tracking-normal", className)} aria-label={value}>
      {shown.split("").map((ch, i) => (
        <span
          key={i}
          className={clsx(
            "relative grid place-items-center overflow-hidden rounded-[0.14em] bg-ink text-white shadow-[inset_0_-1px_0_rgba(255,255,255,.08),0_2px_6px_-2px_rgba(10,11,13,.4)]",
            tile
          )}
        >
          <motion.span key={ch} initial={{ rotateX: -90, opacity: 0.4 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ duration: 0.18 }} className="leading-none">
            {ch}
          </motion.span>
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/60" />
        </span>
      ))}
    </span>
  );
}
