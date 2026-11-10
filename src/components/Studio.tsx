"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AdInputs, Brand } from "@/lib/types";
import { defaultInputs, DEMO_BRAND, STOCK_VEHICLES } from "@/lib/demo";
import { byId } from "@/lib/ad/catalog";
import { buildReport } from "@/lib/captions";
import { uid, useHashRoute, useWorkspace, type Dealer, type SavedAd } from "@/lib/workspace";
import { Home } from "./Home";
import { Scanning } from "./Scanning";
import { BrandKit } from "./BrandKit";
import { Library } from "./Library";
import { Generating } from "./Generating";
import { AdsView } from "./AdsView";
import { TopBar } from "./TopBar";
import { AccessGate } from "./AccessGate";
import { Shell, type Section } from "./Shell";
import { pollFilm, startFilm } from "@/lib/ad/film";
import { CUSTOM_ID } from "@/lib/cinematic";
import { fetchBrandRules } from "@/lib/useBrandRules";
import { styleOf } from "@/lib/guidelines";
import { coveredByKit, oemFaces } from "@/lib/oem";
import { SpecialsView } from "./SpecialsView";
import { detailsFromSpecials, inputsForCar as carInputs } from "@/lib/specials";
import { InventoryView } from "./InventoryView";
import { CalendarView } from "./CalendarView";
import { SpotStudio } from "./SpotStudio";
import { inputsForCar } from "@/lib/inventory";
import { autoPlan } from "@/lib/calendar";
import { ease } from "./ui";

export type Stage = "home" | "scanning" | "brand" | "library" | "generating" | "results";

export function Studio() {
  const { ws, update } = useWorkspace();
  const { route, go } = useHashRoute();
  const [locked, setLocked] = useState(false);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  /** Dealer being re-scanned from its brand kit (refreshed in place, never duplicated). */
  const [rescanOf, setRescanOf] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/access", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { required: boolean; granted: boolean }) => setLocked(d.required && !d.granted))
      .catch(() => {});
  }, []);

  const dealerId = route && "id" in route ? route.id : null;
  const dealer = ws?.dealers.find((d) => d.id === dealerId) ?? null;

  // Land returning users straight in their workspace; unknown dealer ids fall back gracefully.
  useEffect(() => {
    if (!ws || !route) return;
    if (route.name === "welcome" && ws.dealers.length) {
      const last = ws.dealers.find((d) => d.id === ws.activeId) ?? ws.dealers[0];
      go({ name: "create", id: last.id }, true);
    } else if ("id" in route && !dealer) {
      go(ws.dealers.length ? { name: "create", id: ws.dealers[0].id } : { name: "welcome" }, true);
    } else if (route.name === "generating" && dealer && !dealer.selected.length && !dealer.plan?.length) {
      go({ name: "create", id: dealer.id }, true);
    }
  }, [ws, route, dealer, go]);

  useEffect(() => {
    if (dealer && ws?.activeId !== dealer.id) update((w) => ({ ...w, activeId: dealer.id }));
  }, [dealer, ws?.activeId, update]);

  // ---------- dealer mutations ----------
  const patchDealer = useCallback(
    (id: string, patch: Partial<Dealer>) =>
      update((w) => ({ ...w, dealers: w.dealers.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) })),
    [update]
  );

  const addDealer = (b: Brand, rescanId?: string | null) => {
    const vehicles = [...b.vehicles.filter((v) => !v.stock), ...STOCK_VEHICLES];
    const brand = { ...b, vehicles };
    // Re-scanning a dealership we already have refreshes it instead of duplicating it.
    const existing =
      ws?.dealers.find((d) => d.id === rescanId) ??
      ws?.dealers.find((d) => new URL(d.brand.url).hostname === new URL(brand.url).hostname && brand.url !== DEMO_BRAND.url);
    if (existing) {
      // a logo the dealer uploaded by hand beats whatever the scan found
      const uploaded = existing.brand.logo?.startsWith("data:") ? existing.brand.logo : undefined;
      patchDealer(existing.id, { brand: { ...brand, logo: uploaded ?? brand.logo ?? existing.brand.logo } });
      go({ name: "brand", id: existing.id }, true);
      return;
    }
    const d: Dealer = { id: uid(), brand, inputs: defaultInputs(brand), selected: [], createdAt: Date.now(), updatedAt: Date.now() };
    update((w) => ({ ...w, dealers: [...w.dealers, d], activeId: d.id }));
    go({ name: "brand", id: d.id, fresh: true }, true);
  };

  const deleteDealer = (id: string) => {
    const rest = ws?.dealers.filter((d) => d.id !== id) ?? [];
    update((w) => ({ ...w, dealers: w.dealers.filter((d) => d.id !== id), ads: w.ads.filter((a) => a.dealerId !== id), activeId: rest[0]?.id ?? null }));
    go(rest.length ? { name: "create", id: rest[0].id } : { name: "welcome" }, true);
  };

  const genItems = useMemo(
    () => (dealer ? (dealer.plan?.length ? dealer.plan : dealer.selected.map((templateId) => ({ templateId, inputs: dealer.inputs }))) : []),
    [dealer]
  );

  const updateAd = (id: string, patch: Partial<SavedAd>) => update((w) => ({ ...w, ads: w.ads.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  const finishGenerating = () => {
    if (!dealer) return;
    const batchId = uid();
    const now = Date.now();
    const ads: SavedAd[] = genItems
      .map((it, i) => {
        const t = byId(it.templateId);
        if (!t) return null;
        return {
          id: uid(),
          dealerId: dealer.id,
          batchId,
          templateId: it.templateId,
          inputs: { ...it.inputs },
          score: buildReport(t, dealer.brand, it.inputs).score,
          createdAt: now + i,
        } satisfies SavedAd;
      })
      .filter((a): a is SavedAd => !!a);
    update((w) => ({
      ...w,
      ads: [...w.ads, ...ads],
      dealers: w.dealers.map((d) => (d.id === dealer.id ? { ...d, selected: d.plan?.length ? d.selected : [], plan: undefined } : d)),
    }));
    go({ name: "ads", id: dealer.id, batch: batchId }, true);
    // cinematic templates: film the dealer's car right away (two at a time; Higgsfield caps parallel jobs)
    const film = dealer.film ?? { on: true, tier: "good" as const };
    if (film.on && !dealer.plan?.length) {
      const tier = film.tier;
      const queue = ads.filter((a) => byId(a.templateId)?.engine === "cinematic");
      const run = async () => {
        for (let a = queue.shift(); a; a = queue.shift()) {
          const ad = a;
          try {
            const cine = await startFilm(ad.inputs, String(byId(ad.templateId)?.params.cid), tier);
            updateAd(ad.id, { cine });
          } catch (e) {
            updateAd(ad.id, { cine: { requestId: "", status: "failed", startedAt: Date.now(), car: ad.inputs.vehicleImage, error: (e as Error).message } });
          }
        }
      };
      // only when Higgsfield is set up; otherwise the ads stay as previews
      void fetch("/api/cinematic", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { available?: boolean }) => {
          if (d.available) void Promise.all([run(), run()]);
        })
        .catch(() => {});
    }
  };

  // brand guidelines (admin): the dealer's makes pick the sections; their fonts and required disclaimer go on the brand
  const makesKey = [...(dealer?.brand.makes ?? []), ...new Set((dealer?.inventory ?? []).map((c) => c.make ?? ""))].join(",");
  useEffect(() => {
    if (!dealer) return;
    let alive = true;
    // makes from the scan plus the feed's own cars
    const makes = [...new Set([...dealer.brand.makes, ...(dealer.inventory ?? []).map((c) => c.make).filter(Boolean) as string[]])];
    fetchBrandRules(makes).then((rules) => {
      if (!alive) return;
      const oem = oemFaces(makes);
      const kit = coveredByKit(makes);
      const base = rules.length ? styleOf(rules) : undefined;
      const style = base || oem || kit ? { ...(base ?? {}), ...(oem ? { make: oem.make, family: oem.family, faces: oem.faces, figure: oem.figure } : {}), ...(kit ? { noCaps: true, stockCaveat: true } : {}) } : undefined;
      if (JSON.stringify(style ?? null) !== JSON.stringify(dealer.brand.compliance ?? null)) patchDealer(dealer.id, { brand: { ...dealer.brand, compliance: style } });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer?.id, makesKey]);

  // AI filming runs in the background: check every running job, wherever the dealer is in the app
  const wsRef = useRef(ws);
  useEffect(() => {
    wsRef.current = ws;
  });
  const filming = ws?.ads.some((a) => a.cine && (a.cine.status === "queued" || a.cine.status === "in_progress")) ?? false;
  useEffect(() => {
    if (!filming) return;
    let alive = true;
    const tick = async () => {
      const running = (wsRef.current?.ads ?? []).filter((a) => a.cine && (a.cine.status === "queued" || a.cine.status === "in_progress"));
      for (const ad of running) {
        try {
          const patch = await pollFilm(ad);
          if (alive && patch) updateAd(ad.id, patch);
        } catch {}
      }
    };
    tick();
    const iv = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filming]);

  /** Put one ad on the next free day, leaving everything else as it is. */
  const scheduleOne = (id: string) => {
    if (!ws || !dealer) return;
    const mine = ws.ads.filter((a) => a.dealerId === dealer.id && (a.id === id || Object.keys(a.schedule ?? {}).length));
    const sched = autoPlan(mine).get(id);
    if (sched) updateAd(id, { schedule: sched });
  };

  const adCtx = useMemo(() => (dealer ? { brand: dealer.brand, ad: dealer.inputs } : null), [dealer]);

  if (locked) return <AccessGate onUnlock={() => setLocked(false)} />;
  if (!ws || !route) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-blue" />
      </div>
    );
  }

  // ---------- onboarding (no dealer context) ----------
  if (route.name === "welcome" || route.name === "new") {
    const scanning = scanUrl !== null;
    return (
      <div className="relative min-h-screen">
        {/* the landing page brings its own cinematic nav */}
        {scanning && (
          <TopBar
            stage="scanning"
            brand={null}
            onNav={() => setScanUrl(null)}
            canGenerate={false}
            onBack={ws.dealers.length ? () => go({ name: "create", id: ws.activeId ?? ws.dealers[0].id }) : undefined}
          />
        )}
        <AnimatePresence mode="wait">
          <motion.main
            key={scanning ? "scan" : "home"}
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
            transition={{ duration: 0.55, ease }}
          >
            {scanning ? (
              <Scanning
                url={scanUrl!}
                onDone={(b) => {
                  setScanUrl(null);
                  setRescanOf(null);
                  addDealer(b, rescanOf);
                }}
                onCancel={() => {
                  setScanUrl(null);
                  if (rescanOf) go({ name: "brand", id: rescanOf });
                  setRescanOf(null);
                }}
              />
            ) : (
              <Home
                onScan={setScanUrl}
                onDemo={() => addDealer(DEMO_BRAND)}
                adding={ws.dealers.length > 0}
                onBack={ws.dealers.length ? () => go({ name: "create", id: ws.activeId ?? ws.dealers[0].id }) : undefined}
              />
            )}
          </motion.main>
        </AnimatePresence>
      </div>
    );
  }

  if (!dealer || !adCtx) return null;

  if (route.name === "generating") {
    return <Generating brand={dealer.brand} items={genItems} onDone={finishGenerating} />;
  }

  const section: Section =
    route.name === "ads"
      ? "ads"
      : route.name === "brand"
        ? "brand"
        : route.name === "inventory"
          ? "inventory"
          : route.name === "calendar"
            ? "calendar"
            : route.name === "spots"
              ? "spots"
              : route.name === "specials"
                ? "specials"
                : "create";
  const dealerAds = ws.ads.filter((a) => a.dealerId === dealer.id);

  return (
    <Shell
      ws={ws}
      dealer={dealer}
      section={section}
      onNav={(s) => go({ name: s, id: dealer.id } as never)}
      onSwitch={(id) => go({ name: section, id } as never)}
      onAdd={() => go({ name: "new" })}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={section + dealer.id}
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
          transition={{ duration: 0.45, ease }}
        >
          {section === "create" && (
            <Library
              ctx={adCtx}
              selected={dealer.selected}
              setSelected={(s) => patchDealer(dealer.id, { selected: s })}
              setInputs={(i: AdInputs) => patchDealer(dealer.id, { inputs: i })}
              onGenerate={() => {
                patchDealer(dealer.id, { plan: undefined });
                go({ name: "generating", id: dealer.id });
              }}
              onEditBrand={() => go({ name: "brand", id: dealer.id })}
              ads={dealerAds}
              event={dealer.event ?? null}
              setEvent={(e) => patchDealer(dealer.id, { event: e })}
              inventory={dealer.inventory}
              onImport={() => go({ name: "inventory", id: dealer.id })}
              film={dealer.film ?? { on: true, tier: "good" }}
              setFilm={(film) => patchDealer(dealer.id, { film })}
              onCustom={async ({ prompt, refs, thumbs, seconds, tier }) => {
                // start filming first so any problem shows on the card; then save the ad and open it
                const inputs = { ...dealer.inputs, direction: prompt, promptMode: "own" as const, seconds, refThumbs: thumbs, cinematic: undefined };
                const job = await startFilm(inputs, CUSTOM_ID, tier, prompt, "own", refs);
                const tpl = byId(CUSTOM_ID)!;
                const { refIds, ...cine } = job;
                const ad: SavedAd = { id: uid(), dealerId: dealer.id, batchId: uid(), templateId: CUSTOM_ID, inputs: { ...inputs, refIds }, score: buildReport(tpl, dealer.brand, inputs).score, createdAt: Date.now(), cine };
                update((w) => ({ ...w, ads: [...w.ads, ad] }));
                go({ name: "ads", id: dealer.id, ad: ad.id });
              }}
            />
          )}
          {section === "spots" && (
            <SpotStudio
              dealer={dealer}
              setInputs={(i: AdInputs) => patchDealer(dealer.id, { inputs: i })}
              setDraft={(spot) => patchDealer(dealer.id, { spot })}
              patchDealer={(p) => patchDealer(dealer.id, p)}
              onGenerate={(plan) => {
                patchDealer(dealer.id, { plan });
                go({ name: "generating", id: dealer.id });
              }}
              onImport={() => go({ name: "inventory", id: dealer.id })}
            />
          )}
          {section === "specials" && (
            <SpecialsView
              dealer={dealer}
              onSave={(specials) => {
                const details = detailsFromSpecials(specials);
                patchDealer(dealer.id, {
                  brand: { ...dealer.brand, specials, specialsScannedAt: Date.now(), offerDetails: details, offers: [...new Set([...details.map((d) => d.headline), ...dealer.brand.offers])].slice(0, 24) },
                });
              }}
              onUse={(inputs, to) => {
                patchDealer(dealer.id, { inputs, spot: undefined });
                go({ name: to, id: dealer.id });
              }}
            />
          )}
          {section === "inventory" && (
            <InventoryView
              dealer={dealer}
              onSave={(inventory) => patchDealer(dealer.id, { inventory, inventoryScannedAt: Date.now() })}
              onFeed={(inventoryFeed) => patchDealer(dealer.id, { inventoryFeed })}
              onUseCar={(car) => {
                const deals = (car.offers ?? []).filter((o) => o.kind !== "msrp" && o.kind !== "price");
                patchDealer(dealer.id, { inputs: car.offers?.length ? carInputs(dealer.inputs, car, deals.length ? deals : car.offers.slice(0, 1)) : inputsForCar(car, dealer.inputs, "price") });
                go({ name: "create", id: dealer.id });
              }}
              onPlan={(plan) => {
                patchDealer(dealer.id, { plan });
                go({ name: "generating", id: dealer.id });
              }}
            />
          )}
          {section === "calendar" && route.name === "calendar" && (
            <CalendarView
              dealer={dealer}
              ads={dealerAds}
              week={route.week}
              onWeek={(week) => go({ name: "calendar", id: dealer.id, week }, true)}
              onUpdate={updateAd}
              onOpenAd={(ad) => go({ name: "ads", id: dealer.id, ad })}
              onCreate={() => go({ name: "create", id: dealer.id })}
            />
          )}
          {section === "brand" && (
            <BrandKit
              brand={dealer.brand}
              setBrand={(b) => patchDealer(dealer.id, { brand: b })}
              inputs={dealer.inputs}
              setInputs={(i) => patchDealer(dealer.id, { inputs: i })}
              onNext={() => go({ name: "create", id: dealer.id })}
              fresh={route.name === "brand" && !!route.fresh}
              onDelete={() => deleteDealer(dealer.id)}
              onRescan={
                dealer.brand.url === DEMO_BRAND.url
                  ? undefined
                  : () => {
                      setRescanOf(dealer.id);
                      setScanUrl(dealer.brand.url);
                      go({ name: "new" });
                    }
              }
            />
          )}
          {section === "ads" && route.name === "ads" && (
            <AdsView
              dealer={dealer}
              ads={dealerAds}
              batch={route.batch}
              openId={route.ad}
              onOpen={(id) => go({ name: "ads", id: dealer.id, ad: id ?? undefined }, true)}
              onUpdate={updateAd}
              onDelete={(id) => update((w) => ({ ...w, ads: w.ads.filter((a) => a.id !== id) }))}
              onCreate={() => go({ name: "create", id: dealer.id })}
              onSchedule={scheduleOne}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}
