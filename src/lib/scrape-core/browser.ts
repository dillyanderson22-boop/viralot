import { chromium, type Browser } from "playwright-core";

/**
 * Where the browser actually runs.
 *
 * Two backends, one code path. In development we drive a browser on this
 * machine; in production we connect to somebody else's over CDP. The calling
 * code never learns which, because the difference is a `launch` vs a `connect`
 * and nothing downstream of the `Browser` handle behaves differently.
 *
 * This split is not just convenience. Playwright cannot run on a normal Vercel
 * function at all: Chromium unpacks to roughly 300 MB against a 250 MB limit,
 * so the "just bundle it" approach fails at deploy time rather than at runtime.
 * A hosted browser keeps the dependency at `playwright-core`, which is a few
 * hundred kilobytes of protocol client and no binary.
 *
 * `BROWSER_WS_ENDPOINT` is deliberately vendor-neutral — Browserbase,
 * Browserless, Steel and a self-hosted Chrome all speak the same CDP
 * websocket. Same reasoning as AdForge's `SCRAPE_PROXY_URL`: name the
 * capability, not the supplier.
 */

export type BrowserBackend = "remote" | "local-chrome" | "local-chromium";

export type BrowserHandle = {
  browser: Browser;
  backend: BrowserBackend;
  /** Closes a local browser; leaves a remote session to the provider's own teardown. */
  dispose(): Promise<void>;
};

function wsEndpoint(): string | null {
  const raw = process.env.BROWSER_WS_ENDPOINT?.trim();
  return raw ? raw : null;
}

export function remoteConfigured(): boolean {
  return wsEndpoint() !== null;
}

/**
 * Flags that make headless Chromium look less obviously like headless Chromium.
 *
 * Worth being honest about the ceiling here: this clears the naive checks
 * (`navigator.webdriver`, the automation infobar) and nothing more. Cloudflare
 * and Imperva fingerprint the TLS and HTTP/2 handshake, which is below the
 * layer any of these flags touch. If a dealer site is walled, the fix is a
 * residential exit IP from a hosted provider, not another flag in this array.
 */
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox",
];

/**
 * Opens a browser, preferring the remote endpoint when one is configured.
 *
 * The local fallback tries real Google Chrome before Playwright's bundled
 * Chromium. Chrome is already on most development machines, so preferring it
 * skips a ~150 MB download — and it is a genuinely better scraping target,
 * because the bundled build ships as `headless_shell`, which announces itself
 * in the user-agent string.
 */
let executable: Promise<string> | null = null;

export async function openBrowser(endpoint?: string): Promise<BrowserHandle> {
  const ws = endpoint?.trim() || wsEndpoint();
  if (ws) {
    const browser = await chromium.connectOverCDP(ws, { timeout: 60_000 });
    return {
      browser,
      backend: "remote",
      // Closing the CDP connection ends our side of the session. The provider
      // reaps the container; calling browser.close() on a shared remote would
      // be rude at best and, on some providers, kills a pooled instance.
      async dispose() {
        await browser.close().catch(() => {});
      },
    };
  }

  // On Vercel there is no Chrome install, so launch the Lambda-sized Chromium build.
  if (process.env.VERCEL) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    // Unpacking Chromium is not concurrency-safe: share one extraction per instance.
    executable ??= sparticuz.executablePath();
    const browser = await chromium.launch({
      executablePath: await executable,
      args: [...sparticuz.args, ...STEALTH_ARGS],
      headless: true,
    });
    return {
      browser,
      backend: "local-chromium",
      async dispose() {
        await browser.close().catch(() => {});
      },
    };
  }

  for (const [backend, channel] of [
    ["local-chrome", "chrome"],
    ["local-chromium", undefined],
  ] as const) {
    try {
      const browser = await chromium.launch({
        channel,
        headless: true,
        args: STEALTH_ARGS,
      });
      return {
        browser,
        backend,
        async dispose() {
          await browser.close().catch(() => {});
        },
      };
    } catch {
      /* try the next one */
    }
  }

  throw new Error(
    "No browser available. Either set BROWSER_WS_ENDPOINT to a hosted browser " +
      "(Browserbase, Browserless), install Google Chrome, or run " +
      "`npx playwright install chromium`."
  );
}
