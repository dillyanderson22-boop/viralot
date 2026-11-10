import { connection } from "next/server";
import { isAdmin, unauthorized } from "@/lib/server/auth";
import { readActivity } from "@/lib/server/settings";

export async function GET(req: Request) {
  await connection();
  if (!isAdmin(req)) return unauthorized();
  const events = await readActivity();
  const week = Date.now() - 7 * 864e5;
  const recent = events.filter((e) => Date.parse(e.at) > week);
  const count = (t: string) => recent.filter((e) => e.type === t).length;
  return Response.json({
    stats: { scans: count("scan"), failed: count("scan_failed"), captions: count("captions"), exports: count("export") },
    events: events.slice(0, 60),
  });
}
