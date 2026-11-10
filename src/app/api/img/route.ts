import { connection } from "next/server";
import { safeFetch } from "@/lib/scan/fetch";
import { hasAccess, unauthorized } from "@/lib/server/auth";

const MAX = 12 * 1024 * 1024;

/**
 * Same-origin image proxy. Canvas export needs dealer logos and vehicle photos
 * to be same-origin, otherwise the canvas is tainted and MediaRecorder refuses.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const u = new URL(req.url).searchParams.get("u");
  if (!u) return new Response("missing u", { status: 400 });
  const fetchImage = async (src: string) => {
    const { res } = await safeFetch(src, { accept: "image/avif,image/webp,image/*,*/*;q=0.8", timeoutMs: 25_000 });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\//.test(type)) return null;
    const buf = await res.arrayBuffer();
    // tracking pixels and spacer GIFs are not photos
    return buf.byteLength > MAX || buf.byteLength < 1200 ? null : { buf, type };
  };
  try {
    // Archived pages point images at web.archive.org, which rate-limits hard.
    // The dealer's image CDN is rarely bot-protected, so try the original first.
    const original = u.match(/web\.archive\.org\/web\/\d+[a-z_]*\/(https?:\/\/.+)$/)?.[1];
    let img = await fetchImage(original ?? u).catch(() => null);
    // Bot-protected CDNs refuse servers; the Internet Archive usually has the same file.
    if (!img) img = await fetchImage(original ? u : `https://web.archive.org/web/2im_/${u}`).catch(() => null);
    if (!img) return new Response("not an image", { status: 415 });
    return new Response(img.buf, {
      headers: {
        "content-type": img.type,
        "cache-control": "private, max-age=86400",
        // SVG is served as an image only; never let it run as a document.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("fetch failed", { status: 502 });
  }
}
