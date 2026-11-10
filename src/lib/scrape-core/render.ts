import type { BrowserContext, Page } from "playwright-core";
import { openBrowser, type BrowserBackend } from "./browser";
import { assertPublicUrl, BlockedTargetError } from "./ssrf";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** A dollar figure with at least three digits — the thing dealer pages are scraped for. */
export const MONEY = /\$\s?[\d,]{3,}/;

export type RenderOptions = {
  /** Overall budget for the whole navigation, including settle waits. */
  timeoutMs?: number;
  /**
   * Keep waiting until this matches the page's visible text. Defaults to MONEY.
   * Pass `null` to return as soon as the DOM is parsed.
   */
  waitForText?: RegExp | null;
  /**
   * Separate, shorter budget for the `waitForText` poll. Default 10s.
   *
   * Distinct from `timeoutMs` on purpose. Folded together, a page that simply
   * has no prices on it — a dealer HOMEPAGE, which is what the brand scan
   * reads — burns the entire navigation budget before returning content it
   * already had after two seconds. Measured at 45s on a live Toyota homepage.
   * Lazy panels arrive within a few seconds or not at all, so waiting longer
   * buys nothing and costs the caller its whole budget.
   */
  settleMs?: number;
  /** Drop images, media and fonts. Saves bandwidth; `<img src>` still reads fine from the DOM. */
  blockResources?: boolean;
  /**
   * Walk to the bottom before reading, to trigger lazy-loaded content. Defaults
   * to ON, and the default is load-bearing: measured on a live Team Velocity
   * VDP, reading without scrolling found ONE dollar figure and reading with it
   * found 44, including the whole Original Price / Dealer Discount stack. The
   * payment panel is below the fold on essentially every VDP, so a renderer
   * that doesn't scroll reproduces the exact failure it was built to fix.
   */
  scroll?: boolean;
  /** Runs against the live page after scrolling, before the HTML is read. */
  onPage?: (page: Page) => Promise<void>;
  /** CDP endpoint of a hosted browser; overrides BROWSER_WS_ENDPOINT. */
  wsEndpoint?: string;
  /**
   * Bot-check interstitials (Cloudflare "Just a moment…", Imperva, etc.).
   * While the page matches, keep waiting — JS challenges often clear on their
   * own in a few seconds. `blocked` in the result says whether it never did.
   */
  waitWhile?: RegExp;
  waitWhileMs?: number;
};

export type RenderResult = {
  /** The URL we were asked for. */
  url: string;
  /** Where we ended up, after any redirects. */
  finalUrl: string;
  html: string;
  /** Visible text, whitespace-collapsed — cheap enough to return, and every caller wants it. */
  text: string;
  status: number | null;
  backend: BrowserBackend;
  ms: number;
  /** True when `waitForText` matched. False means we returned on timeout with whatever had rendered. */
  settled: boolean;
  /** Still showing a bot-check page when we gave up waiting. */
  blocked: boolean;
};

const HEAVY = new Set(["image", "media", "font"]);

/**
 * Per-render memo for the SSRF check.
 *
 * A page fires dozens of requests at a handful of hosts, and each check is a
 * DNS round trip. Caching within one render is safe — a rebinding attack needs
 * the answer to change between the check and the connection, and that race is
 * already lost to Chrome's own resolver cache, which is why the guard rejects
 * a host when ANY answer is private rather than picking a good one.
 */
function hostGuard() {
  const seen = new Map<string, Promise<boolean>>();
  return (target: URL): Promise<boolean> => {
    const key = target.protocol + "//" + target.host;
    let hit = seen.get(key);
    if (!hit) {
      hit = assertPublicUrl(target).then(
        () => true,
        () => false
      );
      seen.set(key, hit);
    }
    return hit;
  };
}

/**
 * Watches every hop the page actually took, so a redirect can't smuggle us
 * into private space.
 *
 * This is the part `fetch` gets for free and a browser does not, and the
 * mechanism is NOT the obvious one. AdForge's `rawFetch` sets
 * `redirect: "manual"` and re-checks each hop itself. `page.goto()` has no such
 * mode, and — measured, not assumed — `context.route()` fires only on the
 * INITIAL request: a 302 to another origin is followed inside Chrome and the
 * route handler never sees the destination. Interception alone is decorative
 * against exactly the attack it looks like it stops.
 *
 * The other tempting fix, `route.fetch({ maxRedirects: 0 })`, is worse here.
 * That call runs in OUR node process rather than in the browser, so on the
 * hosted backend the main document would be fetched from this server's IP —
 * discarding the residential exit address that is the whole reason for paying
 * a provider, and pointing the SSRF surface back at our own network.
 *
 * So we let Chrome navigate natively and audit the `response` stream, which
 * does see every hop. Be precise about what this buys: content from a private
 * host is never returned to a caller, which closes the read primitive that
 * makes this dangerous (`/api/offer` echoes verbatim substrings of the body).
 * It does NOT prevent the request itself, so a blind side-effecting GET to an
 * internal service remains possible on the local backend. On the remote
 * backend the browser is in the provider's network, not ours, so there is no
 * internal service for it to reach.
 */
function installGuards(context: BrowserContext, opts: RenderOptions) {
  const isPublic = hostGuard();
  const blockHeavy = opts.blockResources !== false;

  /** Every hop we must clear before any HTML may be returned. */
  const hops: URL[] = [];

  context.on("response", (res) => {
    const req = res.request();
    if (!req.isNavigationRequest() && req.resourceType() !== "document") return;
    try {
      hops.push(new URL(res.url()));
    } catch {
      /* unparseable target — the audit below refuses on an empty parse anyway */
    }
  });

  const routing = context.route("**/*", async (route) => {
    const req = route.request();

    if (blockHeavy && HEAVY.has(req.resourceType())) {
      return route.abort();
    }

    let target: URL;
    try {
      target = new URL(req.url());
    } catch {
      return route.abort();
    }

    // Still worth checking hop 1 and every subresource here: it stops the
    // request before it is made, which the response audit cannot do.
    if (req.isNavigationRequest() || req.resourceType() === "document") {
      if (!(await isPublic(target))) return route.abort();
    }

    return route.continue();
  });

  return {
    ready: routing,
    /** Throws unless every navigation hop resolved to a public address. */
    async audit(finalUrl: string) {
      const seen = [...hops];
      try {
        seen.push(new URL(finalUrl));
      } catch {
        throw new BlockedTargetError("That page ended somewhere we can't verify.");
      }
      for (const hop of seen) {
        if (!(await isPublic(hop))) {
          throw new BlockedTargetError(
            "That page redirected to an address we won't read."
          );
        }
      }
    },
  };
}

/** Visible text, collapsed the same way AdForge's `parsePage` collapses it. */
async function visibleText(page: Page): Promise<string> {
  return page
    .evaluate(() => document.body?.innerText ?? "")
    .then((t) =>
      t
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .catch(() => "");
}

/**
 * Waits for the page to actually contain what we came for.
 *
 * `waitUntil: "networkidle"` is the obvious choice and the wrong one on dealer
 * sites: chat widgets, session-replay beacons and inventory pixels keep a
 * socket busy indefinitely, so it burns the whole timeout on pages that
 * finished rendering in two seconds. Polling for the content itself is both
 * faster on the common case and honest about the bad one — `settled: false`
 * says we gave up waiting, rather than pretending a timeout was a success.
 */
async function settle(page: Page, want: RegExp, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    if (want.test(await visibleText(page))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/** Trigger lazy-loaded content by walking to the bottom of the page. */
async function scrollThrough(page: Page, deadline: number) {
  for (let i = 0; i < 12 && Date.now() < deadline; i++) {
    const done = await page
      .evaluate(() => {
        const before = window.scrollY;
        window.scrollBy(0, window.innerHeight * 0.9);
        return window.scrollY === before;
      })
      .catch(() => true);
    if (done) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
}

/**
 * Renders one page with a real browser and returns its post-JavaScript HTML.
 *
 * This is the whole point of the package. AdForge's measured failure mode is a
 * valid 200 whose prices are simply not in the markup yet, because the platform
 * builds the payment panel client-side — verified against a live Team Velocity
 * VDP, where `.payment-row` returns five rows in a browser and nothing at all
 * in fetched HTML. Everything here exists to close that specific gap.
 */
export async function renderPage(
  url: string,
  opts: RenderOptions = {}
): Promise<RenderResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const deadline = started + timeoutMs;
  const want = opts.waitForText === undefined ? MONEY : opts.waitForText;

  const target = new URL(url);
  // Check before we spend a browser on it. The in-page guard re-checks every
  // hop, but a refusal should be cheap and should name the real reason.
  await assertPublicUrl(target);

  const handle = await openBrowser(opts.wsEndpoint);
  let context: BrowserContext | null = null;
  try {
    context = await handle.browser.newContext({
      userAgent: UA,
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      ignoreHTTPSErrors: true,
    });
    const guards = installGuards(context, opts);
    await guards.ready;
    // The cheapest automation tell; bot checks look at it first.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();
    const res = await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: Math.max(5_000, deadline - Date.now()),
    });

    // Before anything reads the DOM. A redirect into private space must not
    // get as far as producing a scroll, a settle wait, or a string of HTML.
    await guards.audit(page.url());

    let blocked = false;
    if (opts.waitWhile) {
      const until = Math.min(deadline, Date.now() + (opts.waitWhileMs ?? 15_000));
      const looksBlocked = async () =>
        opts.waitWhile!.test(
          await page.evaluate(() => document.title + " " + (document.body?.innerText ?? "").slice(0, 1500)).catch(() => "")
        );
      blocked = await looksBlocked();
      while (blocked && Date.now() < until) {
        await page.waitForTimeout(700);
        blocked = await looksBlocked();
      }
      if (!blocked) {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await guards.audit(page.url());
      }
    }

    if (opts.scroll !== false) await scrollThrough(page, deadline);
    if (opts.onPage) await opts.onPage(page).catch(() => {});

    const settled = want
      ? await settle(page, want, Math.min(deadline, Date.now() + (opts.settleMs ?? 10_000)))
      : true;
    const html = await page.content();
    const text = await visibleText(page);

    return {
      url,
      finalUrl: page.url(),
      html,
      text,
      status: res?.status() ?? null,
      backend: handle.backend,
      ms: Date.now() - started,
      settled,
      blocked,
    };
  } catch (e) {
    if (e instanceof BlockedTargetError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/i.test(msg)) {
      throw new BlockedTargetError(
        "That page redirected somewhere we won't follow."
      );
    }
    throw new Error(`Couldn't render that page: ${msg}`);
  } finally {
    await context?.close().catch(() => {});
    await handle.dispose();
  }
}
