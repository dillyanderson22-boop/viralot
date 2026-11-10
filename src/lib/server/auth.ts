import { hmac, loadSettings, safeEqual } from "./settings";

export const ADMIN_COOKIE = "viralot_admin";
export const ACCESS_COOKIE = "viralot_access";
const WEEK = 7 * 24 * 3600;

function cookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD && !!process.env.SETTINGS_SECRET;
}

/** Session token = expiry + HMAC bound to the current admin password, so changing it logs everyone out. */
function sign(purpose: string, exp: number) {
  return `${exp}.${hmac(`${exp}:${process.env.ADMIN_PASSWORD ?? ""}`, purpose)}`;
}
function verify(purpose: string, token: string | null) {
  if (!token) return false;
  const [exp] = token.split(".");
  if (!exp || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(token, sign(purpose, Number(exp)));
}

export function isAdmin(req: Request) {
  return adminConfigured() && verify("admin", cookie(req, ADMIN_COOKIE));
}

export function checkPassword(pw: string) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want) return false;
  return safeEqual(hmac(pw, "pw"), hmac(want, "pw"));
}

const secure = () => (process.env.VERCEL ? "; Secure" : "");

export function adminCookie() {
  const exp = Math.floor(Date.now() / 1000) + WEEK;
  return `${ADMIN_COOKIE}=${encodeURIComponent(sign("admin", exp))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${WEEK}${secure()}`;
}
export function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure()}`;
}

export function accessCookie() {
  const exp = Math.floor(Date.now() / 1000) + WEEK * 4;
  return `${ACCESS_COOKIE}=${encodeURIComponent(sign("access", exp))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${WEEK * 4}${secure()}`;
}

/** Can this request use the studio? True when no access code is set, or the visitor unlocked it, or it's the admin. */
export async function hasAccess(req: Request) {
  try {
    const s = await loadSettings();
    if (!s.access.required) return true;
  } catch {
    return true;
  }
  return isAdmin(req) || verify("access", cookie(req, ACCESS_COOKIE));
}

export function accessHash(code: string) {
  return hmac(code.trim().toLowerCase(), "access-code");
}

// Best-effort brute-force brake for the password and access-code forms.
const attempts = new Map<string, { n: number; until: number }>();
export function throttle(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const a = attempts.get(ip) ?? { n: 0, until: 0 };
  if (a.until > now) return false;
  a.n++;
  if (a.n >= 6) {
    a.until = now + 60_000;
    a.n = 0;
  }
  attempts.set(ip, a);
  return true;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
