"use client";

import { motion } from "motion/react";
import clsx from "clsx";
import type { Brand } from "@/lib/types";
import type { Stage } from "./Studio";
import { Wordmark } from "./ui";

const STEPS: { id: Stage; label: string }[] = [
  { id: "home", label: "Scan" },
  { id: "brand", label: "Brand kit" },
  { id: "library", label: "Templates" },
  { id: "results", label: "Launch" },
];

function stepIndex(s: Stage) {
  if (s === "scanning") return 0;
  if (s === "generating") return 3;
  return STEPS.findIndex((x) => x.id === s);
}

export function TopBar({
  stage,
  brand,
  onNav,
  canGenerate,
  onBack,
}: {
  stage: Stage;
  brand: Brand | null;
  onNav: (s: Stage) => void;
  canGenerate: boolean;
  onBack?: () => void;
}) {
  const idx = stepIndex(stage);
  return (
    <header className="sticky top-0 z-40">
      <div className="absolute inset-0 border-b border-line bg-white/75 backdrop-blur-xl" />
      <div className="relative mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
        <button onClick={() => onNav("home")} aria-label="Home">
          <Wordmark />
        </button>

        <nav className="hidden items-center rounded-full border border-line bg-white/80 p-1 md:flex">
          {STEPS.map((s, i) => {
            const active = i === idx;
            const done = i < idx;
            const disabled = (!brand && i > 0) || (s.id === "results" && !canGenerate && stage !== "results");
            return (
              <button
                key={s.id}
                disabled={disabled}
                onClick={() => onNav(s.id === "results" ? "generating" : s.id)}
                className={clsx(
                  "relative flex h-8 items-center gap-2 rounded-full px-3.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed",
                  active ? "text-white" : done ? "text-ink" : "text-muted hover:text-ink"
                )}
              >
                {active && (
                  <motion.span layoutId="step" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                )}
                <span
                  className={clsx(
                    "relative grid h-4 w-4 place-items-center rounded-full text-[9px] tabular-nums",
                    active ? "bg-white/20" : done ? "bg-blue text-white" : "bg-ink/5"
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-[120px] items-center justify-end gap-3">
          {onBack && (
            <button onClick={onBack} className="h-9 rounded-full border border-line bg-white px-4 text-[13px] font-medium text-ink-2 transition hover:border-ink/20 hover:text-ink">
              ← Back to dashboard
            </button>
          )}
          {brand && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3">
              <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full border border-line bg-white">
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logo} alt="" className="h-4 w-4 object-contain" />
                ) : (
                  <span className="h-3 w-3 rounded-full" style={{ background: brand.colors.primary }} />
                )}
              </span>
              <span className="max-w-[140px] truncate text-[12.5px] font-medium">{brand.name}</span>
            </motion.div>
          )}
        </div>
      </div>
    </header>
  );
}
