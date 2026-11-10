"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Check, Search, Upload, X } from "lucide-react";
import clsx from "clsx";
import type { AdInputs, Brand, Special, SpecialOffer } from "@/lib/types";
import type { InventoryCar } from "@/lib/workspace";
import { carAsSpecial, inputsForCar, inputsForSpecial, photosFor } from "@/lib/specials";
import { ease } from "./ui";
import { CarImg } from "./CarImg";

type Hit = { key: string; from: "feed" | "specials"; sp: Special; car?: InventoryCar; sub: string };

const KIND: Record<SpecialOffer["kind"], string> = {
  lease: "Lease",
  finance: "Finance",
  cash: "Cash",
  discount: "Discount",
  msrp: "MSRP",
  price: "Price",
  trade: "Trade-in",
  bonus: "Bonus",
  other: "Offer",
};

/** Lower-case words, so "crv ex" finds "CR-V EX". */
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Step one of making an ad: find the car (VIN, last digits of the VIN, stock
 * number or name), then tick which of its offers go in — one, some or all.
 * Cars come from the dealer's feed, plus anything on their specials pages.
 */
export function CarPicker({
  brand,
  inventory = [],
  value,
  onChange,
  onImport,
}: {
  brand: Brand;
  inventory?: InventoryCar[];
  value: AdInputs;
  onChange: (inputs: AdInputs) => void;
  /** Opens the feed import (Inventory). */
  onImport?: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const all: Hit[] = useMemo(() => {
    const feed = inventory.map((c) => ({
      key: "car:" + c.id,
      from: "feed" as const,
      car: c,
      sp: carAsSpecial(c),
      sub: [c.condition === "new" ? "New" : c.condition === "cpo" ? "Certified" : "Used", c.color, c.stock && `Stock ${c.stock}`, c.vin && `VIN …${c.vin.slice(-8)}`].filter(Boolean).join(" · "),
    }));
    const specials = (brand.specials ?? []).map((sp) => ({ key: "sp:" + sp.id, from: "specials" as const, sp, sub: ["Specials page", sp.expires && `ends ${sp.expires}`].filter(Boolean).join(" · ") }));
    return [...feed, ...specials];
  }, [inventory, brand.specials]);

  const results = useMemo(() => {
    const t = words(q);
    const sq = squash(q);
    if (!t) return all.slice(0, 40);
    return all
      .map((h) => {
        const hay = words([h.sp.vehicle, h.car?.color, h.car?.trim].filter(Boolean).join(" "));
        const vin = (h.sp.vin ?? "").toLowerCase();
        const stock = squash(h.sp.stock ?? "");
        let score = 0;
        if (sq.length >= 5 && vin.includes(sq)) score = 100 - (vin.length - sq.length);
        else if (stock && stock === sq) score = 90;
        else if (stock && sq.length >= 3 && stock.includes(sq)) score = 70;
        else if (t.split(" ").every((w) => hay.includes(w) || squash(hay).includes(w))) score = 50;
        return { h, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.h);
  }, [all, q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const current = all.find((h) => (value.carId && h.car?.id === value.carId) || (value.specialId && h.from === "specials" && h.sp.id === value.specialId));
  const on = (o: SpecialOffer) => !!value.offers?.some((p) => p.label === o.label && p.value === o.value);

  const apply = (h: Hit, picked: SpecialOffer[]) => {
    const keep = { direction: value.direction, promptMode: value.promptMode };
    const ad = h.car ? inputsForCar(value, h.car, picked) : inputsForSpecial(value, h.sp, picked);
    const photos = photosFor({ title: h.sp.vehicle, image: h.sp.image, images: h.car?.images }, inventory, brand.vehicles);
    onChange({ ...ad, vehicleImage: photos[0] ?? ad.vehicleImage, vehicleImages: photos, ...keep });
  };
  const choose = (h: Hit) => {
    // the headline deals first: everything except plain MSRP/price when there are real offers
    const deals = h.sp.offers.filter((o) => o.kind !== "msrp" && o.kind !== "price");
    apply(h, deals.length ? deals : h.sp.offers.slice(0, 1));
    setOpen(false);
    setQ("");
  };
  const toggle = (o: SpecialOffer) => {
    if (!current) return;
    const picked = current.sp.offers.filter((x) => (x === o ? !on(x) : on(x)));
    apply(current, picked);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div ref={box} className="relative">
        <div className="flex h-12 items-center gap-2.5 rounded-2xl border border-line-2 bg-white px-3.5 transition focus-within:border-blue focus-within:shadow-[0_0_0_4px_rgba(59,123,255,.15)]">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={all.length ? "Find a car: VIN, last 6 of VIN, stock # or name (e.g. CR-V EX)" : "No cars yet. Import your inventory feed to search by VIN or name"}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted/70"
            spellCheck={false}
          />
          {q && (
            <button onClick={() => setQ("")} className="text-muted hover:text-ink" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
          {onImport && (
            <button onClick={onImport} className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line-2 px-3 py-1 text-[12px] font-medium text-ink-2 hover:border-ink/25 sm:flex">
              <Upload className="h-3.5 w-3.5" /> {inventory.length ? `${inventory.length} cars · update feed` : "Import feed"}
            </button>
          )}
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease }}
              className="absolute inset-x-0 top-[54px] z-40 max-h-[420px] overflow-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)]"
            >
              {results.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-muted">
                  {all.length ? "No car matches that. Try the last 6 of the VIN, the stock number or the model." : "No cars yet."}
                  {onImport && (
                    <button onClick={onImport} className="mt-2 block w-full font-medium text-blue hover:underline">
                      Import your inventory feed
                    </button>
                  )}
                </div>
              ) : (
                results.map((h) => (
                  <button key={h.key} onClick={() => choose(h)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-bg-2">
                    <span className="grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-bg-2">
                      <CarImg srcs={photosFor({ title: h.sp.vehicle, image: h.sp.image, images: h.car?.images }, inventory, brand.vehicles)} className="h-full w-full object-contain" fallback={<Car className="h-4 w-4 text-muted" />} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{h.sp.vehicle}</span>
                      <span className="block truncate text-[11.5px] text-muted">{h.sub}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12.5px] font-semibold tabular-nums">{h.car?.price ? "$" + h.car.price.toLocaleString("en-US") : ""}</span>
                      <span className="block text-[11px] text-muted">
                        {h.sp.offers.filter((o) => o.kind !== "msrp" && o.kind !== "price").length || 0} offer{h.sp.offers.filter((o) => o.kind !== "msrp" && o.kind !== "price").length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {current && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 sm:flex-row">
          <div className="flex shrink-0 items-center gap-3 sm:w-[280px]">
            <span className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-bg-2">
              <CarImg srcs={photosFor({ title: current.sp.vehicle, image: current.sp.image, images: current.car?.images }, inventory, brand.vehicles)} className="h-full w-full object-contain" fallback={<Car className="h-5 w-5 text-muted" />} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold leading-snug">{current.sp.vehicle}</span>
              <span className="block truncate text-[11.5px] text-muted">{current.sub}</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Offers in this ad</span>
              {current.sp.offers.length > 1 && (
                <span className="flex gap-3 text-[12px] font-medium">
                  <button onClick={() => apply(current, current.sp.offers)} className="text-blue hover:underline">
                    All
                  </button>
                  <button onClick={() => apply(current, current.sp.offers.filter((o) => o.kind !== "msrp" && o.kind !== "price"))} className="text-muted hover:text-ink">
                    Deals only
                  </button>
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {current.sp.offers.length === 0 && <span className="text-[12.5px] text-muted">No offers in the feed for this car. The ad will say to ask about today&apos;s price.</span>}
              {current.sp.offers.map((o, i) => {
                const sel = on(o);
                return (
                  <button
                    key={i}
                    onClick={() => toggle(o)}
                    title={o.detail}
                    className={clsx("flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition", sel ? "border-blue bg-blue/[.08]" : "border-line hover:border-ink/20")}
                  >
                    <span className={clsx("grid h-4 w-4 place-items-center rounded border", sel ? "border-blue bg-blue text-white" : "border-line-2")}>{sel && <Check className="h-3 w-3" />}</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">{KIND[o.kind]}</span>
                    <span className="text-[12.5px]">{o.label !== KIND[o.kind] ? o.label : ""}</span>
                    <span className="text-[13px] font-semibold tabular-nums">{o.value}</span>
                    {o.detail && <span className="hidden text-[11px] text-muted md:inline">· {o.detail}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
