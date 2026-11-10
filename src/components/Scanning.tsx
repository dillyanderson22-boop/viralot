"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import type { Brand, ScanEvent } from "@/lib/types";
import { SUGGESTED_OFFERS } from "@/lib/demo";
import { Button, SectionLabel, ease } from "./ui";

type Line = { kind: "step" | "found"; label: string; value?: string };

export function Scanning({ url, onDone, onCancel }: { url: string; onDone: (b: Brand) => void; onCancel: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const started = useRef(false);
  const host = (() => {
    try {
      return new URL(/^https?:/.test(url) ? url : "https://" + url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/scan", { method: "POST", body: JSON.stringify({ url }), signal: ctrl.signal });
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const raw = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!raw.trim()) continue;
            const e = JSON.parse(raw) as ScanEvent;
            if (e.type === "step") setLines((l) => [...l, { kind: "step", label: e.label }]);
            if (e.type === "screenshot") setShot(e.data);
            if (e.type === "found") setLines((l) => [...l, { kind: "found", label: e.key, value: e.value }]);
            if (e.type === "error") setError(e.message);
            if (e.type === "done") setBrand(e.brand);
          }
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Scan failed");
      }
    })();
    return () => {};
  }, [url]);

  // hold the finished state for a beat so the reveal registers
  useEffect(() => {
    if (!brand) return;
    const b = { ...brand, offers: brand.offers.length ? brand.offers : SUGGESTED_OFFERS.slice(0, 3) };
    const id = setTimeout(() => onDone(b), 1400);
    return () => clearTimeout(id);
  }, [brand, onDone]);

  const manual = () => {
    const name = host.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    onDone({
      url: "https://" + host,
      name,
      colors: { primary: "#2f6bff", secondary: "#0a0b0d" },
      palette: ["#2f6bff"],
      makes: [],
      vehicles: [],
      offers: SUGGESTED_OFFERS.slice(0, 3),
      socials: {},
    });
  };

  const found = lines.filter((l) => l.kind === "found");
  const steps = lines.filter((l) => l.kind === "step");

  return (
    <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:py-20">
      {/* browser mock */}
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease }} className="relative">
        <div className={`ai-ring ${brand || error ? "" : "fast"} overflow-hidden rounded-[26px] border border-line bg-white shadow-[0_40px_100px_-40px_rgba(10,11,13,.35)]`}>
          <div className="flex h-11 items-center gap-2 border-b border-line bg-bg-2/70 px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink/10" />
            <div className="ml-3 flex h-7 flex-1 items-center rounded-full bg-white px-3 font-mono text-[12px] text-muted">{host}</div>
          </div>
          <div className="relative aspect-[1440/900] overflow-hidden bg-bg-2">
            <AnimatePresence>
              {shot ? (
                <motion.img
                  key="shot"
                  src={shot}
                  alt=""
                  initial={{ opacity: 0, scale: 1.04, filter: "blur(12px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={{ duration: 1.2, ease }}
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
              ) : (
                <motion.div key="skeleton" exit={{ opacity: 0 }} className="absolute inset-0 p-8">
                  <div className="h-8 w-40 rounded-lg bg-ink/[.06]" />
                  <div className="mt-8 h-40 rounded-2xl bg-ink/[.05]" />
                  <div className="mt-5 grid grid-cols-3 gap-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="relative h-24 overflow-hidden rounded-xl bg-ink/[.05]">
                        <div className="shimmer absolute inset-0" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!brand && !error && (
              <>
                <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-[10%]">
                  <div className="h-full w-full bg-gradient-to-b from-transparent via-blue/20 to-blue/40" />
                  <div className="h-[2px] w-full bg-blue shadow-[0_0_24px_4px_rgba(47,107,255,.6)]" />
                </div>
                {/* detection boxes */}
                {found.slice(0, 4).map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, scale: 1.2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease }}
                    className="absolute rounded-md border-[1.5px] border-blue/80 bg-blue/5"
                    style={{
                      left: `${[4, 58, 10, 40][i]}%`,
                      top: `${[3, 30, 55, 70][i]}%`,
                      width: `${[22, 30, 35, 26][i]}%`,
                      height: `${[9, 30, 20, 16][i]}%`,
                    }}
                  >
                    <span className="absolute -top-6 left-0 rounded-md bg-blue px-1.5 py-0.5 font-mono text-[10px] text-white">{f.label}</span>
                  </motion.div>
                ))}
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* log */}
      <div className="flex flex-col">
        <SectionLabel>{error ? "Scan interrupted" : brand ? "Brand captured" : "Scanning"}</SectionLabel>
        <h2 className="mt-5 text-[36px] font-semibold leading-[1.05] tracking-[-0.045em]">
          {error ? "We hit a wall." : brand ? `Meet ${brand.name}.` : "Reading your dealership…"}
        </h2>
        <p className="mt-3 text-[15px] text-muted">
          {error ? error : brand ? "Your brand kit is ready." : "Logo, colors, inventory, offers. Usually under a minute."}
        </p>

        <div className="mt-8 space-y-1.5">
          <AnimatePresence initial={false}>
            {steps.map((l, i) => (
              <motion.div
                key={"s" + i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease }}
                className="flex items-center gap-3 text-[14px] text-ink-2"
              >
                {i === steps.length - 1 && !brand && !error ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue" />
                ) : (
                  <Check className="h-4 w-4 text-blue" />
                )}
                {l.label}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <AnimatePresence>
            {found.map((f, i) => (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease, delay: i * 0.06 }}
                className="rounded-2xl border border-line bg-white px-4 py-3"
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{f.label}</div>
                <div className="mt-1 flex items-center gap-2 truncate text-[14px] font-medium">
                  {/^#[0-9a-f]{6}$/i.test(f.value ?? "") && <span className="h-3.5 w-3.5 rounded-full" style={{ background: f.value }} />}
                  <span className="truncate">{f.value}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {error && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={manual}>Build my kit by hand</Button>
            <Button variant="soft" onClick={onCancel}>
              Try another URL
            </Button>
            <div className="flex w-full items-start gap-2 text-[12.5px] text-muted">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Some dealer sites block automated visitors. You can still upload your logo and pick colors on the next screen.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
