import { safeFetch } from "@/lib/scan/fetch";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { claudeKey } from "@/lib/server/claude";
import { feedToCars } from "@/lib/server/feed";
import { logActivity } from "@/lib/server/settings";

export const maxDuration = 60;

const MAX = 8_000_000;

/**
 * Inventory from the dealer's own feed: a feed URL (Facebook / Google vehicle
 * ads feed, DMS export link) or an uploaded CSV / TSV / XML / JSON file.
 */
export async function POST(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  let text = "";
  let site = "";
  let source = "";
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      site = String(form.get("site") ?? "");
      if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "Choose a file." }, { status: 400 });
      if (file.size > MAX) return Response.json({ error: "That file is over 8 MB — use the feed link instead." }, { status: 400 });
      if (/spreadsheetml|ms-excel/.test(file.type) || /\.xlsx?$/i.test((file as File).name ?? "")) {
        return Response.json({ error: "Save the spreadsheet as CSV first (File → Save As → CSV), then upload that." }, { status: 400 });
      }
      text = await file.text();
      source = (file as File).name ?? "upload";
    } else {
      const b = (await req.json().catch(() => ({}))) as { url?: string; site?: string };
      site = b.site ?? "";
      if (!b.url || !/^https?:\/\//i.test(b.url.trim())) return Response.json({ error: "Paste the full feed link (https://…)." }, { status: 400 });
      const { res } = await safeFetch(b.url.trim(), { timeoutMs: 30_000, accept: "text/csv,application/xml,text/xml,application/json,text/plain,*/*" });
      if (!res.ok) return Response.json({ error: `The feed link answered ${res.status}. Check it opens in your browser.` }, { status: 400 });
      text = (await res.text()).slice(0, MAX);
      source = new URL(b.url).hostname;
    }
    if (/<html[\s>]/i.test(text.slice(0, 2000))) return Response.json({ error: "That link is a web page, not a feed file." }, { status: 400 });
    let origin = "";
    try {
      origin = new URL(site).origin;
    } catch {}
    const { cars, mappedBy, rows } = await feedToCars(text, origin, (await claudeKey()) ?? undefined);
    if (!cars.length) return Response.json({ error: `Read ${rows} rows but none looked like vehicles.` }, { status: 400 });
    await logActivity({ type: "scan", label: `Inventory import · ${cars.length} vehicles`, detail: source }).catch(() => {});
    return Response.json({
      mappedBy,
      cars: cars.map((c) => ({ ...c, image: c.image ? `/api/img?u=${encodeURIComponent(c.image)}` : undefined, images: c.images?.map((u) => `/api/img?u=${encodeURIComponent(u)}`) })),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}
