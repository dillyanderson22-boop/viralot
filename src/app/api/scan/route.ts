import { renderPage } from "@/lib/scrape-core/render";
import { BlockedTargetError } from "@/lib/scrape-core/ssrf";
import { extractBrand, rankColors, stylesheetLinks } from "@/lib/scan/extract";
import { normalizeUrl, safeFetch } from "@/lib/scan/fetch";
import type { Brand, OfferDetail, ScanEvent } from "@/lib/types";
import { gatherForClaude } from "@/lib/scan/gather";
import { bannerUrlsOf, claudeKey, ideasOf, readSite, usableColor, type LogoCandidate, type SiteReading } from "@/lib/server/claude";
import { TEMPLATES, VIRAL_FORMATS } from "@/lib/ad/catalog";
import { fcPage, firecrawlKey, pickBanners, scanSpecials, type Branding } from "@/lib/server/firecrawl";
import { detailsFromSpecials } from "@/lib/specials";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { getSecret, logActivity } from "@/lib/server/settings";

export const maxDuration = 240;

const proxied = (u?: string) => (u ? `/api/img?u=${encodeURIComponent(u)}` : undefined);

/** Bot-check / interstitial pages. Their text must never become a dealer's name. */
const CHALLENGE =
  /just a moment|attention required|checking your browser|verify(ing)? you are (a )?human|keep your website experience safe|enable javascript and cookies|pardon our interruption|incapsula|cf-chl|challenge-platform|are you a robot|access denied|request unsuccessful/i;

type Gathered = { shots: string[]; logos: LogoCandidate[]; banners: string[]; specials: string | null };
type Pass = { html: string; text: string; finalUrl: string; css: string; blocked: boolean; seen: Gathered };

/** Latest Internet Archive snapshot of a page, or null. */
async function archiveSnapshot(url: string): Promise<{ url: string; when: string }> {
  // The lookup API silently returns nothing when the query includes a scheme.
  const bare = url.replace(/^https?:\/\//, "");
  // The Archive is often briefly "Temporarily Offline" — a couple of calm retries.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { res } = await safeFetch(`https://archive.org/wayback/available?url=${encodeURIComponent(bare)}`, {
        accept: "application/json",
        timeoutMs: 8_000,
      });
      const d = (await res.json()) as { archived_snapshots?: { closest?: { url: string; timestamp: string; available: boolean } } };
      const c = d.archived_snapshots?.closest;
      if (c?.available) {
        const ts = c.timestamp;
        const when = new Date(`${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        return { url: c.url.replace(/^http:/, "https:"), when };
      }
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  // "/web/2/<url>" redirects to the newest capture there is.
  return { url: `https://web.archive.org/web/2/${url}`, when: "latest" };
}

/**
 * The archived page's original HTML (the `id_` form skips the Wayback toolbar
 * and link rewriting). Used when rendering the archive in a browser fails.
 */
async function archiveRaw(snapUrl: string): Promise<{ html: string; url: string } | null> {
  const m = snapUrl.match(/\/web\/(\d+|2)\/(https?:\/\/.+)$/);
  if (!m) return null;
  const raw = `https://web.archive.org/web/${m[1]}id_/${m[2]}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { res } = await safeFetch(raw, { timeoutMs: 20_000 });
      const html = res.ok ? await res.text() : "";
      if (html.length > 3000 && !/Temporarily Offline/i.test(html.slice(0, 2000))) return { html, url: m[2] };
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return null;
}

/**
 * Streams the scan as NDJSON so the UI can animate each discovery as it lands
 * instead of staring at a spinner for 20 seconds.
 */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const wsEndpoint = await getSecret("browserWs");
  const key = await claudeKey();
  const fcKey = await firecrawlKey();
  const readWithClaude = !!key;
  const { url: raw } = (await req.json().catch(() => ({}))) as { url?: string };
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ScanEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));

      /** One full browser pass: render, screenshot, computed colours. */
      const pass = async (target: string, isArchive: boolean): Promise<Pass | null> => {
        let computedCss = "";
        const seen: Gathered = { shots: [], logos: [], banners: [], specials: null };
        try {
          const out = await renderPage(target, {
            timeoutMs: isArchive ? 45_000 : 35_000,
            settleMs: isArchive ? 3_000 : 6_000,
            blockResources: false,
            wsEndpoint,
            waitWhile: CHALLENGE,
            waitWhileMs: isArchive ? 4_000 : 15_000,
            onPage: async (page) => {
              const looks = await page.evaluate(() => document.title + " " + (document.body?.innerText ?? "").slice(0, 1500)).catch(() => "");
              if (CHALLENGE.test(looks)) return; // don't show the user a bot-check page
              if (isArchive) {
                // hide the Wayback Machine toolbar so the screenshot looks like the real site
                await page.evaluate(() => document.querySelectorAll("#wm-ipp-base, #wm-ipp, #donato").forEach((n) => n.remove())).catch(() => {});
              }
              const shot = await page.screenshot({ type: "jpeg", quality: 55 });
              send({ type: "screenshot", data: "data:image/jpeg;base64," + shot.toString("base64") });
              if (readWithClaude) {
                // what Claude reads: the page top plus two scrolls down, and the promo images
                seen.shots.push((await page.screenshot({ type: "jpeg", quality: 70 })).toString("base64"));
                Object.assign(seen, await page.evaluate(gatherForClaude).catch(() => ({})));
                for (let i = 0; i < 2; i++) {
                  await page.evaluate(() => window.scrollBy(0, 860)).catch(() => {});
                  await page.waitForTimeout(700);
                  seen.shots.push((await page.screenshot({ type: "jpeg", quality: 65 })).toString("base64"));
                }
                await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
              }
              send({ type: "step", label: "Reading brand colours" });
              // Computed colours of the things a brand actually paints: header,
              // buttons, CTAs. Far better signal than counting hex codes in CSS.
              computedCss = await page.evaluate(() => {
                const pick = Array.from(
                  document.querySelectorAll(
                    "header, nav, .navbar, button, .btn, a[class*='btn'], a[class*='button'], [class*='cta'], [class*='primary']"
                  )
                ).slice(0, 160);
                return pick
                  .map((el) => {
                    const s = getComputedStyle(el);
                    return `${s.backgroundColor};${s.backgroundColor};${s.color};${s.borderTopColor};`;
                  })
                  .join("");
              });
            },
          });
          return { html: out.html, text: out.text, finalUrl: out.finalUrl, css: computedCss, blocked: out.blocked || CHALLENGE.test(out.text.slice(0, 1500)), seen };
        } catch (e) {
          if (e instanceof BlockedTargetError) throw e;
          return null;
        }
      };

      /** The dealer's specials page: text, promo images and one screenshot, for Claude. */
      const readSpecials = async (target: string) => {
        let shot: string | undefined;
        let banners: string[] = [];
        try {
          const out = await renderPage(target, {
            timeoutMs: 30_000,
            settleMs: 3_000,
            blockResources: false,
            wsEndpoint,
            waitWhile: CHALLENGE,
            waitWhileMs: 8_000,
            onPage: async (page) => {
              shot = (await page.screenshot({ type: "jpeg", quality: 65 })).toString("base64");
              banners = ((await page.evaluate(gatherForClaude).catch(() => null))?.banners ?? []).slice(0, 4);
            },
          });
          if (out.blocked || CHALLENGE.test(out.text.slice(0, 1500))) return undefined;
          return { url: out.finalUrl, text: out.text, banners, screenshot: shot };
        } catch {
          return undefined;
        }
      };

      try {
        if (!raw) throw new Error("Paste your dealership's website address.");
        let url: string;
        try {
          url = normalizeUrl(raw);
        } catch {
          throw new Error("That doesn't look like a web address.");
        }
        send({ type: "step", label: "Connecting to " + new URL(url).hostname });

        // 1. Quick pass: plain HTML. Often enough for name, logo and colours.
        let plain = "";
        let finalUrl = url;
        try {
          const { res, url: u } = await safeFetch(url);
          finalUrl = u;
          if (res.ok) plain = await res.text();
        } catch (e) {
          if (e instanceof BlockedTargetError) throw e;
        }
        if (CHALLENGE.test(plain.slice(0, 5000))) plain = "";

        // 2a. Firecrawl, when configured: renders through its own browsers and proxies
        // (gets past most bot walls) and hands back the logo + colours directly.
        let live: Pass | null = null;
        let branding: Branding | undefined;
        let fcLinks: string[] = [];
        if (fcKey) {
          send({ type: "step", label: "Scanning with Firecrawl" });
          try {
            const fc = await fcPage(fcKey, finalUrl, { branding: true, fresh: true });
            const blocked = fc.status >= 400 || CHALLENGE.test(fc.text.slice(0, 2000)) || fc.html.length < 2000;
            if (!blocked) {
              if (fc.screenshot) send({ type: "screenshot", data: `data:image/${fc.screenshot.startsWith("iVBOR") ? "png" : "jpeg"};base64,` + fc.screenshot });
              const text = fc.text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
              const specials =
                fc.links.find((l) => {
                  try {
                    const u = new URL(l);
                    return u.origin === new URL(fc.finalUrl).origin && /special|offer|incentive|deal/i.test(u.pathname) && !/finance|apply|trade|service|parts/i.test(u.pathname);
                  } catch {
                    return false;
                  }
                }) ?? null;
              live = {
                html: fc.html,
                text,
                finalUrl: fc.finalUrl,
                css: "",
                blocked: false,
                seen: { shots: fc.screenshot ? [fc.screenshot] : [], logos: [], banners: pickBanners(fc.images), specials },
              };
              branding = fc.branding;
              fcLinks = fc.links;
              send({ type: "step", label: "Firecrawl read the page" });
            } else console.log("[scan] firecrawl got a blocked page", fc.status);
          } catch (e) {
            console.log("[scan] firecrawl failed", e instanceof Error ? e.message : e);
            send({ type: "step", label: "Firecrawl couldn't load it" });
          }
        }

        // 2b. Our own browser, only without a Firecrawl key: dealer platforms build most of the page client-side.
        if (!live && !fcKey) {
          send({ type: "step", label: "Rendering the site like a real visitor" });
          live = await pass(finalUrl, false);
        }
        let archivedFrom: string | null = null;

        // A block page that doesn't use a known phrase still gives itself away:
        // a real dealer homepage has thousands of characters and car photos.
        if (live && !live.blocked) {
          const probe = extractBrand(live.html, live.text, live.finalUrl, "");
          if (live.text.length < 1500 && probe.vehicles.length === 0) {
            console.log("[scan] thin page, treating as blocked:", live.text.slice(0, 300));
            live.blocked = true;
          }
        }

        // 3. Bot-protected? Rebuild from the most recent public archive instead.
        if (!live || live.blocked) {
          send({ type: "step", label: "Site has bot protection — checking its public archive" });
          const snap = await archiveSnapshot(finalUrl);
          send({ type: "step", label: `Reading the ${snap.when} archived copy` });
          const arch = await pass(snap.url, true);
          if (arch && !arch.blocked && arch.html && !/Temporarily Offline/i.test(arch.text.slice(0, 2000))) {
            live = arch;
            archivedFrom = snap.when === "latest" ? "most recent copy" : snap.when;
          } else {
            console.log("[scan] archive render failed, trying raw copy", snap.url, arch ? arch.text.slice(0, 200) : "no result");
            send({ type: "step", label: "Archive is slow today — reading its raw copy" });
            const raw = await archiveRaw(snap.url);
            if (raw) {
              plain = raw.html;
              finalUrl = raw.url;
              live = null;
              archivedFrom = snap.when === "latest" ? "most recent copy" : snap.when;
            }
          }
          if (!archivedFrom && !plain) {
            throw new Error(
              "This dealership's site blocks automated visitors and has no public archive. Add a hosted browser in Admin, or build the kit by hand."
            );
          }
        }

        const html = live && !live.blocked ? live.html : plain;
        const pageUrl = archivedFrom && live ? live.finalUrl : finalUrl;
        let text = live && !live.blocked ? live.text : "";
        if (!html) throw new Error("We couldn't reach that site. Check the address, or build your kit by hand.");
        if (!text) {
          text = html
            .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ");
        }

        // 4. Stylesheets for colour frequency.
        let css = live?.css ?? "";
        for (const href of stylesheetLinks(html, pageUrl)) {
          try {
            const { res } = await safeFetch(href, { timeoutMs: 5_000, accept: "text/css,*/*" });
            if (res.ok) css += (await res.text()).slice(0, 400_000);
          } catch {
            /* a missing stylesheet is not worth failing the scan over */
          }
        }

        const brand: Brand = extractBrand(html, text, pageUrl, css);
        brand.url = url;
        if (branding && !archivedFrom) {
          // Firecrawl's branding profile: the logo the site itself marks as its logo, and its real colours
          const logo = branding.images?.logo ?? branding.logo;
          if (logo && /^https?:/.test(logo) && !/\.ico(\?|$)/i.test(logo)) brand.logo = logo;
          const c = branding.colors ?? {};
          const primary = [c.primary, c.accent, c.link].find((x) => usableColor(x?.length === 4 ? x.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : x));
          if (primary) {
            brand.colors.primary = primary.toLowerCase();
            const sec = [c.secondary, c.accent, c.link].find((x) => x && x.toLowerCase() !== primary.toLowerCase() && usableColor(x));
            if (sec) brand.colors.secondary = sec.toLowerCase();
            brand.palette = [...new Set([brand.colors.primary, brand.colors.secondary, ...brand.palette])].slice(0, 8);
          }
        }
        if (CHALLENGE.test(brand.name) || /wayback machine|internet archive/i.test(brand.name)) {
          brand.name = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
        }
        if (live?.css) {
          // Computed colours win ties: they are what a visitor actually sees.
          const fromPage = rankColors(live.css);
          brand.palette = [...new Set([...fromPage.slice(0, 3), ...brand.palette])].slice(0, 8);
          if (fromPage[0]) brand.colors.primary = fromPage[0];
          brand.colors.secondary = brand.palette.find((c) => c !== brand.colors.primary) ?? brand.colors.secondary;
        }
        if (archivedFrom) {
          // A year-old page's prices are not today's offers — suggest instead of guessing.
          brand.offers = [];
          brand.archivedFrom = archivedFrom;
        }

        // 4b. Specials: every car on the specials / incentives pages with all its offers (Firecrawl, no Claude needed).
        if (fcKey && live && !live.blocked && !archivedFrom) {
          send({ type: "step", label: "Reading the specials pages" });
          try {
            const { specials, pages } = await scanSpecials(fcKey, live.finalUrl, [...fcLinks, ...(live.seen.specials ? [live.seen.specials] : [])]);
            for (const pg of pages) send({ type: "step", label: `Read specials · ${new URL(pg).pathname}` });
            if (specials.length) {
              brand.specials = specials;
              brand.specialsScannedAt = Date.now();
              const details = detailsFromSpecials(specials);
              brand.offerDetails = details;
              brand.offers = [...new Set([...details.map((d) => d.headline), ...brand.offers])].slice(0, 24);
            }
            send({ type: "found", key: "Specials", value: `${specials.length} cars · ${specials.reduce((n, sp) => n + sp.offers.length, 0)} offers` });
          } catch (e) {
            console.log("[scan] specials failed", e instanceof Error ? e.message : e);
          }
        }

        // 5. Claude reads what the browser saw: logo, banner offers + fine print, colours, contact, ad ideas.
        if (key && live && !live.blocked) {
          send({ type: "step", label: "Claude is reading the site" });
          try {
            const specials = !archivedFrom && live.seen.specials ? await (fcKey ? readSpecialsFc(fcKey, live.seen.specials) : readSpecials(live.seen.specials)) : undefined;
            if (specials) send({ type: "step", label: "Claude is reading the specials page" });
            const spots = TEMPLATES.filter((t) => t.category === "Pro spot");
            const virals = VIRAL_FORMATS();
            const r = await readSite(key, {
              url,
              archived: !!archivedFrom,
              screenshots: live.seen.shots,
              banners: live.seen.banners.slice(0, specials ? 6 : 10),
              logos: branding ? [] : live.seen.logos,
              text,
              specials,
              spotStyles: spots.map((t) => ({ id: t.id, name: t.name, why: t.why })),
              viralFormats: virals.map((f) => ({ key: f.key, name: f.name, category: f.category })),
            });
            mergeReading(brand, r, live.seen.logos, !!archivedFrom, new Set(spots.map((t) => t.id)), new Set(virals.map((f) => f.key)));
            send({ type: "found", key: "Read by Claude", value: `${brand.offerDetails?.length ?? 0} offers · ${r.logoIndex != null ? "logo picked" : "logo kept"}` });
          } catch (e) {
            console.log("[scan] claude read failed", e instanceof Error ? e.message : e);
            send({ type: "step", label: "Claude couldn't read this one — keeping the standard scan" });
          }
        }

        send({ type: "found", key: "Dealership", value: brand.name });
        if (brand.logo) send({ type: "found", key: "Logo", value: "Found" });
        send({ type: "found", key: "Brand colour", value: brand.colors.primary });
        if (brand.city) send({ type: "found", key: "Location", value: `${brand.city}${brand.state ? ", " + brand.state : ""}` });
        if (brand.phone) send({ type: "found", key: "Phone", value: brand.phone });
        if (brand.makes.length) send({ type: "found", key: "Brands sold", value: brand.makes.join(", ") });
        send({ type: "found", key: "Vehicle photos", value: String(brand.vehicles.length) });
        send({ type: "found", key: archivedFrom ? "Source" : "Live offers", value: archivedFrom ? `Archive · ${archivedFrom}` : String(brand.offers.length) });

        brand.logo = proxied(brand.logo);
        brand.vehicles = brand.vehicles.map((v) => ({ ...v, image: proxied(v.image)! }));
        brand.offerDetails = brand.offerDetails?.map((o) => ({ ...o, image: proxied(o.image) }));
        brand.specials = brand.specials?.map((sp) => ({ ...sp, image: proxied(sp.image) }));
        send({ type: "done", brand });
        await logActivity({ type: "scan", label: brand.name + (archivedFrom ? " (archive)" : ""), detail: url });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
        await logActivity({ type: "scan_failed", label: String(raw ?? "").slice(0, 120), detail: e instanceof Error ? e.message.slice(0, 160) : "" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Fold Claude's reading into the parsed kit. Claude wins where it can see better; parsing fills the rest. */
function mergeReading(brand: Brand, r: SiteReading, logos: LogoCandidate[], archived: boolean, spotIds: Set<string>, viralKeys: Set<string>) {
  brand.readByClaude = true;
  const looksLikeHost = !brand.name || /^[a-z0-9-]+$/.test(brand.name);
  if (r.name && r.name.length < 60 && (looksLikeHost || r.name.toLowerCase() !== brand.name.toLowerCase())) brand.name = r.name.trim();
  if (typeof r.logoIndex === "number" && logos[r.logoIndex]?.src) brand.logo = logos[r.logoIndex].src;
  if (usableColor(r.colors?.primary)) {
    brand.colors.primary = r.colors!.primary!.toLowerCase();
    const sec = usableColor(r.colors?.secondary) ? r.colors!.secondary!.toLowerCase() : brand.palette.find((c) => c !== brand.colors.primary);
    if (sec) brand.colors.secondary = sec;
    brand.palette = [...new Set([brand.colors.primary, brand.colors.secondary, ...brand.palette])].slice(0, 8);
  }
  brand.phone = r.phone || brand.phone;
  brand.address = r.address || brand.address;
  brand.city = r.city || brand.city;
  brand.state = r.state?.slice(0, 2).toUpperCase() || brand.state;
  brand.tagline = brand.tagline || r.tagline;
  brand.about = r.about?.slice(0, 200);
  brand.hours = r.hours?.slice(0, 120);
  if (r.makes?.length) brand.makes = [...new Set([...r.makes.map((m) => m.trim()).filter(Boolean), ...brand.makes])].slice(0, 8);
  if (archived) return;
  const banners = bannerUrlsOf(r);
  const details: OfferDetail[] = (r.offers ?? [])
    .filter((o) => o.headline && o.headline.length < 140)
    .slice(0, 12)
    .map((o) => ({
      headline: o.headline.trim(),
      model: o.model,
      kind: ["lease", "apr", "cash", "price", "trade", "event"].includes(o.kind) ? o.kind : "other",
      amount: o.amount,
      term: o.term,
      dueAtSigning: o.dueAtSigning,
      apr: o.apr,
      expires: o.expires,
      disclaimer: o.disclaimer?.slice(0, 600),
      source: o.source === "banner" ? "banner" : "text",
      image: typeof o.bannerIndex === "number" ? banners[o.bannerIndex] : undefined,
    }));
  if (details.length) {
    // Claude's banner reads join whatever the specials pages already gave us
    brand.offerDetails = dedupeOffers([...(brand.offerDetails ?? []), ...details]);
    // Claude's offers first (they include the banner-only ones), then anything parsing found that Claude didn't
    const mine = new Set(details.map((d) => d.headline.toLowerCase()));
    brand.offers = [...details.map((d) => d.headline), ...brand.offers.filter((o) => !mine.has(o.toLowerCase()))].slice(0, 16);
  }
  brand.ideas = ideasOf(r, spotIds, viralKeys);
}

/** Specials page through Firecrawl: text, promo images and a screenshot for Claude. */
async function readSpecialsFc(key: string, target: string) {
  try {
    const p = await fcPage(key, target);
    if (p.status >= 400 || CHALLENGE.test(p.text.slice(0, 2000))) return undefined;
    return { url: p.finalUrl, text: p.text, banners: pickBanners(p.images, 4), screenshot: p.screenshot };
  } catch {
    return undefined;
  }
}

/** One entry per distinct offer (same headline, or same vehicle + amount). */
function dedupeOffers(list: OfferDetail[]) {
  const seen = new Set<string>();
  return list
    .filter((d) => {
      const keys = [d.headline.toLowerCase(), d.model && d.amount ? `${d.model}|${d.amount}`.toLowerCase() : ""].filter(Boolean);
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    })
    .slice(0, 30);
}
