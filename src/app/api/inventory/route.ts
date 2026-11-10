import { renderPage } from "@/lib/scrape-core/render";
import { BlockedTargetError } from "@/lib/scrape-core/ssrf";
import { inventoryLinks } from "@/lib/scan/extract";
import { normalizeUrl } from "@/lib/scan/fetch";
import { probeInventory } from "@/lib/scan/inventory-probe";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { getSecret, logActivity } from "@/lib/server/settings";
import { claudeKey, readListings } from "@/lib/server/claude";
import { fcEvaluate, fcPage, firecrawlKey } from "@/lib/server/firecrawl";

export const maxDuration = 240;

const CHALLENGE =
  /just a moment|attention required|checking your browser|verify(ing)? you are (a )?human|keep your website experience safe|pardon our interruption|incapsula|are you a robot|access denied/i;

/** Common listing paths per dealer platform, used when the homepage doesn't link one we recognise. */
const GUESSES: Record<"new" | "used", string[]> = {
  new: ["/searchnew.aspx", "/new-vehicles/", "/new-inventory/index.htm", "/inventory/new", "/new-inventory/"],
  used: ["/searchused.aspx", "/used-vehicles/", "/used-inventory/index.htm", "/inventory/used", "/used-inventory/"],
};

type RawCar = ReturnType<typeof probeInventory>[number];

type InventoryEvent =
  | { type: "step"; label: string }
  | { type: "cars"; kind: "new" | "used"; cars: (RawCar & { listedAt?: number; kind: "new" | "used" })[] }
  | { type: "done"; total: number }
  | { type: "error"; message: string };

/** An Internet Archive copy's URL back to the live page it captured. */
function unarchive(u: string) {
  const m = u.match(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.+)$/i);
  return m ? m[1].replace(/^(https?:)\/+/, "$1//") : u;
}

/** Photo URLs on several platforms carry their upload timestamp — the closest thing to a "days on lot" we can read. */
function listedFromImage(src?: string): number | undefined {
  const m = src?.match(/(20\d{2})-(\d{2})-(\d{2})T?/);
  if (!m) return undefined;
  const ts = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return ts > Date.now() - 3 * 365 * 864e5 && ts <= Date.now() + 864e5 ? ts : undefined;
}

export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const wsEndpoint = await getSecret("browserWs");
  const key = await claudeKey();
  const fcKey = await firecrawlKey();
  const body = (await req.json().catch(() => ({}))) as { url?: string; links?: { new?: string; used?: string } };
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: InventoryEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      let total = 0;
      try {
        if (!body.url) throw new Error("Missing dealer website.");
        const site = normalizeUrl(unarchive(body.url));
        const origin = new URL(site).origin;
        const host = new URL(site).hostname.replace(/^www\./, "");
        // saved links can be archive copies (brand kits read from the Internet Archive) or off-site; keep live, same-site ones
        const clean = (u?: string) => {
          if (!u) return undefined;
          try {
            const live = unarchive(u);
            return new URL(live).hostname.replace(/^www\./, "") === host ? live : undefined;
          } catch {
            return undefined;
          }
        };
        let links: { new?: string; used?: string } = { new: clean(body.links?.new), used: clean(body.links?.used) };

        if (!links.new && !links.used) {
          send({ type: "step", label: "Finding the inventory pages" });
          if (fcKey) {
            try {
              const home = await fcPage(fcKey, site);
              links = inventoryLinks(home.html, home.finalUrl);
            } catch {}
          }
          // with Firecrawl configured it does all the reading; our own browser is only the no-key fallback
          if (!fcKey && !links.new && !links.used) try {
            const home = await renderPage(site, { timeoutMs: 30_000, settleMs: 2_000, waitForText: null, wsEndpoint, waitWhile: CHALLENGE, waitWhileMs: 12_000 });
            if (!home.blocked) links = inventoryLinks(home.html, home.finalUrl);
          } catch (e) {
            if (e instanceof BlockedTargetError) throw e;
          }
        }

        // new and used listings render side by side — roughly halves the wait
        const readKind = async (kind: "new" | "used", retry = false): Promise<boolean> => {
            const candidates = [links[kind], ...GUESSES[kind].map((p) => origin + p)].filter(Boolean) as string[];
            let got = false;
            for (const target of candidates.slice(0, 3)) {
              send({ type: "step", label: `${retry ? "Retrying" : "Reading"} ${kind} inventory · ${new URL(target).pathname}` });
              let cars: RawCar[] = [];
              let blocked = false;
              // Firecrawl first, when configured: our card reader runs inside its browser
              if (fcKey) {
                try {
                  const r = await fcEvaluate(fcKey, target, probeInventory);
                  if (Array.isArray(r.value) && r.value.length) {
                    cars = r.value as RawCar[];
                    send({ type: "step", label: `Firecrawl read ${cars.length} ${kind} listings` });
                  }
                } catch (e) {
                  console.log("[inventory] firecrawl failed", target, e instanceof Error ? e.message : e);
                }
              }
              // filled inside the page callback (a box, so TypeScript sees the write)
              const box: { raw: { url: string; text: string; images: { src: string; alt: string }[]; links: { href: string; text: string }[] } | null } = { raw: null };
              if (!cars.length && !fcKey) try {
                await renderPage(target, {
                  timeoutMs: 40_000,
                  settleMs: 4_000,
                  blockResources: false,
                  wsEndpoint,
                  waitWhile: CHALLENGE,
                  waitWhileMs: 12_000,
                  onPage: async (page) => {
                    // listing cards often lazy-load photos as they scroll into view
                    for (let i = 0; i < 6; i++) {
                      await page.evaluate(() => window.scrollBy(0, window.innerHeight)).catch(() => {});
                      await page.waitForTimeout(350);
                    }
                    const text = await page.evaluate(() => document.title + " " + (document.body?.innerText ?? "").slice(0, 1500)).catch(() => "");
                    if (CHALLENGE.test(text)) {
                      blocked = true;
                      return;
                    }
                    cars = await page.evaluate(probeInventory);
                    // nothing our card reader recognises: keep the raw page for Claude
                    if (cars.length < 2 && key) {
                      box.raw = await page
                        .evaluate(() => ({
                          url: location.href,
                          text: document.body?.innerText ?? "",
                          images: Array.from(document.images)
                            .filter((i) => i.naturalWidth >= 200)
                            .map((i) => ({ src: i.currentSrc || i.src, alt: i.alt || "" })),
                          links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
                            .filter((a) => a.href.startsWith(location.origin) && (a.textContent ?? "").trim().length > 6)
                            .map((a) => ({ href: a.href, text: (a.textContent ?? "").trim().replace(/\s+/g, " ") })),
                        }))
                        .catch(() => null);
                    }
                  },
                });
              } catch (e) {
                if (e instanceof BlockedTargetError) throw e;
              }
              if (blocked) {
                send({ type: "step", label: "Inventory page is bot-protected" });
                return true; // retrying won't help
              }
              // only worth a Claude call when the page actually lists priced vehicles
              const looksLikeListings = (t: string) => (t.match(/\$\s?\d{1,3}(,\d{3})+/g)?.length ?? 0) >= 3 && /\b(19|20)\d{2}\b/.test(t);
              if (cars.length < 2 && box.raw && key && looksLikeListings(box.raw.text)) {
                const page = box.raw;
                send({ type: "step", label: `Claude is reading the ${kind} listings` });
                try {
                  const read = await readListings(key, page.url, page.text, page.images, page.links);
                  if (read.length > cars.length) cars = read;
                } catch (e) {
                  console.log("[inventory] claude read failed", e instanceof Error ? e.message : e);
                }
              }
              if (cars.length) {
                total += cars.length;
                send({
                  type: "cars",
                  kind,
                  cars: cars.map((c) => ({ ...c, kind, listedAt: listedFromImage(c.image), image: c.image ? `/api/img?u=${encodeURIComponent(c.image)}` : undefined })),
                });
                got = true;
                break;
              }
            }
            if (!got && retry) send({ type: "step", label: `No ${kind} listings found` });
            return got;
          };
        const results = await Promise.all([readKind("new"), readKind("used")]);
        // anything that failed while running in parallel gets one calm, sequential retry
        for (const [i, kind] of (["new", "used"] as const).entries()) if (!results[i]) await readKind(kind, true);

        if (!total) {
          throw new Error(
            fcKey
              ? "Firecrawl opened this dealer's inventory pages but found no listings on them. Import the dealer's inventory feed instead."
              : "We couldn't read this dealer's inventory pages — the site blocks automated visitors. Add a Firecrawl key in /admin."
          );
        }
        send({ type: "done", total });
        await logActivity({ type: "scan", label: `Inventory · ${total} vehicles`, detail: site });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
