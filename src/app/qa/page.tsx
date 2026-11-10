"use client";

import { useEffect, useMemo, useState } from "react";
import { TEMPLATES, resolveTemplate } from "@/lib/ad/catalog";
import { DEMO_BRAND, defaultInputs } from "@/lib/demo";
import { baseAssets, drawFrame, stillPlate } from "@/lib/ad/runtime";
import type { Brand } from "@/lib/types";

/** Dev-only contact sheet: every template at a few key moments. */
export default function QA() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setParams(new URLSearchParams(location.search)), []);
  const ids = params?.get("ids")?.split(",");
  const from = Number(params?.get("from") ?? 0);
  const count = Number(params?.get("n") ?? 12);
  const honda = params?.get("honda") === "1";
  const list = useMemo(() => {
    const base = TEMPLATES.filter((t) => !t.id.endsWith("-dark") && !t.id.endsWith("-brand"));
    if (params?.get("engines")) {
      const seen = new Set<string>();
      const uniq = base.filter((t) => {
        const k = t.engine + (t.plate ?? "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return uniq.slice(from, from + count);
    }
    return ids ? TEMPLATES.filter((t) => ids.includes(t.id)) : base.slice(from, from + count);
  }, [ids, from, count, params]);
  const brand: Brand = useMemo(() => ({ ...DEMO_BRAND, makes: honda ? ["Honda"] : [] }), [honda]);
  const ctx = useMemo(() => ({ brand, ad: defaultInputs(brand) }), [brand]);
  // ?cars=url|url|… — one column per car, final frame (fit testing)
  const cars = useMemo(() => params?.get("cars")?.split("|").filter(Boolean) ?? null, [params]);
  const offer = params?.get("offer");
  // ?scenes=city,night,… — one column per scene (with ?cars, cycles cars per column)
  const scenes = useMemo(() => params?.get("scenes")?.split(",").filter(Boolean) ?? null, [params]);
  const cols = scenes ? scenes.length : cars ? cars.length : 4;

  useEffect(() => {
    if (!params) return;
    (async () => {
      if (cars || scenes) {
        for (let i = 0; i < cols; i++) {
          const cctx = {
            brand,
            ad: {
              ...ctx.ad,
              ...(cars ? { vehicleImage: cars[i % cars.length] } : {}),
              ...(offer ? { offer } : {}),
              ...(scenes ? { spot: { scene: scenes[i] } } : {}),
            },
          };
          const a = await baseAssets(cctx);
          for (const t of list) {
            const r = resolveTemplate(t, brand.makes);
            const c = document.getElementById(`${t.id}-${i}`) as HTMLCanvasElement | null;
            if (c) drawFrame(c, t, cctx, { ...a, plate: null }, r.dur - 0.3, r);
          }
        }
        document.body.dataset.ready = "1";
        return;
      }
      const a = await baseAssets(ctx);
      for (const t of list) {
        const r = resolveTemplate(t, brand.makes);
        const times = [0.9, t.poster, r.dur * 0.62, r.dur - 0.3];
        for (let i = 0; i < times.length; i++) {
          const c = document.getElementById(`${t.id}-${i}`) as HTMLCanvasElement | null;
          if (!c) continue;
          const plate = await stillPlate(r.plate, times[i]);
          drawFrame(c, t, ctx, { ...a, plate }, times[i], r);
        }
      }
      document.body.dataset.ready = "1";
    })();
  }, [params, list, ctx, brand, cars, offer, scenes, cols]);

  return (
    <div className="p-4">
      {list.map((t) => (
        <div key={t.id} className="mb-3 flex items-start gap-2">
          <div className="w-28 shrink-0 text-[11px] font-medium">
            {t.id}
            <br />
            <span className="text-muted">{t.engine}</span>
          </div>
          {Array.from({ length: cols }, (_, i) => i).map((i) => (
            <canvas key={i} id={`${t.id}-${i}`} width={270} height={480} className="rounded border border-line" style={{ width: 270, height: 480 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
