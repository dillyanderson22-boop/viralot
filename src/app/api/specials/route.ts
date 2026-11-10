import { hasAccess, unauthorized } from "@/lib/server/auth";
import { logActivity } from "@/lib/server/settings";
import { firecrawlKey, scanSpecials } from "@/lib/server/firecrawl";
import { normalizeUrl } from "@/lib/scan/fetch";

export const maxDuration = 240;

const proxied = (u?: string) => (u ? `/api/img?u=${encodeURIComponent(u)}` : undefined);
const unarchive = (u: string) => u.match(/^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(.+)$/i)?.[1].replace(/^(https?:)\/+/, "$1//") ?? u;

/** POST {url} → {specials, pages}: every car on the dealer's specials pages with all its offers. */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const key = await firecrawlKey();
  if (!key) return Response.json({ error: "Add a Firecrawl key in /admin to read specials pages." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url) return Response.json({ error: "Missing dealer website." }, { status: 400 });
  try {
    const site = normalizeUrl(unarchive(body.url));
    const { specials, pages } = await scanSpecials(key, site);
    await logActivity({ type: "scan", label: `Specials · ${specials.length} cars`, detail: site }).catch(() => {});
    return Response.json({ specials: specials.map((sp) => ({ ...sp, image: proxied(sp.image) })), pages });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.slice(0, 200) : "Couldn't read the specials" }, { status: 502 });
  }
}
