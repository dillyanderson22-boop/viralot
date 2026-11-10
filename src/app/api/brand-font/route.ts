import fs from "node:fs/promises";
import path from "node:path";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { fontFileOk } from "@/lib/oem";

/**
 * The OEM brand-kit fonts, served only to this app for drawing its own videos.
 * They are manufacturer-licensed (DealerCentives kit §2.5): never published as
 * downloads, never listed, never cached publicly.
 */
const TYPES: Record<string, string> = { woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" };

export async function GET(req: Request) {
  if (!(await hasAccess(req))) return unauthorized();
  const f = new URL(req.url).searchParams.get("f") ?? "";
  const [dir, file] = f.split("/");
  if (!dir || !file || !fontFileOk(dir, file)) return new Response("not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "src/brand-kit/fonts", dir, file));
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream",
        "cache-control": "private, max-age=86400",
        "content-disposition": "inline",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
