"use client";

import { useEffect, useRef, useState } from "react";
import { BookCheck, Download, FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "./ui";

type Brand = { brand: string; global: boolean; aliases: string[]; fonts: string[]; banned: number; phrases: number; trademarks: number; rules: number; disclaimer: boolean };
type State = { name: string | null; updatedAt?: string; brands?: Brand[]; size?: number; builtIn?: boolean };

/**
 * Admin: the OEM brand guidelines file (markdown). One section per brand with
 * fonts, text rules, banned words and required disclaimers; every dealer ad is
 * styled and checked against the sections for the makes that dealer sells.
 */
export function GuidelinesCard() {
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/guidelines", { cache: "no-store" })
      .then((r) => r.json())
      .then(setSt)
      .catch(() => setSt({ name: null }));
  }, []);

  const upload = async (f: File) => {
    setBusy(true);
    setErr(null);
    try {
      if (f.size > 600_000) throw new Error("That file is over 600 KB.");
      const md = await f.text();
      const r = await fetch("/api/admin/guidelines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ md, name: f.name }) });
      const d = (await r.json()) as State & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Upload failed");
      setSt(d);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    const d = await fetch("/api/admin/guidelines", { method: "DELETE" })
      .then((r) => r.json())
      .catch(() => ({ name: null }));
    setSt(d);
    setBusy(false);
  };

  return (
    <section className="rounded-[28px] border border-line bg-white p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <BookCheck className="h-4 w-4 text-blue" />
        <h2 className="text-[18px] font-semibold tracking-[-0.03em]">Brand guidelines</h2>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        One markdown file with a section per brand (Honda, Nissan…): fonts, headline casing, required disclaimer, required wording, banned words, trademarks and any other rules. Dealers are matched by the makes they sell; their videos use those fonts and fine print, and every ad gets a compliance check.
      </p>

      {st?.name ? (
        <div className="mt-5 rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium">
                {st.name}
                {st.builtIn && <span className="ml-2 rounded-full bg-blue/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-blue">Built in · fonts included</span>}
              </div>
              <div className="text-[12px] text-muted">
                {st.brands?.length ?? 0} sections · updated {st.updatedAt ? new Date(st.updatedAt).toLocaleString() : ""}
              </div>
            </div>
            {!st.builtIn && (
              <button onClick={remove} disabled={busy} className="flex items-center gap-1 text-[12.5px] font-medium text-muted hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" /> Reset to built-in
              </button>
            )}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {st.brands?.map((b) => (
              <div key={b.brand} className="rounded-xl bg-bg-2/70 px-3 py-2 text-[12px]">
                <div className="font-semibold text-ink">
                  {b.brand}
                  {b.global && <span className="ml-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-blue">all brands</span>}
                  {b.aliases.length > 0 && <span className="ml-1.5 font-normal text-muted">+ {b.aliases.join(", ")}</span>}
                </div>
                <div className="mt-0.5 text-muted">
                  {[b.fonts.length && `fonts: ${b.fonts.join(", ")}`, b.disclaimer && "disclaimer", b.phrases && `${b.phrases} required`, b.banned && `${b.banned} banned`, b.trademarks && `${b.trademarks} marks`, b.rules && `${b.rules} rules`]
                    .filter(Boolean)
                    .join(" · ") || "no rules read"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        st && <div className="mt-5 rounded-2xl border border-dashed border-line-2 px-4 py-6 text-center text-[13px] text-muted">No guidelines uploaded yet.</div>
      )}

      {err && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{err}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={file}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
        <Button onClick={() => file.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} {st?.name && !st.builtIn ? "Replace file" : "Upload your own .md"}
        </Button>
        <a href="/viralot-brand-guidelines-template.md" download className="inline-flex items-center gap-1.5 text-[13px] font-medium text-blue hover:underline">
          <Download className="h-3.5 w-3.5" /> Download the template
        </a>
      </div>
    </section>
  );
}
