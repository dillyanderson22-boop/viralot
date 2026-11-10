"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Car, Check, ChevronDown, Tag } from "lucide-react";
import clsx from "clsx";
import type { AdInputs, Brand } from "@/lib/types";
import { SUGGESTED_OFFERS, matchVehicle } from "@/lib/demo";
import { ease } from "./ui";

/**
 * Offer + car pickers. Used on the library (applies to every template) and on
 * each finished ad (applies to that ad only).
 */
export function DealPicker({
  brand,
  value,
  onChange,
  compact = false,
  extraOffers = [],
  extraLabel,
}: {
  brand: Brand;
  value: AdInputs;
  onChange: (patch: Partial<AdInputs>) => void;
  compact?: boolean;
  /** Offers to list first (e.g. the active seasonal event's). */
  extraOffers?: string[];
  extraLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const offers = [...new Set([...extraOffers, ...brand.offers, ...SUGGESTED_OFFERS])];
  const cars = [...brand.vehicles.filter((v) => !v.stock && !v.banner), ...brand.vehicles.filter((v) => v.banner), ...brand.vehicles.filter((v) => v.stock)];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const pickOffer = (o: string) => {
    const v = matchVehicle(o, brand.vehicles);
    onChange({ ...(v ? { offer: o, vehicleImage: v.image, vehicleName: v.title ?? value.vehicleName } : { offer: o }), offers: undefined, specialId: undefined, spot: undefined, angled: undefined });
    setOpen(false);
  };

  return (
    <div className={clsx("flex min-w-0 flex-col gap-3", !compact && "lg:flex-row lg:items-center")}>
      {/* offer */}
      <div ref={ref} className={clsx("relative shrink-0", !compact && "lg:w-[360px]")}>
        <button
          onClick={() => setOpen(!open)}
          className="flex h-12 w-full items-center gap-3 rounded-2xl border border-line-2 bg-white px-3.5 text-left transition hover:border-ink/25"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue/10 text-blue">
            <Tag className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
              {value.offers?.length ? `Special · ${value.offers.length} offer${value.offers.length === 1 ? "" : "s"}` : "Offer"}
            </span>
            <span className="block truncate text-[13.5px] font-medium">{value.offer}</span>
          </span>
          <ChevronDown className={clsx("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.25, ease }}
              className="absolute left-0 right-0 top-[54px] z-40 max-h-[360px] overflow-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_30px_60px_-20px_rgba(10,11,13,.35)]"
            >
              {offers.map((o) => {
                const fromSite = brand.offers.includes(o) && !SUGGESTED_OFFERS.includes(o);
                const read = brand.offerDetails?.find((d) => d.headline === o);
                return (
                  <button
                    key={o}
                    onClick={() => pickOffer(o)}
                    className="flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-bg-2"
                  >
                    <span className="mt-0.5 w-3.5 shrink-0">{value.offer === o && <Check className="h-3.5 w-3.5 text-blue" />}</span>
                    <span className="flex-1">
                      {o}
                      {read && (read.expires || read.term) && (
                        <span className="block text-[11.5px] text-muted">{[read.term, read.expires && `ends ${read.expires}`].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    <span className={clsx("shrink-0 text-[10px] uppercase tracking-[0.1em]", read ? "font-semibold text-blue" : "text-muted")}>
                      {extraOffers.includes(o) ? extraLabel ?? "event" : read ? (read.source === "banner" ? "banner" : "site") : fromSite ? "site" : "idea"}
                    </span>
                  </button>
                );
              })}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (custom.trim()) pickOffer(custom.trim());
                  setCustom("");
                }}
                className="mt-1 flex gap-1.5 border-t border-line p-1.5 pt-2.5"
              >
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Type your own offer…"
                  className="h-9 flex-1 rounded-lg border border-line-2 px-3 text-[13px] outline-none focus:border-blue"
                />
                <button className="h-9 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-white disabled:opacity-40" disabled={!custom.trim()}>
                  Use
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* car */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue/10 text-blue sm:grid">
          <Car className="h-3.5 w-3.5" />
        </span>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,#000_92%,transparent)]">
          {cars.map((v) => {
            const on = value.vehicleImage === v.image;
            return (
              <motion.button
                key={v.image}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => onChange({ vehicleImage: v.image, vehicleName: !v.stock && v.title ? v.title : value.vehicleName, angled: undefined })}
                title={v.title}
                className={clsx(
                  "relative h-12 w-[72px] shrink-0 overflow-hidden rounded-xl bg-bg-2 transition",
                  on ? "ring-2 ring-blue ring-offset-2" : "ring-1 ring-line hover:ring-ink/20"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.image}
                  alt={v.title ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = "none")}
                />
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
