import { assertPublicUrl } from "../scrape-core/ssrf";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * fetch() for user-supplied URLs. Redirects are followed by hand so every hop
 * is re-checked against the SSRF guard — a public URL must not 302 inward.
 */
export async function safeFetch(
  input: string,
  init: { timeoutMs?: number; accept?: string; maxBytes?: number } = {}
): Promise<{ res: Response; url: string }> {
  let url = new URL(input);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 12_000);
  try {
    for (let hop = 0; hop < 6; hop++) {
      await assertPublicUrl(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": UA,
          accept: init.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url);
        continue;
      }
      return { res, url: url.toString() };
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeUrl(raw: string): string {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const u = new URL(s);
  u.hash = "";
  return u.toString();
}
