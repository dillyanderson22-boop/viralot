import { connection } from "next/server";
import { hasAccess, unauthorized } from "@/lib/server/auth";
import { fileUrl } from "@/lib/server/clips";

/** Finished clips and backgrounds live in private Blob storage; hand out a short-lived signed link. */
export async function GET(req: Request) {
  await connection();
  if (!(await hasAccess(req))) return unauthorized();
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const kind = q.get("kind") === "scene" ? "scene" : "clip";
  if (!/^[\w-]{6,80}$/.test(id)) return new Response("bad id", { status: 400 });
  try {
    return new Response(null, { status: 302, headers: { Location: await fileUrl(kind, id), "Cache-Control": "private, max-age=3000" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
