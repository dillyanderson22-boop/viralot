import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";

/**
 * Admin-managed settings. Secrets are AES-256-GCM encrypted with
 * SETTINGS_SECRET before they leave this process, then stored in a private
 * Vercel Blob (or a local file when no Blob store is connected, for dev).
 */

export type SecretName = "anthropic" | "anthropicWorkspace" | "firecrawl" | "browserWs" | "higgsfieldKey" | "higgsfieldSecret";

export const SECRETS: Record<SecretName, { env: string; label: string }> = {
  anthropic: { env: "ANTHROPIC_API_KEY", label: "Anthropic API key" },
  anthropicWorkspace: { env: "ANTHROPIC_WORKSPACE_ID", label: "Claude workspace ID" },
  firecrawl: { env: "FIRECRAWL_API_KEY", label: "Firecrawl API key" },
  browserWs: { env: "BROWSER_WS_ENDPOINT", label: "Hosted browser endpoint" },
  higgsfieldKey: { env: "HF_API_KEY", label: "Higgsfield API key" },
  higgsfieldSecret: { env: "HF_API_SECRET", label: "Higgsfield API secret" },
};

type Enc = { iv: string; tag: string; data: string; last4: string; updatedAt: string };

export type Settings = {
  keys: Partial<Record<SecretName, Enc>>;
  access: { required: boolean; codeHash?: string };
  /** OEM brand guidelines (markdown) uploaded in /admin. */
  guidelines?: { md: string; name: string; updatedAt: string };
  updatedAt?: string;
};

export type ActivityEvent = { type: "scan" | "scan_failed" | "captions" | "export" | "admin" | "clip"; at: string; label?: string; detail?: string };

const EMPTY: Settings = { keys: {}, access: { required: false } };

// ---------- crypto ----------

function masterKey(): Buffer {
  const s = process.env.SETTINGS_SECRET;
  if (!s) throw new Error("SETTINGS_SECRET is not configured");
  return createHash("sha256").update(s).digest();
}

export function hmac(value: string, purpose: string) {
  return createHmac("sha256", masterKey()).update(purpose + ":" + value).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function encrypt(plain: string): Enc {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return {
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
    last4: plain.slice(-4),
    updatedAt: new Date().toISOString(),
  };
}

function decrypt(e: Enc): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(e.iv, "base64"));
    d.setAuthTag(Buffer.from(e.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(e.data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- storage ----------

const blobConnected = () => !process.env.VIRALOT_LOCAL_STORE && !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const LOCAL_DIR = path.join(process.cwd(), ".data");

async function readJson<T>(name: string): Promise<T | null> {
  if (blobConnected()) {
    try {
      const r = await get(name, { access: "private", useCache: false });
      if (!r || r.statusCode !== 200 || !r.stream) return null;
      return JSON.parse(await new Response(r.stream).text()) as T;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, name), "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(name: string, value: unknown) {
  const body = JSON.stringify(value);
  if (blobConnected()) {
    await put(name, body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
    return;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), body);
}

// A short in-process cache: every scan reads settings, and Blob reads cost a round trip.
let cache: { at: number; value: Settings } | null = null;

export async function loadSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  const v = (await readJson<Settings>("settings.json")) ?? EMPTY;
  const value = { ...EMPTY, ...v, access: { ...EMPTY.access, ...v.access }, keys: v.keys ?? {} };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(s: Settings) {
  s.updatedAt = new Date().toISOString();
  await writeJson("settings.json", s);
  cache = { at: Date.now(), value: s };
}

export async function setSecret(name: SecretName, value: string | null) {
  const s = await loadSettings(true);
  if (value) s.keys[name] = encrypt(value.trim());
  else delete s.keys[name];
  await saveSettings(s);
}

/** Admin value wins; the environment variable is the fallback. */
export async function getSecret(name: SecretName): Promise<string | undefined> {
  try {
    const s = await loadSettings();
    const e = s.keys[name];
    if (e) {
      const v = decrypt(e);
      if (v) return v;
    }
  } catch {
    /* fall through to env */
  }
  return process.env[SECRETS[name].env] || undefined;
}

export async function describeSecrets() {
  const s = await loadSettings(true);
  return (Object.keys(SECRETS) as SecretName[]).map((name) => {
    const e = s.keys[name];
    const env = process.env[SECRETS[name].env];
    return {
      name,
      label: SECRETS[name].label,
      set: !!e || !!env,
      source: e ? ("admin" as const) : env ? ("env" as const) : null,
      last4: e?.last4 ?? (env ? env.slice(-4) : null),
      updatedAt: e?.updatedAt ?? null,
    };
  });
}

// ---------- activity ----------

export async function logActivity(ev: Omit<ActivityEvent, "at">) {
  try {
    const list = (await readJson<ActivityEvent[]>("activity.json")) ?? [];
    list.unshift({ ...ev, at: new Date().toISOString() });
    await writeJson("activity.json", list.slice(0, 300));
  } catch {
    /* activity is best-effort — never fail a user request over it */
  }
}

export async function readActivity() {
  return (await readJson<ActivityEvent[]>("activity.json")) ?? [];
}

/**
 * The brand guidelines in force: the admin's uploaded file, else the built-in
 * DealerCentives OEM requirements (src/brand-kit/oem-guidelines.md).
 */
export async function guidelinesMd(): Promise<{ md: string; name: string; updatedAt: string; builtIn: boolean } | null> {
  const g = (await loadSettings()).guidelines;
  if (g) return { ...g, builtIn: false };
  try {
    const md = await fs.readFile(path.join(process.cwd(), "src/brand-kit/oem-guidelines.md"), "utf8");
    return { md, name: "DealerCentives OEM brand requirements (built in)", updatedAt: "2026-10-20T00:00:00.000Z", builtIn: true };
  } catch {
    return null;
  }
}
