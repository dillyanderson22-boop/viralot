/**
 * OEM brand guidelines from the admin's markdown file. One section per brand
 * (a "#" or "##" heading named after the make), with simple "Key: value"
 * lines and lists under "###" headings. Anything else in a section is kept as
 * free-form rules for the Claude review. See public/viralot-brand-guidelines-template.md.
 */

export type FontRef = { name: string; url?: string };

export type BrandRules = {
  brand: string;
  /** Other makes this section covers (e.g. "Acura" under Honda). Lower-case. */
  aliases: string[];
  /** Applies to every brand ("General", "All brands"). */
  global: boolean;
  headingFont?: FontRef;
  bodyFont?: FontRef;
  headlineCase?: "upper" | "title" | "sentence" | "as-written";
  /** Appended to every ad's fine print. */
  requiredDisclaimer?: string;
  /** Must appear somewhere in the ad (on-screen text or fine print). */
  requiredPhrases: string[];
  /** Never allowed anywhere in the ad or captions. */
  banned: string[];
  /** Names that must carry their mark, e.g. "Honda Sensing®". */
  trademarks: string[];
  /** Smallest fine print, in px on the 1080-wide frame. */
  minFinePrintPx?: number;
  /** Sentences that need judgement (checked by the Claude review). */
  rules: string[];
  /** The whole section, verbatim. */
  raw: string;
};

const KEY = /^\s*[-*]?\s*\**([A-Za-z][A-Za-z /&-]{2,40}?)\**\s*:\s*(.+)$/;
const font = (v: string): FontRef => {
  const url = v.match(/https?:\/\/\S+\.(woff2?|ttf|otf)(\?\S*)?/i)?.[0];
  const name = v.replace(url ?? "", "").replace(/[|()]/g, " ").replace(/["'`]/g, "").replace(/\s+/g, " ").trim();
  return { name: name || "Brand font", url };
};
const items = (block: string) =>
  block
    .split("\n")
    .map((l) => l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/)?.[1]?.trim())
    .filter((x): x is string => !!x)
    .map((x) => (/^`.+`$/.test(x.trim()) ? x.trim() : x.replace(/^["'“]|["'”]$/g, "").trim()));

export function parseGuidelines(md: string): BrandRules[] {
  const out: BrandRules[] = [];
  // split on level-1/2 headings; each is a brand (or "General")
  // brands are "##" sections when the file uses them (a "#" line is then just the document title), else "#" sections
  const clean = md.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").replace(/\(example\)\s*/gi, "");
  const parts = (/^##\s+(?!#)/m.test(clean) ? clean.split(/^##\s+(?!#)/m) : clean.split(/^#\s+(?!#)/m)).slice(1);
  for (const part of parts) {
    const [head, ...body] = part.split("\n");
    const brand = head.replace(/[#*_`]/g, "").replace(/\(.*?\)/g, "").replace(/\b(brand )?guidelines?\b/gi, "").trim();
    if (!brand) continue;
    const text = body.join("\n");
    const r: BrandRules = {
      brand,
      aliases: [],
      global: /^(general|all brands?|every brand|global|default)$/i.test(brand),
      requiredPhrases: [],
      banned: [],
      trademarks: [],
      rules: [],
      raw: `## ${head.trim()}\n${text}`.trim(),
    };
    // "### Heading" lists
    const sections = text.split(/^###\s+/m);
    const intro = sections.shift() ?? "";
    for (const sec of sections) {
      const [h, ...rest] = sec.split("\n");
      const list = items(rest.join("\n"));
      const name = h.toLowerCase();
      if (/banned|forbidden|never use|prohibited|avoid|do not use|don.?t use/.test(name)) r.banned.push(...list);
      else if (/required phrase|must include|must say|mandatory|required text|required wording/.test(name)) r.requiredPhrases.push(...list);
      else if (/trademark|®|™|registered/.test(name)) r.trademarks.push(...list);
      else if (/required disclaimer|disclaimer/.test(name)) r.requiredDisclaimer = [r.requiredDisclaimer, rest.join(" ").replace(/^\s*[-*]\s*/gm, "").replace(/\s+/g, " ").trim()].filter(Boolean).join(" ");
      else r.rules.push(...(list.length ? list : rest.join(" ").split(/(?<=\.)\s+/).map((x) => x.trim()).filter((x) => x.length > 8)));
    }
    // "Key: value" lines anywhere in the section
    for (const line of text.split("\n")) {
      const m = line.match(KEY);
      if (!m) continue;
      const k = m[1].toLowerCase().trim();
      const v = m[2].trim();
      if (/^(also covers|aliases|includes|makes)$/.test(k)) r.aliases.push(...v.split(/[,;/]/).map((x) => x.trim().toLowerCase()).filter(Boolean));
      else if (/(heading|headline|display|title) font/.test(k)) r.headingFont = font(v);
      else if (/(body|text|copy|fine print|disclaimer) font/.test(k)) r.bodyFont = font(v);
      else if (/^font$|^typeface$/.test(k)) r.headingFont ??= font(v);
      else if (/(headline|heading) case|capitali[sz]ation/.test(k)) r.headlineCase = /upper|caps/i.test(v) ? "upper" : /title/i.test(v) ? "title" : /sentence/i.test(v) ? "sentence" : "as-written";
      else if (/required disclaimer|disclaimer text|legal line/.test(k)) r.requiredDisclaimer = v;
      else if (/min(imum)?.*(fine print|disclaimer).*(size|px)|fine print size/.test(k)) r.minFinePrintPx = Number(v.match(/\d+(\.\d+)?/)?.[0]) || undefined;
      else if (/banned|never use|prohibited words?/.test(k)) r.banned.push(...v.split(/[,;]/).map((x) => x.trim()).filter(Boolean));
      else if (/must include|required phrases?/.test(k)) r.requiredPhrases.push(...v.split(/;/).map((x) => x.trim()).filter(Boolean));
      else if (/trademarks?/.test(k)) r.trademarks.push(...v.split(/[,;]/).map((x) => x.trim()).filter(Boolean));
    }
    // loose bullet rules in the intro
    for (const it of items(intro)) if (!KEY.test(`- ${it}`)) r.rules.push(it);
    r.banned = [...new Set(r.banned)];
    out.push(r);
  }
  return out;
}

/** The sections that apply to a dealer selling these makes (plus any "General" section). */
export function rulesFor(all: BrandRules[], makes: string[]): BrandRules[] {
  const want = makes.map((m) => m.toLowerCase().trim());
  return all.filter((r) => r.global || want.includes(r.brand.toLowerCase()) || r.aliases.some((a) => want.includes(a)));
}

/** The one style the ads use: the first brand section with fonts / disclaimer wins. */
export function styleOf(rules: BrandRules[]) {
  const brand = rules.find((r) => !r.global) ?? rules[0];
  const disclaimers = [...new Set(rules.map((r) => r.requiredDisclaimer).filter(Boolean) as string[])];
  return {
    brand: brand?.brand,
    headingFont: rules.find((r) => r.headingFont)?.headingFont,
    bodyFont: rules.find((r) => r.bodyFont)?.bodyFont,
    headlineCase: brand?.headlineCase,
    disclaimer: disclaimers.join(" ") || undefined,
  };
}

export type Check = { id: string; label: string; status: "pass" | "fail" | "warn"; detail?: string };

const has = (hay: string, needle: string) => {
  // `HONDA` in backticks: that exact casing, as a whole word ("Honda" passes, "HONDA" fails)
  const exact = needle.trim().match(/^`(.+)`$/)?.[1];
  if (exact) return new RegExp(`(?<![\\w])${exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`).test(hay);
  const n = needle.toLowerCase().trim();
  if (!n) return false;
  // whole words for single words, plain substring for phrases
  return /^\w+$/.test(n) ? new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay) : hay.toLowerCase().includes(n);
};

/**
 * Instant, rule-based checks of one ad against the brand sections: banned
 * words, required phrases and disclaimer, trademark marks, fine print present,
 * offer not expired, headline casing. Judgement calls go to the Claude review.
 */
export function checkAd(rules: BrandRules[], ad: { headline: string; offer: string; finePrint: string; captions: string[]; expires?: string }): Check[] {
  const checks: Check[] = [];
  if (!rules.length) return checks;
  const onScreen = `${ad.headline}\n${ad.offer}\n${ad.finePrint}`;
  const all = `${onScreen}\n${ad.captions.join("\n")}`;

  const banned = [...new Set(rules.flatMap((r) => r.banned))];
  const hits = banned.filter((w) => has(all, w));
  if (banned.length) checks.push({ id: "banned", label: "No banned words", status: hits.length ? "fail" : "pass", detail: hits.length ? `Found: ${hits.join(", ")}` : `${banned.length} checked` });

  const phrases = [...new Set(rules.flatMap((r) => r.requiredPhrases))];
  const missing = phrases.filter((p) => !has(onScreen, p));
  if (phrases.length) checks.push({ id: "phrases", label: "Required wording", status: missing.length ? "fail" : "pass", detail: missing.length ? `Missing: ${missing.join("; ")}` : `${phrases.length} present` });

  const disc = rules.map((r) => r.requiredDisclaimer).filter(Boolean) as string[];
  if (disc.length) {
    const ok = disc.every((d) => ad.finePrint.toLowerCase().includes(d.toLowerCase().slice(0, 40)));
    checks.push({ id: "disclaimer", label: "Brand disclaimer in fine print", status: ok ? "pass" : "fail", detail: ok ? undefined : "Added automatically to new renders; re-open the ad" });
  }

  const marks = [...new Set(rules.flatMap((r) => r.trademarks))];
  const bad = marks.filter((m) => {
    const bare = m.replace(/[®™℠]/g, "").trim();
    return bare && has(all, bare) && !all.includes(m) && /[®™℠]/.test(m);
  });
  if (marks.length) checks.push({ id: "marks", label: "Trademark marks", status: bad.length ? "warn" : "pass", detail: bad.length ? `Should read: ${bad.join(", ")}` : undefined });

  checks.push({ id: "fine", label: "Fine print present", status: ad.finePrint.trim().length > 20 ? "pass" : "fail", detail: ad.finePrint.trim().length > 20 ? undefined : "Add the offer's disclaimer" });

  if (ad.expires) {
    const t = Date.parse(ad.expires);
    if (Number.isFinite(t)) checks.push({ id: "expires", label: "Offer still valid", status: t + 864e5 < Date.now() ? "fail" : "pass", detail: `Ends ${ad.expires}` });
  }

  const caseRule = rules.find((r) => r.headlineCase && r.headlineCase !== "as-written")?.headlineCase;
  if (caseRule && ad.headline.trim()) {
    const h = ad.headline.replace(/[^A-Za-z ]/g, "").trim();
    const ok = caseRule === "upper" ? h === h.toUpperCase() : caseRule === "title" ? h.split(" ").every((w) => !w || w[0] === w[0].toUpperCase()) : h[0] === h[0]?.toUpperCase();
    checks.push({ id: "case", label: `Headline in ${caseRule} case`, status: ok ? "pass" : "warn" });
  }
  return checks;
}
