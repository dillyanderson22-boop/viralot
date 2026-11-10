"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button, Orb, Wordmark, ease } from "./ui";

/** Shown instead of the studio when the admin has locked it with an access code. */
export function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/access", { method: "POST", body: JSON.stringify({ code }) });
    setBusy(false);
    if (r.ok) return onUnlock();
    const d = await r.json().catch(() => ({}));
    setErr(d.error ?? "That code isn't right");
    setShake((n) => n + 1);
  };
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <Orb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" size={680} />
      <motion.form
        key={shake}
        initial={shake ? false : { opacity: 0, y: 16, filter: "blur(8px)" }}
        animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: shake ? 0.4 : 0.8, ease }}
        onSubmit={submit}
        className="ai-ring relative w-full max-w-[400px] rounded-[28px] border border-line bg-white/90 p-7 text-center shadow-[0_40px_100px_-40px_rgba(10,11,13,.35)] backdrop-blur-xl"
      >
        <Wordmark className="justify-center" />
        <div className="mx-auto mt-7 grid h-11 w-11 place-items-center rounded-xl bg-ink text-white">
          <Lock className="h-4 w-4" />
        </div>
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.04em]">Enter your access code</h1>
        <p className="mt-1 text-[14px] text-muted">This studio is invite-only.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          className="mt-6 h-12 w-full rounded-xl border border-line-2 bg-white px-4 text-center text-[15px] outline-none transition focus:border-blue focus:shadow-[0_0_0_4px_rgba(47,107,255,.12)]"
        />
        {err && <div className="mt-2 text-[13px] text-red-600">{err}</div>}
        <Button type="submit" size="lg" className="mt-4 w-full" disabled={!code.trim() || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
        </Button>
      </motion.form>
    </div>
  );
}
