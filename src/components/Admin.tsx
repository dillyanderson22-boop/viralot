"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Clapperboard, KeyRound, Loader2, Lock, LogOut, Radar, ShieldCheck, Sparkles, TriangleAlert, Wand2, X } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { Button, Orb, SectionLabel, SplitFlap, Wordmark, ease } from "./ui";
import { GuidelinesCard } from "./GuidelinesCard";

type KeyInfo = {
  name: "anthropic" | "anthropicWorkspace" | "firecrawl" | "browserWs" | "higgsfieldKey" | "higgsfieldSecret";
  label: string;
  set: boolean;
  source: "admin" | "env" | null;
  last4: string | null;
  updatedAt: string | null;
};
type State = {
  configured: boolean;
  keys: KeyInfo[];
  access: { required: boolean; hasCode: boolean };
  storage: string;
};
type Activity = {
  stats: { scans: number; failed: number; captions: number; exports: number };
  events: { type: string; at: string; label?: string; detail?: string }[];
};

const KEY_HELP: Record<KeyInfo["name"], { what: string; placeholder: string; link?: [string, string] }> = {
  anthropic: {
    what: "Claude reads each dealer's site during scans (logo, offers off banner images with their fine print, colours, contact, ad ideas), reads inventory pages our scanner can't, and writes captions.",
    placeholder: "sk-ant-…",
    link: ["Get a key", "https://console.anthropic.com/settings/keys"],
  },
  anthropicWorkspace: {
    what: "Only needed if your key isn't scoped to a workspace (the test above will say so). Find it in the Claude Console under Settings → Workspaces.",
    placeholder: "wrkspc_…",
    link: ["Workspaces", "https://console.anthropic.com/settings/workspaces"],
  },
  firecrawl: {
    what: "Scans dealer sites through Firecrawl first — it gets past most bot walls and reads the logo and brand colours. Inventory pages too. Falls back to our own browser if it fails.",
    placeholder: "fc-…",
    link: ["Get a key", "https://www.firecrawl.dev/app/api-keys"],
  },
  browserWs: {
    what: "Optional. Routes site scans through a hosted browser (Browserless, Browserbase) for dealer sites that block normal visitors.",
    placeholder: "wss://…",
  },
  higgsfieldKey: {
    what: "Generates cinematic videos, front 3/4 car shots, custom backgrounds and AI rolling clips.",
    placeholder: "Higgsfield API key",
    link: ["Higgsfield console", "https://cloud.higgsfield.ai"],
  },
  higgsfieldSecret: {
    what: "Pairs with the Higgsfield API key above.",
    placeholder: "Higgsfield API secret",
  },
};

const field =
  "w-full rounded-xl border border-line-2 bg-white px-3.5 py-2.5 text-[14px] outline-none transition placeholder:text-muted/60 focus:border-blue focus:shadow-[0_0_0_4px_rgba(47,107,255,.12)]";

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Admin() {
  const [state, setState] = useState<State | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/admin/settings", { cache: "no-store" });
    if (r.status === 401) return setAuthed(false);
    const d = (await r.json()) as State;
    setState(d);
    setAuthed(d.configured ? true : false);
    if (d.configured) {
      const a = await fetch("/api/admin/activity", { cache: "no-store" });
      if (a.ok) setActivity(await a.json());
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0 h-[700px]" />
      <Orb className="left-1/2 top-[-260px] -translate-x-1/2" size={720} />
      <header className="relative z-10 mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-8">
        <Link href="/" aria-label="Studio">
          <Wordmark />
        </Link>
        {authed && (
          <div className="flex items-center gap-2">
            <Link href="/" className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 hover:bg-bg-2 sm:flex">
              <ArrowLeft className="h-3.5 w-3.5" /> Studio
            </Link>
            <Button
              size="sm"
              variant="soft"
              onClick={async () => {
                await fetch("/api/admin/logout", { method: "POST" });
                setAuthed(false);
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        )}
      </header>

      <AnimatePresence mode="wait">
        {authed === null && (
          <motion.div key="load" exit={{ opacity: 0 }} className="grid h-[60vh] place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue" />
          </motion.div>
        )}
        {authed === false && state?.configured === false && <Setup key="setup" />}
        {authed === false && state?.configured !== false && <Login key="login" onDone={refresh} />}
        {authed && state && <Dashboard key="dash" state={state} activity={activity} onChange={refresh} setState={setState} />}
      </AnimatePresence>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
      transition={{ duration: 0.6, ease }}
      className="relative z-10"
    >
      {children}
    </motion.div>
  );
}

function Setup() {
  return (
    <Shell>
      <div className="mx-auto mt-16 max-w-[520px] px-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-line bg-white shadow-sm">
          <ShieldCheck className="h-6 w-6 text-blue" />
        </div>
        <h1 className="mt-6 text-[32px] font-semibold tracking-[-0.045em]">Set your admin password</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          The admin is locked until an <span className="font-mono text-ink">ADMIN_PASSWORD</span> is set on the server. Add it in your Vercel project
          under Settings → Environment Variables, then redeploy.
        </p>
      </div>
    </Shell>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (r.ok) return onDone();
    const d = await r.json().catch(() => ({}));
    setErr(d.error ?? "Couldn't sign in");
    setShake((n) => n + 1);
  };
  return (
    <Shell>
      <div className="mx-auto mt-[12vh] w-full max-w-[400px] px-4">
        <motion.form
          key={shake}
          animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}}
          transition={{ duration: 0.4 }}
          onSubmit={submit}
          className="ai-ring rounded-[28px] border border-line bg-white/90 p-7 shadow-[0_40px_100px_-40px_rgba(10,11,13,.35)] backdrop-blur-xl"
        >
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white">
            <Lock className="h-4.5 w-4.5" />
          </div>
          <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.04em]">Admin</h1>
          <p className="mt-1 text-[14px] text-muted">Manage API keys, access and activity.</p>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className={clsx(field, "mt-6 h-12")}
          />
          {err && <div className="mt-2 text-[13px] text-red-600">{err}</div>}
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={!pw || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </motion.form>
      </div>
    </Shell>
  );
}

function Dashboard({
  state,
  activity,
  onChange,
  setState,
}: {
  state: State;
  activity: Activity | null;
  onChange: () => void;
  setState: (s: State) => void;
}) {
  const stats = activity?.stats ?? { scans: 0, failed: 0, captions: 0, exports: 0 };
  const connected = state.keys.filter((k) => k.set && k.name !== "higgsfieldSecret").length;
  return (
    <Shell>
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
        <SectionLabel>Admin</SectionLabel>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-[40px] font-semibold leading-[1] tracking-[-0.05em] sm:text-[56px]">Control room.</h1>
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,.45)]" />
            {connected} of 3 integrations connected
          </div>
        </div>

        {/* stats */}
        <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ["Scans", stats.scans, Radar],
              ["Failed scans", stats.failed, TriangleAlert],
              ["Claude captions", stats.captions, Wand2],
              ["Videos exported", stats.exports, Clapperboard],
            ] as const
          ).map(([label, n, Icon], i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease, delay: 0.05 * i }}
              className="rounded-[22px] border border-line bg-white p-5"
            >
              <div className="flex items-center justify-between text-[12px] text-muted">
                {label}
                <Icon className="h-4 w-4" />
              </div>
              <SplitFlap value={String(n).padStart(3, "0")} className="mt-4 text-[30px]" />
              <div className="mt-2 text-[11px] text-muted">Last 7 days</div>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-[28px] border border-line bg-white p-5 sm:p-7">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue" />
                <h2 className="text-[18px] font-semibold tracking-[-0.03em]">API keys</h2>
              </div>
              <p className="mt-1 text-[13px] text-muted">Encrypted before storage ({state.storage}). Values are never shown again after saving.</p>
              <div className="mt-6 divide-y divide-line">
                {state.keys.map((k) => (
                  <KeyRow key={k.name} k={k} onSaved={(s) => setState(s)} />
                ))}
              </div>
            </section>
            <AccessCard state={state} onSaved={(s) => setState(s)} />
            <GuidelinesCard />
          </div>

          <section className="min-w-0 rounded-[28px] border border-line bg-white p-5 sm:p-7 lg:self-start">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold tracking-[-0.03em]">Activity</h2>
              <button onClick={onChange} className="text-[12px] font-medium text-muted hover:text-ink">
                Refresh
              </button>
            </div>
            <div className="mt-4 space-y-1">
              {!activity?.events.length && <div className="py-10 text-center text-[13px] text-muted">Nothing yet. Scans and exports will show up here.</div>}
              {activity?.events.map((e, i) => (
                <motion.div
                  key={e.at + i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease, delay: Math.min(i, 12) * 0.03 }}
                  className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-bg-2"
                >
                  <span
                    className={clsx(
                      "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white",
                      e.type === "scan" && "bg-blue",
                      e.type === "scan_failed" && "bg-red-500",
                      e.type === "captions" && "bg-violet-500",
                      e.type === "export" && "bg-emerald-500",
                      e.type === "admin" && "bg-ink"
                    )}
                  >
                    {e.type === "scan" ? <Radar className="h-3 w-3" /> : e.type === "scan_failed" ? <X className="h-3 w-3" /> : e.type === "captions" ? <Sparkles className="h-3 w-3" /> : e.type === "export" ? <Clapperboard className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">
                      {e.type === "scan" ? "Scanned " : e.type === "scan_failed" ? "Scan failed · " : e.type === "export" ? "Exported " : e.type === "captions" ? "Captions · " : ""}
                      {e.label}
                    </div>
                    {e.detail && <div className="truncate text-[12px] text-muted">{e.detail}</div>}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">{ago(e.at)}</span>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function KeyRow({ k, onSaved }: { k: KeyInfo; onSaved: (s: State) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const help = KEY_HELP[k.name];

  const save = async (v: string | null) => {
    setBusy(v ? "save" : "remove");
    setMsg(null);
    const r = await fetch("/api/admin/settings", { method: "POST", body: JSON.stringify({ keys: { [k.name]: v } }) });
    setBusy(null);
    if (!r.ok) return setMsg({ ok: false, text: "Couldn't save" });
    onSaved(await r.json());
    setValue("");
    setMsg({ ok: true, text: v ? "Saved" : "Removed" });
  };
  const test = async () => {
    setBusy("test");
    setMsg(null);
    const r = await fetch("/api/admin/test", { method: "POST", body: JSON.stringify({ name: k.name }) });
    const d = (await r.json().catch(() => ({ ok: false, message: "Test failed" }))) as { ok: boolean; message: string };
    setBusy(null);
    setMsg({ ok: d.ok, text: d.message });
  };

  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={clsx("h-2 w-2 rounded-full", k.set ? "bg-emerald-500 shadow-[0_0_8px_1px_rgba(16,185,129,.5)]" : "bg-ink/15")} />
          <span className="text-[14px] font-medium">{k.label}</span>
        </div>
        <span className="font-mono text-[11.5px] text-muted">
          {k.set ? `•••• ${k.last4} · ${k.source === "env" ? "from environment" : "saved here"}` : "Not set"}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
        {help.what}{" "}
        {help.link && (
          <a href={help.link[1]} target="_blank" rel="noreferrer" className="font-medium text-ink underline decoration-line-2 underline-offset-2 hover:decoration-blue">
            {help.link[0]}
          </a>
        )}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={k.set ? "Paste a new value to replace" : help.placeholder}
          autoComplete="off"
          spellCheck={false}
          className={clsx(field, "font-mono text-[13px]")}
        />
        <div className="flex shrink-0 gap-2">
          <Button size="md" onClick={() => save(value)} disabled={!value.trim() || !!busy}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
          {k.set && (
            <Button size="md" variant="soft" onClick={test} disabled={!!busy}>
              {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
            </Button>
          )}
          {k.source === "admin" && (
            <Button size="md" variant="ghost" onClick={() => save(null)} disabled={!!busy}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={clsx("mt-2 flex items-center gap-1.5 text-[12.5px]", msg.ok ? "text-emerald-600" : "text-red-600")}
          >
            {msg.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {msg.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccessCard({ state, onSaved }: { state: State; onSaved: (s: State) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async (body: { required?: boolean; code?: string }) => {
    setBusy(true);
    const r = await fetch("/api/admin/settings", { method: "POST", body: JSON.stringify({ access: body }) });
    setBusy(false);
    if (r.ok) {
      onSaved(await r.json());
      setCode("");
    }
  };
  const on = state.access.required;
  return (
    <section className="rounded-[28px] border border-line bg-white p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-blue" />
            <h2 className="text-[18px] font-semibold tracking-[-0.03em]">Studio access</h2>
          </div>
          <p className="mt-1 max-w-[440px] text-[13px] text-muted">
            {on ? "Visitors need the access code before they can scan sites or make ads." : "Anyone with the link can use the studio. Lock it with a code before sharing publicly."}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          disabled={busy || (!state.access.hasCode && !on)}
          onClick={() => post({ required: !on })}
          className={clsx("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40", on ? "bg-blue" : "bg-ink/15")}
          title={!state.access.hasCode ? "Set a code first" : undefined}
        >
          <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 34 }} className={clsx("absolute top-1 h-5 w-5 rounded-full bg-white shadow", on ? "right-1" : "left-1")} />
        </button>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={state.access.hasCode ? "Set a new access code" : "Choose an access code"}
          className={field}
          autoComplete="off"
        />
        <Button onClick={() => post({ code, required: state.access.required || !state.access.hasCode ? true : undefined })} disabled={!code.trim() || busy}>
          {state.access.hasCode ? "Update code" : "Save & lock"}
        </Button>
      </div>
    </section>
  );
}
