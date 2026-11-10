"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import clsx from "clsx";
import type { Brand } from "@/lib/types";
import type { SavedAd } from "@/lib/workspace";
import { checkAd } from "@/lib/guidelines";
import { useBrandRules } from "@/lib/useBrandRules";
import { offerDetailFor, parseOffer, withDetail } from "@/lib/spot";

type Review = { verdict: "pass" | "fix"; issues: { rule: string; problem: string; fix: string }[] };

/**
 * Compliance for one ad against the admin's brand guidelines for the makes
 * this dealer sells: instant rule checks, plus an on-demand Claude review of
 * everything the rules can't check mechanically.
 */
export function ComplianceCard({ ad, brand, captions }: { ad: SavedAd; brand: Brand; captions: string[] }) {
  const rules = useBrandRules(brand.makes);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const text = useMemo(() => {
    const f = { ...withDetail(parseOffer(ad.inputs.offer, ad.inputs.vehicleName, brand.name), offerDetailFor(brand, ad.inputs.offer)), ...(ad.inputs.spot ?? {}) };
    const req = brand.compliance?.disclaimer;
    const fine = [f.disclaimer, req && !(f.disclaimer ?? "").includes(req.slice(0, 40)) ? req : ""].filter(Boolean).join(" ");
    const headline = [f.kicker, ...(f.lines ?? []), f.big && `${f.big}${f.unit ? " " + f.unit : ""}`].filter(Boolean).join(" ");
    const expires = ad.inputs.offers?.find((o) => o.expires)?.expires ?? ad.inputs.offerSub.match(/Ends ([^·]+)/)?.[1]?.trim();
    return { headline, offer: ad.inputs.offer, finePrint: fine, expires };
  }, [ad, brand]);
  const checks = useMemo(() => (rules ? checkAd(rules, { ...text, captions }) : []), [rules, text, captions]);

  if (!rules) return null;
  if (!rules.length)
    return (
      <div className="rounded-2xl border border-line p-3.5 text-[12.5px] text-muted">
        <span className="font-medium text-ink">Compliance:</span> no brand guidelines match {brand.makes.join(", ") || "this dealer"} yet. Upload them in{" "}
        <a href="/admin" className="font-medium text-ink underline underline-offset-4">
          /admin
        </a>
        .
      </div>
    );

  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/compliance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ makes: brand.makes, vehicle: ad.inputs.vehicleName, captions, ...text }) });
      const d = (await r.json()) as Review & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Review failed");
      setReview(d);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className={clsx("h-4 w-4", fails ? "text-red-600" : warns ? "text-amber-500" : "text-emerald-600")} />
          <span className="text-[13px] font-semibold">Compliance · {rules.filter((r) => !r.global).map((r) => r.brand).join(", ") || "General"} guidelines</span>
        </div>
        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", fails ? "bg-red-50 text-red-700" : warns ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
          {fails ? `${fails} to fix` : warns ? `${warns} to check` : "Passes"}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1">
        {checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
            {c.status === "pass" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : c.status === "warn" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
            <span>
              <span className="text-ink-2">{c.label}</span>
              {c.detail && <span className="text-muted"> · {c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {review && (
        <div className={clsx("mt-3 rounded-xl px-3 py-2 text-[12.5px]", review.verdict === "pass" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
          {review.verdict === "pass" ? (
            "Full review: no issues against the brand guidelines."
          ) : (
            <ul className="space-y-1.5">
              {review.issues.map((i, k) => (
                <li key={k}>
                  <span className="font-semibold">{i.problem}</span> — {i.fix}
                  <span className="block opacity-70">Rule: {i.rule}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {err && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err}</div>}
      <button onClick={run} disabled={busy} className="mt-3 flex items-center gap-1.5 text-[12.5px] font-medium text-blue hover:underline disabled:opacity-60">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Full review against every rule (Claude)
      </button>
    </div>
  );
}
