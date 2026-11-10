import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guard for every server-side fetch of a user-supplied URL.
 *
 * `/api/scan` and `/api/offer` take a URL from anyone holding a one-click demo
 * session and fetch it from our infrastructure. Without this the deployment is
 * an open HTTP proxy into its own private network — and not a blind one, because
 * `/api/offer` returns `evidence` strings that are verbatim substrings of the
 * fetched body, so an attacker reads the response back.
 *
 * The only check that existed was `hostname.includes(".")`, which happily allows
 * 169.254.169.254, 10.x, 192.168.x, 127.0.0.1.nip.io and every public host that
 * redirects into private space.
 *
 * Three properties matter and each was a real hole in an earlier version:
 *   1. Validate the RESOLVED addresses, not the hostname string — a name can
 *      point anywhere.
 *   2. Re-validate on EVERY redirect hop, so a public URL can't 302 inward.
 *   3. Handle IPv6, including IPv4-mapped forms like ::ffff:127.0.0.1.
 *
 * Deliberately NOT "fixed": decimal/octal/hex IP literals. The WHATWG URL parser
 * normalises those to dotted quads before `hostname` is read, so the numeric
 * rules below already cover them.
 */

const BLOCKED_NAMES =
  /^(localhost|metadata\.google\.internal)$|\.(local|internal|localhost|home\.arpa)$/i;

/** True for any address the server must never be pointed at. */
export function isBlockedAddress(addr: string): boolean {
  const ip = addr.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(ip) === 6) {
    // Normalise IPv4-mapped forms so the IPv4 rules below still apply.
    const mapped = /^::ffff:(.+)$/.exec(ip)?.[1];
    if (mapped) {
      if (isIP(mapped) === 4) return isBlockedAddress(mapped);
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
      if (hex) {
        const a = parseInt(hex[1], 16);
        const b = parseInt(hex[2], 16);
        return isBlockedAddress(`${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`);
      }
    }
    if (ip === "::" || ip === "::1") return true;
    if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique-local
    if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
    return false;
  }

  if (isIP(ip) !== 4) return true; // not an address we understand — refuse

  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;

  if (a === 0 || a === 127) return true; // this-host, loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export class BlockedTargetError extends Error {
  constructor(msg = "That address isn't allowed.") {
    super(msg);
    this.name = "BlockedTargetError";
  }
}

/**
 * Throws unless `url` is a public http(s) endpoint on a normal port.
 * Resolves the hostname and rejects if ANY answer is private — picking a
 * "safe" one instead would just be racing a short TTL.
 */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new BlockedTargetError("Only http and https URLs are supported.");
  }
  if (url.port && !["80", "443", ""].includes(url.port)) {
    throw new BlockedTargetError("Only the standard web ports are allowed.");
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_NAMES.test(host)) throw new BlockedTargetError();

  const bare = host.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    if (isBlockedAddress(bare)) throw new BlockedTargetError();
    return;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedTargetError("Couldn't resolve that domain.");
  }
  if (!records.length) throw new BlockedTargetError("Couldn't resolve that domain.");
  if (records.some((r) => isBlockedAddress(r.address))) throw new BlockedTargetError();
}
