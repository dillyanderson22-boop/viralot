"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Check, Clock, FileUp, Link2, Loader2, RefreshCw, Search, Sparkles, TrendingDown, TriangleAlert, Upload, X } from "lucide-react";
import clsx from "clsx";
import { byId } from "@/lib/ad/catalog";
import { AGED_FORMATS, CAR_FORMATS, agedReason, daysOnLot, inputsForCar, mergeInventory, type OfferStyle, type RawScanCar } from "@/lib/inventory";
import type { Dealer, InventoryCar, PlanItem } from "@/lib/workspace";
import { Portal } from "./Portal";
import { Button, SectionLabel, SplitFlap, ease } from "./ui";
import { CarImg } from "./CarImg";
import { photosFor } from "@/lib/specials";

type Filter = "all" | "new" | "used" | "aged" | "drop";
type Sort = "age" | "price" | "year";

export function InventoryView({
  dealer,
  onSave,
  onFeed,
  onUseCar,
  onPlan,
}: {
  dealer: Dealer;
  onSave: (inv: InventoryCar[], links?: Dealer["brand"]["inventoryLinks"]) => void;
  onFeed: (url: string | undefined) => void;
  onUseCar: (car: InventoryCar) => void;
  onPlan: (items: PlanItem[]) => void;
}) {
  const inv = useMemo(() => dealer.inventory ?? [], [dealer.inventory]);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("age");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [composer, setComposer] = useState<null | { style: OfferStyle }>(null);

  const [importOpen, setImportOpen] = useState(!(dealer.inventory?.length));
  const [feedUrl, setFeedUrl] = useState(dealer.inventoryFeed ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  /** Import from the dealer's own feed (link or file). */
  const importFeed = async (src: { url: string } | { file: File }) => {
    setScanning(true);
    setError(null);
    setStep("url" in src ? "Reading your inventory feed" : `Reading ${src.file.name}`);
    try {
      let res: Response;
      if ("url" in src) {
        res = await fetch("/api/inventory/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: src.url, site: dealer.brand.url }) });
      } else {
        const fd = new FormData();
        fd.append("file", src.file);
        fd.append("site", dealer.brand.url);
        res = await fetch("/api/inventory/import", { method: "POST", body: fd });
      }
      const d = (await res.json()) as { cars?: RawScanCar[]; error?: string; mappedBy?: string };
      if (!res.ok || !d.cars) throw new Error(d.error ?? "Import failed");
      onSave(mergeInventory(inv, d.cars));
      if ("url" in src) onFeed(src.url);
      setImportOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const scan = async () => {
    if (dealer.inventoryFeed) return importFeed({ url: dealer.inventoryFeed });
    setScanning(true);
    setError(null);
    setStep("Starting");
    const found: RawScanCar[] = [];
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ url: dealer.brand.url, links: dealer.brand.inventoryLinks }),
      });
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { type: string; label?: string; cars?: RawScanCar[]; message?: string };
          if (e.type === "step") setStep(e.label!);
          if (e.type === "cars") found.push(...e.cars!);
          if (e.type === "error") setError(e.message!);
        }
      }
      if (found.length) onSave(mergeInventory(inv, found));
    } catch {
      setError("Scan failed — check your connection and try again.");
    } finally {
      setScanning(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: inv.length,
      new: inv.filter((c) => c.condition === "new").length,
      used: inv.filter((c) => c.condition !== "new").length,
      aged: inv.filter((c) => agedReason(c)).length,
      drop: inv.filter((c) => c.badges.some((b) => /drop|reduced/.test(b))).length,
    }),
    [inv]
  );

  const list = useMemo(() => {
    let l = inv.slice();
    if (filter === "new") l = l.filter((c) => c.condition === "new");
    if (filter === "used") l = l.filter((c) => c.condition !== "new");
    if (filter === "aged") l = l.filter((c) => agedReason(c));
    if (filter === "drop") l = l.filter((c) => c.badges.some((b) => /drop|reduced/.test(b)));
    if (q.trim()) {
      const n = q.toLowerCase();
      l = l.filter((c) => `${c.title} ${c.stock} ${c.vin}`.toLowerCase().includes(n));
    }
    if (sort === "age") l.sort((a, b) => daysOnLot(b) - daysOnLot(a));
    if (sort === "price") l.sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9));
    if (sort === "year") l.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return l;
  }, [inv, filter, sort, q]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 12 ? [...p, id] : p));
  const agedCars = inv.filter((c) => agedReason(c));

  const scanned = dealer.inventoryScannedAt;

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-36 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Inventory</SectionLabel>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-[48px]">Ads for the cars on your lot.</h1>
          <p className="mt-2 max-w-[560px] text-[15px] text-muted">
            Pull your live listings, then turn any car — or a whole set of aged units — into ads with its real photo, price and stock number.
          </p>
        </div>
        <div className="flex items-end gap-5">
          {inv.length > 0 &&
            (
              [
                ["Vehicles", counts.all],
                ["Aged", counts.aged],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="text-right">
                <SplitFlap value={String(v)} className="text-[24px]" />
                <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted">{l}</div>
              </div>
            ))}
          <Button variant="soft" onClick={() => setImportOpen(!importOpen)} disabled={scanning} size="lg">
            <Upload className="h-4 w-4" /> Import feed
          </Button>
          <Button onClick={scan} disabled={scanning} size="lg">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {inv.length ? (dealer.inventoryFeed ? "Refresh" : "Rescan") : "Scan inventory"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {importOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease }}
            className="overflow-hidden"
          >
            <div className="mt-6 rounded-[24px] border border-line bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[16px] font-semibold tracking-[-0.02em]">Import your inventory feed</div>
                  <p className="mt-1 max-w-[640px] text-[13.5px] text-muted">
                    The most reliable way in, and the only one for sites that block automated visitors. Use the feed your website provider or DMS already makes for Facebook or Google vehicle ads, or any CSV export. CSV, TSV, XML and JSON all work; unusual columns are mapped by Claude.
                  </p>
                </div>
                <button onClick={() => setImportOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-bg-2 hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (feedUrl.trim()) importFeed({ url: feedUrl.trim() });
                  }}
                  className="flex gap-2"
                >
                  <div className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line-2 bg-white px-3 focus-within:border-blue focus-within:shadow-[0_0_0_4px_rgba(47,107,255,.12)]">
                    <Link2 className="h-4 w-4 shrink-0 text-muted" />
                    <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} placeholder="https://…/inventory-feed.csv" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
                  </div>
                  <Button type="submit" disabled={!feedUrl.trim() || scanning} className="h-11">
                    Import
                  </Button>
                </form>
                <div className="text-center text-[12px] uppercase tracking-[0.14em] text-muted">or</div>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.tsv,.txt,.xml,.json,text/csv,application/xml,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importFeed({ file: f });
                      e.target.value = "";
                    }}
                  />
                  <Button variant="soft" onClick={() => fileRef.current?.click()} disabled={scanning} className="h-11 w-full">
                    <FileUp className="h-4 w-4" /> Upload a file
                  </Button>
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-bg-2/70 p-4 text-[12.5px] text-ink-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">What we read from each row</span>
                  <a href="/viralot-feed-template.csv" download className="inline-flex items-center gap-1.5 font-medium text-blue hover:underline">
                    <FileUp className="h-3.5 w-3.5 rotate-180" /> Download a feed template (CSV)
                  </a>
                </div>
                <p className="mt-2 leading-relaxed text-muted">
                  <span className="text-ink-2">The car:</span> VIN, stock number, year, make, model, trim, new/used, color, mileage, photos (several allowed, separated by |), description and the listing link.{" "}
                  <span className="text-ink-2">Its offers:</span> MSRP, sale or internet price, lease payment + term + due at signing, APR + term, monthly payment, and any rebate, customer cash, dealer discount, trade-in or loyalty / military / college bonus columns. Each becomes its own tick box when you make an ad. Column names don&apos;t need to match exactly.
                </p>
              </div>
              {dealer.inventoryFeed && (
                <div className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> Refresh re-reads this feed.
                  <button onClick={() => (onFeed(undefined), setFeedUrl(""))} className="font-medium text-ink underline underline-offset-4">
                    Stop using it
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scanning && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="ai-ring fast mt-6 overflow-hidden rounded-2xl border border-line bg-white"
          >
            <div className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
              <Loader2 className="h-4 w-4 animate-spin text-blue" />
              <span className="font-medium">{step}</span>
              <span className="ml-auto text-[12px] text-muted">usually 1–2 minutes</span>
            </div>
            <div className="h-[2px] overflow-hidden bg-ink/5">
              <div className="shimmer h-full w-full bg-blue/40" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && !scanning && (
        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13.5px] text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            {error}
            {!importOpen && /block|couldn't read/i.test(error) && (
              <>
                {" "}
                <button onClick={() => setImportOpen(true)} className="font-medium underline underline-offset-4">
                  Import the dealer&apos;s inventory feed instead
                </button>
              </>
            )}
          </span>
        </div>
      )}

      {!inv.length && !scanning && (
        <div className="mt-10 grid place-items-center rounded-[28px] border border-dashed border-line-2 bg-bg-2/40 px-6 py-20 text-center">
          <div className="text-[44px]">🚗</div>
          <h2 className="mt-3 text-[22px] font-semibold tracking-[-0.03em]">No inventory yet</h2>
          <p className="mt-2 max-w-[440px] text-[14px] text-muted">We&apos;ll read {dealer.brand.name}&apos;s new and used listings — photos, prices, stock numbers — and keep track of how long each car has been on the lot.</p>
          <Button className="mt-6" onClick={scan}>
            <RefreshCw className="h-4 w-4" /> Scan inventory
          </Button>
        </div>
      )}

      {inv.length > 0 && (
        <>
          {agedCars.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex flex-wrap items-center gap-4 rounded-[24px] border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 sm:p-5"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-[22px]">⏳</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">Move aged inventory</div>
                <div className="text-[13px] text-amber-900/80">
                  {agedCars.length} car{agedCars.length === 1 ? " has" : "s have"} been sitting, are outgoing models, or dropped in price. Make a &ldquo;priced to move&rdquo; ad for each.
                </div>
              </div>
              <Button
                onClick={() => {
                  setPicked(agedCars.slice(0, 12).map((c) => c.id));
                  setComposer({ style: "aged" });
                }}
              >
                <Sparkles className="h-4 w-4" /> Make {Math.min(12, agedCars.length)} aged-inventory ads
              </Button>
            </motion.div>
          )}

          <div className="sticky top-[98px] z-30 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/85 px-4 py-3 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:top-0">
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {(
                [
                  ["all", "All"],
                  ["new", "New"],
                  ["used", "Used"],
                  ["aged", "Aged"],
                  ["drop", "Price drop"],
                ] as [Filter, string][]
              ).map(([f, l]) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={clsx("relative h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors", filter === f ? "text-white" : "text-ink-2 hover:text-ink")}
                >
                  {filter === f && <motion.span layoutId="invf" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="relative">
                    {l} <span className={filter === f ? "text-white/60" : "text-muted"}>{counts[f]}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 items-center gap-2 rounded-full border border-line-2 bg-white px-3">
                <Search className="h-3.5 w-3.5 text-muted" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Model, stock #, VIN" className="w-36 bg-transparent text-[13px] outline-none" />
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-full bg-transparent px-2 text-[13px] font-medium text-ink-2 outline-none">
                <option value="age">Longest on lot</option>
                <option value="price">Lowest price</option>
                <option value="year">Newest year</option>
              </select>
            </div>
          </div>
          {scanned && <div className="mt-3 text-[12px] text-muted">Last scanned {new Date(scanned).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>}

          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((c) => {
              const on = picked.includes(c.id);
              const aged = agedReason(c);
              const days = daysOnLot(c);
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className={clsx(
                    "group relative overflow-hidden rounded-[20px] border bg-white transition-all",
                    on ? "border-blue shadow-[0_0_0_2px_#2f6bff]" : "border-line hover:-translate-y-0.5 hover:shadow-[0_24px_40px_-28px_rgba(10,11,13,.4)]"
                  )}
                >
                  <button onClick={() => toggle(c.id)} className="relative block aspect-[4/3] w-full bg-[#f6f7f9]" aria-label={on ? "Unselect" : "Select"}>
                    <CarImg
                      srcs={photosFor(c, inv, dealer.brand.vehicles)}
                      alt={c.title}
                      className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-[1.03]"
                      fallback={<span className="grid h-full place-items-center text-[36px]">🚗</span>}
                    />
                    <span className={clsx("absolute left-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full border-2 transition", on ? "border-blue bg-blue text-white" : "border-white bg-white/80 text-transparent shadow")}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1">
                      {aged && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">⏳ {aged}</span>}
                      {c.badges.some((b) => /drop|reduced/.test(b)) && !aged?.includes("Price") && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                          <TrendingDown className="h-3 w-3" /> Price drop
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="p-3.5">
                    <div className="truncate text-[13.5px] font-semibold">{c.title}</div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      {(() => {
                        // the headline deal from the feed, else the price, else MSRP
                        const deal = c.offers?.find((o) => o.kind !== "msrp" && o.kind !== "price");
                        const text = deal ? deal.value : c.price ? "$" + c.price.toLocaleString("en-US") : c.msrp ? "$" + c.msrp.toLocaleString("en-US") : "See dealer";
                        const tag = deal ? (deal.kind === "finance" ? "finance" : deal.kind === "lease" ? "lease" : deal.label.toLowerCase()) : c.price ? "" : c.msrp ? "MSRP" : "";
                        return (
                          <span className="min-w-0 truncate text-[18px] font-semibold tracking-[-0.02em] tabular-nums">
                            {text}
                            {tag && <span className="ml-1.5 text-[11px] font-medium text-muted">{tag}</span>}
                          </span>
                        );
                      })()}
                      <span className="flex items-center gap-1 text-[11.5px] text-muted">
                        <Clock className="h-3 w-3" />
                        {days}d
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11.5px] text-muted">
                      {[
                        c.condition === "new" ? "New" : c.condition === "cpo" ? "Certified" : "Used",
                        c.mileage && `${c.mileage.toLocaleString("en-US")} mi`,
                        c.stock && `#${c.stock}`,
                        c.offers?.filter((o) => o.kind !== "msrp" && o.kind !== "price").length ? `${c.offers.filter((o) => o.kind !== "msrp" && o.kind !== "price").length} offer${c.offers.filter((o) => o.kind !== "msrp" && o.kind !== "price").length === 1 ? "" : "s"}` : "",
                        c.expires && `ends ${c.expires}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <button
                      onClick={() => onUseCar(c)}
                      className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-line-2 text-[12.5px] font-medium transition hover:border-ink hover:bg-ink hover:text-white"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Make ads for this car
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
          {!list.length && <div className="py-16 text-center text-muted">No vehicles match.</div>}
        </>
      )}

      {/* selection tray */}
      <Portal>
        <AnimatePresence>
          {picked.length > 0 && !composer && (
            <motion.div
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 lg:pl-[264px]"
            >
              <div className="ai-ring flex w-full max-w-[600px] items-center gap-3 rounded-full border border-line bg-white/90 py-2 pl-5 pr-2 shadow-[0_30px_80px_-20px_rgba(10,11,13,.35)] backdrop-blur-xl">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">
                    {picked.length} car{picked.length > 1 ? "s" : ""} selected
                  </div>
                  <div className="text-[12px] text-muted">One ad per car, each with its own photo and price</div>
                </div>
                <button onClick={() => setPicked([])} className="hidden h-9 rounded-full px-3 text-[13px] text-muted hover:text-ink sm:block">
                  Clear
                </button>
                <Button onClick={() => setComposer({ style: "price" })} className="h-11">
                  <Sparkles className="h-4 w-4" /> Make ads
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {composer && (
            <Composer
              dealer={dealer}
              cars={inv.filter((c) => picked.includes(c.id))}
              initial={composer.style}
              onClose={() => setComposer(null)}
              onGo={(items) => {
                setComposer(null);
                setPicked([]);
                onPlan(items);
              }}
            />
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

function Composer({
  dealer,
  cars,
  initial,
  onClose,
  onGo,
}: {
  dealer: Dealer;
  cars: InventoryCar[];
  initial: OfferStyle;
  onClose: () => void;
  onGo: (items: PlanItem[]) => void;
}) {
  const [style, setStyle] = useState<OfferStyle>(initial);
  const [custom, setCustom] = useState("This week only: {price}");
  const [formats, setFormats] = useState<string[]>([]);
  const pool = style === "aged" ? AGED_FORMATS : CAR_FORMATS;
  const chosen = formats.length ? formats : pool;
  const items: PlanItem[] = cars.map((c, i) => ({ templateId: chosen[i % chosen.length], inputs: inputsForCar(c, dealer.inputs, style, custom) }));
  const sample = items[0]?.inputs.offer;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-xl" onClick={onClose} />
      <motion.div
        initial={{ y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ duration: 0.45, ease }}
        className="relative max-h-[90vh] w-full max-w-[640px] overflow-auto rounded-[28px] border border-line bg-white p-6 shadow-[0_50px_120px_-40px_rgba(10,11,13,.5)]"
      >
        <button onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full hover:bg-bg-2" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-[24px] font-semibold tracking-[-0.04em]">
          {cars.length} ad{cars.length > 1 ? "s" : ""}, one per car
        </h2>
        <p className="mt-1 text-[13.5px] text-muted">Each ad uses that car&apos;s own photo, title, price and stock number.</p>

        <div className="mt-6 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Offer wording</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(
            [
              ["price", "Show the price", "“Only $24,929”"],
              ["aged", "Priced to move", "“Priced to move: $24,929”"],
              ["custom", "My own wording", "Use {price} and {car}"],
            ] as [OfferStyle, string, string][]
          ).map(([v, l, d]) => (
            <button
              key={v}
              onClick={() => setStyle(v)}
              className={clsx("rounded-2xl border p-3 text-left transition", style === v ? "border-blue bg-blue/[.04] shadow-[0_0_0_3px_rgba(47,107,255,.1)]" : "border-line hover:border-ink/20")}
            >
              <div className="text-[13px] font-semibold">{l}</div>
              <div className="mt-0.5 text-[12px] text-muted">{d}</div>
            </button>
          ))}
        </div>
        {style === "custom" && (
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-line-2 px-3.5 text-[14px] outline-none focus:border-blue"
          />
        )}
        {sample && <div className="mt-2 text-[12.5px] text-muted">First ad will say: <span className="font-medium text-ink">{sample}</span></div>}

        <div className="mt-6 flex items-baseline justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Formats</div>
          <div className="text-[12px] text-muted">{formats.length ? `${formats.length} picked — rotated across cars` : "Auto: a different format per car"}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CAR_FORMATS.map((id) => {
            const t = byId(id);
            if (!t) return null;
            const on = formats.includes(id);
            return (
              <button
                key={id}
                onClick={() => setFormats((f) => (on ? f.filter((x) => x !== id) : [...f, id]))}
                className={clsx("rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition", on ? "border-ink bg-ink text-white" : "border-line-2 text-ink-2 hover:border-ink/30")}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        <div className="mt-6 max-h-[180px] space-y-1.5 overflow-auto rounded-2xl bg-bg-2/60 p-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-[12.5px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.inputs.vehicleImage} alt="" className="h-8 w-12 rounded-md object-contain" />
              <span className="min-w-0 flex-1 truncate font-medium">{it.inputs.vehicleName}</span>
              <span className="shrink-0 text-muted">{byId(it.templateId)?.name}</span>
            </div>
          ))}
        </div>

        <Button size="lg" className="mt-6 w-full" onClick={() => onGo(items)}>
          <Sparkles className="h-4 w-4" /> Generate {items.length} ad{items.length > 1 ? "s" : ""}
        </Button>
      </motion.div>
    </motion.div>
  );
}
