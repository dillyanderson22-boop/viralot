"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeDollarSign, CalendarDays, Car, Check, ChevronsUpDown, Clapperboard, Palette, Plus, Sparkles, Tag } from "lucide-react";
import clsx from "clsx";
import type { Dealer, Workspace } from "@/lib/workspace";
import { Wordmark, ease } from "./ui";

export type Section = "create" | "spots" | "specials" | "inventory" | "ads" | "calendar" | "brand";

function DealerLogo({ d, size = 36 }: { d: Dealer; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white"
      style={{ width: size, height: size }}
    >
      {d.brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.brand.logo} alt="" className="max-h-[70%] max-w-[80%] object-contain" />
      ) : (
        <span className="text-[13px] font-bold" style={{ color: d.brand.colors.primary }}>
          {d.brand.name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

function Switcher({ ws, dealer, onSwitch, onAdd, compact = false }: { ws: Workspace; dealer: Dealer; onSwitch: (id: string) => void; onAdd: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const counts = (id: string) => ws.ads.filter((a) => a.dealerId === id).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex w-full items-center gap-3 rounded-2xl border border-line bg-white text-left transition hover:border-ink/15 hover:shadow-[0_10px_30px_-18px_rgba(10,11,13,.35)]",
          compact ? "p-1.5 pr-3" : "p-2.5"
        )}
      >
        <DealerLogo d={dealer} size={compact ? 30 : 38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold tracking-[-0.01em]">{dealer.brand.name}</span>
          {!compact && (
            <span className="block truncate text-[12px] text-muted">
              {[dealer.brand.city, dealer.brand.state].filter(Boolean).join(", ") || new URL(dealer.brand.url).hostname.replace(/^www\./, "")}
            </span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 min-w-[260px] rounded-2xl border border-line bg-white p-1.5 shadow-[0_30px_60px_-20px_rgba(10,11,13,.35)]"
          >
            <div className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">Dealerships</div>
            <div className="max-h-[320px] overflow-auto">
              {ws.dealers.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setOpen(false);
                    onSwitch(d.id);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-bg-2"
                >
                  <DealerLogo d={d} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{d.brand.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {counts(d.id)} ad{counts(d.id) === 1 ? "" : "s"}
                    </span>
                  </span>
                  {d.id === dealer.id && <Check className="h-4 w-4 text-blue" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setOpen(false);
                onAdd();
              }}
              className="mt-1 flex w-full items-center gap-2.5 rounded-xl border-t border-line px-2 py-2.5 text-left text-[13px] font-medium hover:bg-bg-2"
            >
              <span className="grid h-[30px] w-[30px] place-items-center rounded-xl border border-dashed border-line-2 text-muted">
                <Plus className="h-4 w-4" />
              </span>
              Add a dealership
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV: { id: Section; label: string; icon: typeof Sparkles }[] = [
  { id: "create", label: "Viral ads", icon: Sparkles },
  { id: "spots", label: "Offer spots", icon: BadgeDollarSign },
  { id: "specials", label: "Specials", icon: Tag },
  { id: "inventory", label: "Inventory", icon: Car },
  { id: "ads", label: "My ads", icon: Clapperboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "brand", label: "Brand kit", icon: Palette },
];

export function Shell({
  ws,
  dealer,
  section,
  onNav,
  onSwitch,
  onAdd,
  children,
}: {
  ws: Workspace;
  dealer: Dealer;
  section: Section;
  onNav: (s: Section) => void;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  children: ReactNode;
}) {
  const adCount = ws.ads.filter((a) => a.dealerId === dealer.id).length;
  const downloads = ws.ads.filter((a) => a.dealerId === dealer.id).reduce((s, a) => s + (a.downloads ?? 0), 0);

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line bg-white/85 px-4 pb-5 pt-5 backdrop-blur-xl lg:flex">
        <button onClick={() => onNav("create")} className="px-1.5" aria-label="Create ads">
          <Wordmark />
        </button>
        <div className="mt-6">
          <Switcher ws={ws} dealer={dealer} onSwitch={onSwitch} onAdd={onAdd} />
        </div>
        <nav className="mt-6 space-y-1">
          {NAV.map((n) => {
            const active = section === n.id;
            return (
              <button
                key={n.id}
                onClick={() => onNav(n.id)}
                className={clsx("relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors", active ? "text-white" : "text-ink-2 hover:bg-bg-2 hover:text-ink")}
              >
                {active && <motion.span layoutId="nav" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <n.icon className="relative h-[18px] w-[18px]" />
                <span className="relative flex-1 text-left">{n.label}</span>
                {n.id === "inventory" && (dealer.inventory?.length ?? 0) > 0 && (
                  <span className={clsx("relative rounded-full px-2 py-0.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-ink/5 text-muted")}>{dealer.inventory!.length}</span>
                )}
                {n.id === "ads" && adCount > 0 && (
                  <span className={clsx("relative rounded-full px-2 py-0.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-ink/5 text-muted")}>{adCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-bg-2/60 p-4">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-60 blur-2xl"
              style={{ background: `radial-gradient(circle, ${dealer.brand.colors.primary}, transparent 70%)` }}
            />
            <div className="relative text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">{dealer.brand.name.split(" ").slice(0, 3).join(" ")}</div>
            <div className="relative mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[22px] font-semibold tabular-nums tracking-[-0.04em]">{adCount}</div>
                <div className="text-[11.5px] text-muted">ads made</div>
              </div>
              <div>
                <div className="text-[22px] font-semibold tabular-nums tracking-[-0.04em]">{downloads}</div>
                <div className="text-[11.5px] text-muted">downloads</div>
              </div>
            </div>
          </div>
          <div className="mt-3 px-1.5 text-[11.5px] text-muted">
            {ws.dealers.length} dealership{ws.dealers.length === 1 ? "" : "s"} · saved in this browser
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Switcher ws={ws} dealer={dealer} onSwitch={onSwitch} onAdd={onAdd} compact />
          </div>
        </div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((n) => {
            const active = section === n.id;
            return (
              <button
                key={n.id}
                onClick={() => onNav(n.id)}
                className={clsx("relative flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium", active ? "text-white" : "text-ink-2")}
              >
                {active && <motion.span layoutId="navm" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <n.icon className="relative h-3.5 w-3.5" />
                <span className="relative">{n.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <main className="lg:pl-[264px]">{children}</main>
    </div>
  );
}
