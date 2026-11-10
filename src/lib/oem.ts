/**
 * Manufacturer rules from the DealerCentives OEM brand kit (OEM-BRAND-REQUIREMENTS.md,
 * generated 2026-10-20 from dc-platform @ fda5d700). Fonts are the kit's own files
 * (src/brand-kit/fonts, licensed, never public); casing follows §0, §6.1–6.3.
 */

/** Which kit folder a make's fonts live in (CDJR shares one). */
const FONT_DIR: Record<string, string> = {
  acura: "Acura",
  bmw: "BMW",
  buick: "Buick",
  chevrolet: "Chevrolet",
  chevy: "Chevrolet",
  ford: "Ford",
  genesis: "Genesis",
  gmc: "GMC",
  honda: "Honda",
  hyundai: "Hyundai",
  kia: "Kia",
  lexus: "Lexus",
  mazda: "Mazda",
  nissan: "Nissan",
  subaru: "Subaru",
  chrysler: "CDJR",
  dodge: "CDJR",
  jeep: "CDJR",
  ram: "CDJR",
  toyota: "Toyota",
  volkswagen: "Volkswagen",
  vw: "Volkswagen",
};

/** Regular 400 + Bold 700 per make (§2.2; Chevrolet/Toyota/Honda use the true Bold originals per §2.3), plus the figure face where the kit names one. */
const FILES: Record<string, { regular: string; bold: string; figure?: string }> = {
  Acura: { regular: "regular.woff2", bold: "bold.woff2", figure: "figure.woff2" },
  BMW: { regular: "regular.woff2", bold: "bold.woff2" },
  Buick: { regular: "regular.woff2", bold: "bold.woff2" },
  Chevrolet: { regular: "regular.woff2", bold: "bold.otf" },
  Ford: { regular: "regular.woff2", bold: "bold.woff2" },
  Genesis: { regular: "regular.woff2", bold: "bold.woff2", figure: "figure.woff2" },
  GMC: { regular: "regular.woff2", bold: "bold.woff2" },
  Honda: { regular: "regular.ttf", bold: "bold.ttf" },
  Hyundai: { regular: "regular.woff2", bold: "bold.woff2", figure: "figure.woff2" },
  Kia: { regular: "regular.woff2", bold: "bold.woff2" },
  Lexus: { regular: "regular.woff2", bold: "bold.woff2" },
  Mazda: { regular: "regular.woff2", bold: "bold.woff2" },
  Nissan: { regular: "regular.woff2", bold: "bold.woff2" },
  Subaru: { regular: "regular.woff2", bold: "bold.woff2" },
  CDJR: { regular: "regular.woff2", bold: "bold.woff2" },
  Toyota: { regular: "regular.woff2", bold: "bold.otf" },
  Volkswagen: { regular: "regular.woff2", bold: "bold.woff2", figure: "figure.woff2" },
};

export const fontFileOk = (dir: string, file: string) => !!FILES[dir] && Object.values(FILES[dir]).includes(file);

export type OemFaces = { family: string; faces: { weight: number; url: string }[]; figure?: { family: string; url: string } };

/** The approved brand face for a dealer's first recognised make, as app-served font URLs. */
export function oemFaces(makes: string[]): (OemFaces & { make: string }) | undefined {
  for (const m of makes) {
    const dir = FONT_DIR[m.toLowerCase().trim()];
    const f = dir && FILES[dir];
    if (!f) continue;
    const url = (file: string) => `/api/brand-font?f=${encodeURIComponent(`${dir}/${file}`)}`;
    return {
      make: dir,
      family: `Viralot ${dir}`,
      // weights above 700 resolve to the real Bold, never a synthesized one (§2.1)
      faces: [
        { weight: 400, url: url(f.regular) },
        { weight: 700, url: url(f.bold) },
      ],
      figure: f.figure ? { family: `Viralot ${dir} Figures`, url: url(f.figure) } : undefined,
    };
  }
  return undefined;
}

/** True when the dealer sells a make covered by the OEM kit: no style uppercasing, stock-render caveat, etc. */
export const coveredByKit = (makes: string[]) => makes.some((m) => FONT_DIR[m.toLowerCase().trim()] || /^(cadillac|mercedes|mercedes-benz|mini|lincoln|infiniti)$/i.test(m.trim()));

// ---------------------------------------------------------------- casing (§6.1–6.3)

const LOWER = new Set("a an and as at but by for from in nor of on or per the to via vs with".split(" "));
/** Everyday two-letter words: the "short words stay uppercase" rule is for codes like LX or SE, not these. */
const COMMON2 = new Set("up is it go no my we do be so me us he if am".split(" "));
const KEEP_UPPER = new Set(
  "AHFC AMG APR AWD BMW CPO FAQ FWD GMC HEMI HEV MSRP NMAC NISMO OEM PHEV RWD SUV SUVS TMCC USA USAA VIN ACTIV ADX ARIYA BRZ CELESTIQ CLA CLE EQB EQE EQS GLA GLB GLC GLE GLI GLS GTI HUMMER ILX IONIQ LEAF LTZ LYRIQ MDX NSX OPTIQ RDX RST RTL SEL SLE SLT SRT STI SXT TLX TRD TRG TRX VISTIQ WRX XLE XSE ZDX DAS".split(" ")
);

/** OEM spellings that generic casing would break (§6.3), applied last as whole-word fixes. */
const SPELLINGS = [
  // two-letter models (IS, LE, SE, RX…) are left to the shouted-run rule: as whole words they collide with English
  "CR-V", "HR-V", "EX-L", "Sport-L", "Touring-L", "TrailSport", "TrailSport+", "Civic Si", "Civic Type R", "e:HEV", "RTL", "RAV4", "4Runner", "bZ4X", "bZ Woodland", "C-HR", "GR86", "GR Corolla", "TRD", "SR5", "XLE", "XSE", "i-FORCE MAX", "Hybrid MAX", "MDX", "RDX", "TLX", "ILX", "NSX", "ADX", "ZDX", "Integra Type S", "xDrive", "Encore GX", "LYRIQ", "OPTIQ", "VISTIQ", "CELESTIQ", "CT4", "CT5", "XT4", "XT5", "XT6", "Escalade ESV", "Escalade IQ", "Escalade IQL", "LTZ", "1LT", "2LT", "3LT", "ZR1", "ZL1", "ACTIV", "Trail Boss", "Bolt EV", "Equinox EV", "R/T", "SRT", "SXT", "TRX", "RHO", "HEMI", "Scat Pack", "Big Horn", "Wrangler 4xe", "Grand Cherokee 4xe", "ProMaster", "F-150", "F-250", "F-350", "Super Duty", "Mustang Mach-E", "Expedition Max", "King Ranch", "ST-Line", "G70", "G80", "G90", "GV60", "GV70", "GV80", "SLE", "SLT", "AT4", "AT4X", "Denali", "HUMMER EV", "IONIQ 5", "IONIQ 6", "Kona", "Santa Fe", "Santa Cruz", "EV6", "EV9", "K4", "K5", "Soul", "Niro", "Rio", "GT-Line", "Mazda3", "CX-5", "CX-30", "CX-50", "CX-70", "CX-90", "MX-5 Miata", "NISMO", "LEAF", "ARIYA", "PRO-4X", "Juke", "WRX", "BRZ", "STI", "ID.4", "ID.3", "ID.7", "ID. Buzz", "GTI", "GLI", "SEL", "TSI", "TDI", "Golf GTI", "Taos", "4MATIC®", "4MATIC+®", "AWD", "FWD", "RWD", "2WD", "4WD", "APR", "MSRP", "VIN", "Honda", "Kia", "GMC", "BMW", "Mercedes-Benz", "Toyota", "Ford", "Nissan", "Mazda", "Subaru", "Hyundai", "Genesis", "Acura", "Lexus", "Buick", "Cadillac", "Chrysler", "Dodge", "Jeep", "Chevrolet", "Volkswagen",
].sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SPELL_RE = SPELLINGS.map((w) => [new RegExp(`(?<![\\w-])${esc(w)}(?![\\w-])`, "gi"), w] as const);

/**
 * Display text in title case (§6.2) with the manufacturers' own spellings (§6.3):
 * "LEASE A NEW 2026 HONDA CR-V EX-L" → "Lease a New 2026 Honda CR-V EX-L".
 * Words with digits or "&" (and "$299/mo") stay as written; units read "/mo".
 */
export function oemTitle(s: string) {
  if (!s) return s;
  let first = true;
  const out = s
    .split(/(\s+)/)
    .map((w) => {
      if (/^\s+$/.test(w) || !w) return w;
      const bare = w.replace(/[^A-Za-z]/g, "");
      let r: string;
      if (/[\d&]/.test(w)) r = w.replace(/\/MO\b/g, "/mo").replace(/\bMOS?\.?$/, (m) => m.charAt(0) + m.slice(1).toLowerCase());
      else if (KEEP_UPPER.has(bare.toUpperCase()) || (bare.length <= 2 && bare === bare.toUpperCase() && bare.length > 0 && !LOWER.has(bare.toLowerCase()) && !COMMON2.has(bare.toLowerCase())))
        r = w.toUpperCase().replace(/\/MO\b/, "/mo");
      else if (!first && LOWER.has(bare.toLowerCase())) r = w.toLowerCase();
      else r = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      first = /[.:!?]$/.test(w);
      return r;
    })
    .join("");
  return SPELL_RE.reduce((acc, [re, word]) => acc.replace(re, word), out);
}

/**
 * OEM kit §7.12: an offer is valid through 23:59:59 dealer-local time on its end
 * date; with no time zone known, the latest US zone (Hawaii, UTC−10), so it can
 * only end late, never early. Unparseable dates are not treated as expired.
 */
export function isExpired(date?: string, now = Date.now()) {
  if (!date) return false;
  const m = date.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  const d = m ? new Date(Date.UTC(+(m[3].length === 2 ? "20" + m[3] : m[3]), +m[1] - 1, +m[2])) : new Date(Date.parse(date.replace(/^(ends|expires|offer ends)\s*/i, "") + " UTC"));
  if (isNaN(d.getTime())) return false;
  return now > d.getTime() + 864e5 + 10 * 36e5;
}
