"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ImageUp, Plus, RefreshCw, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { AdInputs, Brand } from "@/lib/types";
import { SUGGESTED_OFFERS, matchVehicle } from "@/lib/demo";
import { Button, SectionLabel, ease } from "./ui";

/** Most common saturated colour in the logo — usually the truest brand colour. */
async function logoColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0, 64, 64);
      let data: Uint8ClampedArray;
      try {
        data = x.getImageData(0, 0, 64, 64).data;
      } catch {
        return resolve(null);
      }
      const bins = new Map<string, number>();
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 200) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 50 || max < 40 || min > 225) continue;
        const k = [r, g, b].map((v) => Math.round(v / 24) * 24).join(",");
        bins.set(k, (bins.get(k) ?? 0) + 1);
      }
      const top = [...bins.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] < 20) return resolve(null);
      const hex = "#" + top[0].split(",").map((n) => Math.min(255, +n).toString(16).padStart(2, "0")).join("");
      resolve(hex);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function Card({ title, children, className, i = 0 }: { title: string; children: ReactNode; className?: string; i?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease, delay: 0.05 + i * 0.06 }}
      className={clsx("min-w-0 rounded-[24px] border border-line bg-white p-5 sm:p-6", className)}
    >
      <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{title}</div>
      {children}
    </motion.div>
  );
}

function DangerZone({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-line bg-white p-5 sm:p-6">
      <div>
        <div className="text-[14px] font-medium">Remove dealership</div>
        <div className="text-[12.5px] text-muted">Deletes {name} and every ad made for it from this browser.</div>
      </div>
      {confirm ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
          <button onClick={onDelete} className="h-9 rounded-full bg-red-600 px-4 text-[13px] font-medium text-white hover:bg-red-700">
            Yes, delete it
          </button>
        </div>
      ) : (
        <Button variant="soft" size="sm" onClick={() => setConfirm(true)}>
          Delete
        </Button>
      )}
    </div>
  );
}

const field =
  "w-full rounded-xl border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none transition focus:border-blue focus:shadow-[0_0_0_4px_rgba(47,107,255,.12)]";

export function BrandKit({
  brand,
  setBrand,
  inputs,
  setInputs,
  onNext,
  fresh = false,
  onDelete,
  onRescan,
}: {
  fresh?: boolean;
  onDelete?: () => void;
  /** Re-scan the dealer's website and refresh this kit. */
  onRescan?: () => void;
  brand: Brand;
  setBrand: (b: Brand) => void;
  inputs: AdInputs;
  setInputs: (i: AdInputs) => void;
  onNext: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!brand.logo) return;
    let alive = true;
    logoColor(brand.logo).then((c) => {
      if (!alive || !c) return;
      // Archived pages often lose their stylesheets, so the logo is the best colour signal there.
      // (Claude already read the colours off the real page — don't second-guess it.)
      const trustLogo = !brand.readByClaude && (!!brand.archivedFrom || brand.palette.length < 2);
      const palette = brand.palette.some((p) => p.toLowerCase() === c.toLowerCase()) ? brand.palette : [c, ...brand.palette].slice(0, 8);
      if (palette === brand.palette && !trustLogo) return;
      setBrand({ ...brand, palette, colors: trustLogo ? { ...brand.colors, primary: c } : brand.colors });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.logo]);

  const upload = (f: File) => {
    const r = new FileReader();
    r.onload = () => setBrand({ ...brand, logo: String(r.result) });
    r.readAsDataURL(f);
  };
  const set = (patch: Partial<AdInputs>) => setInputs({ ...inputs, ...patch });
  const offers = [...new Set([...brand.offers, ...SUGGESTED_OFFERS])].slice(0, Math.max(7, (brand.offerDetails?.length ?? 0) + 2));

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>{fresh ? "New dealership" : "Brand kit"}</SectionLabel>
          <h1 className="mt-4 text-[38px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[52px]">{fresh ? "Here's what we found." : brand.name}</h1>
          <p className="mt-3 max-w-[520px] text-[15px] text-muted">Tweak anything. Every template picks up your logo, colors, car and offer automatically.</p>
        </div>
        <div className="flex items-center gap-3">
          {!fresh && <span className="hidden text-[13px] text-muted sm:inline">Changes save automatically</span>}
          {onRescan && !fresh && (
            <Button variant="soft" size="lg" onClick={onRescan} title={`Scan ${brand.url.replace(/^https?:\/\//, "")} again`}>
              <RefreshCw className="h-4 w-4" /> Rescan website
            </Button>
          )}
          <Button size="lg" onClick={onNext}>
            {fresh ? "Continue to templates" : "Create ads"} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {brand.archivedFrom && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13.5px] text-amber-900"
        >
          <span className="mt-0.5">⚠︎</span>
          <span>
            This dealer&apos;s site blocks automated visitors, so we built the kit from its public archive ({brand.archivedFrom}). Double-check the logo and
            photos, and pick or type a current offer below.
          </span>
        </motion.div>
      )}

      {brand.readByClaude && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 flex items-start gap-3 rounded-2xl bg-blue/[.05] px-4 py-3 text-[13.5px] text-ink-2"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
          <span>
            Claude read this site: it picked the logo, read{" "}
            {brand.offerDetails?.length
              ? `${brand.offerDetails.length} offer${brand.offerDetails.length === 1 ? "" : "s"} (${brand.offerDetails.filter((o) => o.source === "banner").length} straight off banner images) with their fine print`
              : "the page for offers"}
            , and matched your colours.{brand.about ? <> “{brand.about}”</> : null}
            {brand.hours ? <span className="text-muted"> · {brand.hours}</span> : null}
          </span>
        </motion.div>
      )}

      <div className="mt-10 min-w-0">
        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <Card title="Identity" i={0}>
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileRef.current?.click()}
                className="group relative grid h-20 w-32 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-line-2 bg-bg-2 transition hover:border-blue"
              >
                {brand.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logo} alt="logo" className="max-h-14 max-w-[104px] object-contain" />
                ) : (
                  <ImageUp className="h-5 w-5 text-muted" />
                )}
                <span className="absolute inset-0 grid place-items-center bg-white/85 text-[12px] font-medium opacity-0 transition group-hover:opacity-100">
                  Upload logo
                </span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <div className="min-w-0 flex-1">
                <label className="text-[12px] text-muted">Dealership name</label>
                <input className={field + " mt-1"} value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} />
              </div>
            </div>
          </Card>

          <Card title="Brand colors" i={1}>
            <div className="flex flex-wrap items-center gap-2.5">
              {[...new Set([brand.colors.primary, ...brand.palette])].slice(0, 8).map((c) => {
                const on = c.toLowerCase() === brand.colors.primary.toLowerCase();
                return (
                  <motion.button
                    key={c}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setBrand({ ...brand, colors: { ...brand.colors, primary: c } })}
                    className={clsx("relative grid h-11 w-11 place-items-center rounded-full ring-offset-2 transition", on && "ring-2 ring-ink")}
                    style={{ background: c }}
                    title={c}
                  >
                    {on && <Check className="h-4 w-4 text-white mix-blend-difference" />}
                  </motion.button>
                );
              })}
              <label className="relative grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-dashed border-line-2 text-muted hover:border-blue hover:text-blue">
                <Plus className="h-4 w-4" />
                <input
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={brand.colors.primary}
                  onChange={(e) =>
                    setBrand({ ...brand, colors: { ...brand.colors, primary: e.target.value }, palette: [e.target.value, ...brand.palette].slice(0, 8) })
                  }
                />
              </label>
            </div>
            <div className="mt-4 font-mono text-[12px] text-muted">Primary {brand.colors.primary.toUpperCase()}</div>
          </Card>

          {!!brand.offerDetails?.length && (
            <Card title={`Live offers · ${brand.offerDetails.length} found on ${new Set(brand.offerDetails.map((d) => d.page).filter(Boolean)).size || 1} page${new Set(brand.offerDetails.map((d) => d.page).filter(Boolean)).size === 1 ? "" : "s"}`} className="md:col-span-2" i={2}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {brand.offerDetails.map((d) => {
                  const on = inputs.offer === d.headline;
                  const terms = [d.amount, d.term, d.dueAtSigning, d.apr].filter(Boolean) as string[];
                  return (
                    <div key={d.headline + (d.page ?? "")} className={clsx("flex flex-col overflow-hidden rounded-2xl border transition", on ? "border-ink shadow-[0_0_0_2px_#0a0b0d]" : "border-line")}>
                      {d.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.image} alt="" className="h-28 w-full bg-bg-2 object-contain" loading="lazy" />
                      )}
                      <div className="flex flex-1 flex-col p-3.5">
                        <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">
                          {d.kind === "apr" ? "Finance" : d.kind === "other" ? "Offer" : d.kind}
                          {d.model ? ` · ${d.model}` : ""}
                        </div>
                        <div className="mt-1 text-[14px] font-semibold leading-snug">{d.headline}</div>
                        {terms.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {terms.map((t) => (
                              <span key={t} className="rounded-full bg-bg-2 px-2 py-0.5 text-[11.5px] text-ink-2">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 text-[11.5px] text-muted">
                          {d.expires ? `Ends ${d.expires}` : "No end date shown"}
                          {d.page && (
                            <>
                              {" · "}
                              <a href={d.page} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                                {new URL(d.page).pathname.replace(/\/$/, "") || "home"}
                              </a>
                            </>
                          )}
                        </div>
                        {d.disclaimer && (
                          <details className="mt-2 text-[11.5px] text-muted">
                            <summary className="cursor-pointer select-none hover:text-ink">Fine print</summary>
                            <p className="mt-1 leading-relaxed">{d.disclaimer}</p>
                          </details>
                        )}
                        <div className="mt-auto pt-3">
                          <button
                            onClick={() => {
                              const v = matchVehicle(d.model ? `${d.model} ${d.headline}` : d.headline, brand.vehicles);
                              set({ offer: d.headline, ...(v ? { vehicleImage: v.image, vehicleName: v.title ?? inputs.vehicleName } : {}) });
                            }}
                            className={clsx("w-full rounded-full px-3 py-1.5 text-[12.5px] font-medium transition", on ? "bg-ink text-white" : "border border-line-2 hover:border-ink/30")}
                          >
                            {on ? "Using this offer" : "Use this offer"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Headline offer" className="md:col-span-2" i={2}>
            <div className="flex flex-wrap gap-2">
              {offers.map((o) => {
                const on = inputs.offer === o;
                const real = brand.offers.includes(o) && !SUGGESTED_OFFERS.includes(o);
                const read = brand.offerDetails?.find((d) => d.headline === o);
                return (
                  <button
                    key={o}
                    onClick={() => {
                      const v = matchVehicle(o, brand.vehicles);
                      set(v ? { offer: o, vehicleImage: v.image, vehicleName: v.title ?? inputs.vehicleName } : { offer: o });
                    }}
                    className={clsx(
                      "rounded-full border px-3.5 py-2 text-left text-[13px] transition",
                      on ? "border-ink bg-ink text-white" : "border-line-2 hover:border-ink/30"
                    )}
                  >
                    {o}
                    <span className={clsx("ml-2 text-[10px] uppercase tracking-[0.1em]", on ? "text-white/60" : "text-muted")}>
                      {read?.source === "banner" ? "from banner" : real ? "from site" : "idea"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <label className="text-[12px] text-muted">Offer (edit to match your real deal)</label>
                <input className={field + " mt-1"} value={inputs.offer} onChange={(e) => set({ offer: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] text-muted">Fine print</label>
                <input className={field + " mt-1"} value={inputs.offerSub} onChange={(e) => set({ offerSub: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] text-muted">Call to action</label>
                <input className={field + " mt-1"} value={inputs.cta} onChange={(e) => set({ cta: e.target.value })} />
              </div>
            </div>
          </Card>

          <Card title={`Hero vehicle · ${brand.vehicles.filter((v) => !v.stock).length} found on site`} className="md:col-span-2" i={3}>
            <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {brand.vehicles.map((v) => {
                const on = inputs.vehicleImage === v.image;
                return (
                  <motion.button
                    key={v.image}
                    whileHover={{ y: -3 }}
                    onClick={() => set({ vehicleImage: v.image, vehicleName: v.title && !/featured/i.test(v.title) ? v.title : inputs.vehicleName })}
                    className={clsx("relative h-28 w-40 shrink-0 overflow-hidden rounded-2xl border-2 bg-bg-2 transition", on ? "border-blue" : "border-transparent")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.image}
                      alt={v.title ?? ""}
                      className="h-full w-full object-cover"
                      onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = "none")}
                    />
                    {(v.stock || v.banner) && (
                      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium">{v.stock ? "Stock" : "Banner"}</span>
                    )}
                    {on && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-blue text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
            <div className="mt-4 max-w-[360px]">
              <label className="text-[12px] text-muted">Vehicle name</label>
              <input className={field + " mt-1"} value={inputs.vehicleName} onChange={(e) => set({ vehicleName: e.target.value })} />
            </div>
          </Card>

          <Card title="Contact" className="md:col-span-2" i={4}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[12px] text-muted">Phone</label>
                <input className={field + " mt-1"} value={brand.phone ?? ""} onChange={(e) => setBrand({ ...brand, phone: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] text-muted">City</label>
                <input className={field + " mt-1"} value={brand.city ?? ""} onChange={(e) => setBrand({ ...brand, city: e.target.value })} />
              </div>
              <div>
                <label className="text-[12px] text-muted">State</label>
                <input className={field + " mt-1"} value={brand.state ?? ""} onChange={(e) => setBrand({ ...brand, state: e.target.value })} />
              </div>
            </div>
            {brand.makes.length > 0 && (
              <div className="mt-4 text-[13px] text-muted">
                Brands detected: <span className="text-ink">{brand.makes.join(", ")}</span>
              </div>
            )}
          </Card>
        </div>
      </div>
      {onDelete && !fresh && <DangerZone name={brand.name} onDelete={onDelete} />}
    </div>
  );
}
