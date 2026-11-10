import type { Template } from "./ad/catalog";
import type { AdInputs, Brand, Platform } from "./types";

export type Caption = {
  platform: Platform;
  text: string;
  hashtags: string[];
  score: number;
  /** Why this one won, in plain words. */
  notes: string[];
  bestTime: string;
};

export type ViralityReport = {
  score: number;
  breakdown: { label: string; value: number }[];
  captions: Record<Platform, Caption>;
  /** Every candidate the brain looked at — the generating screen animates these. */
  considered: { text: string; score: number }[];
};

export const PLATFORM_META: Record<Platform, { label: string; ideal: [number, number]; tags: [number, number]; time: string }> = {
  tiktok: { label: "TikTok", ideal: [70, 150], tags: [3, 5], time: "Tue–Thu · 6–9 PM" },
  reels: { label: "Instagram Reels", ideal: [90, 220], tags: [4, 8], time: "Mon–Fri · 11 AM–1 PM" },
  shorts: { label: "YouTube Shorts", ideal: [30, 90], tags: [2, 3], time: "Fri–Sun · 2–4 PM" },
  facebook: { label: "Facebook", ideal: [60, 160], tags: [1, 3], time: "Wed–Fri · 9 AM–12 PM" },
  x: { label: "X", ideal: [50, 200], tags: [1, 2], time: "Weekdays · 8–10 AM" },
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const sanitize = (s: string) => s.replace(/[^a-z0-9]/gi, "");

/** Hooks that open the caption, keyed by the feeling the template creates. */
const OPENERS: Record<string, string[]> = {
  Interactive: [
    "Bet you can't catch it 👀",
    "Only 1 in 10 people pause it in time ⏸️",
    "Screenshot it and it's yours. Seriously.",
    "Your thumb vs. our deal. Go.",
    "Did you catch it? Be honest 👇",
  ],
  Illusion: [
    "Wait for it… 🔪",
    "Real car or cake? Comment BEFORE the cut 👇",
    "I need to know who guessed right 😭",
    "Our bakery budget was worth it 🎂",
    "The cake is fake. The deal is not.",
  ],
  Satisfying: [
    "Turn your sound on for this one 🔊",
    "The most satisfying thing you'll see today ✨",
    "Watch till the very end 🫧",
    "This is how every car leaves our lot",
  ],
  POV: [
    "POV: you finally did it 🔑",
    "Tag someone who needs this upgrade 👇",
    "This could be you this weekend",
    "Manifesting this for everyone reading 🙏",
  ],
  "Phone UI": [
    "This is literally how it went 😂",
    "Send this to the friend who needs a new car",
    "Tell me this isn't you 👇",
    "The text you'll send after visiting us",
  ],
  Game: [
    "Wait for it to land 🎯",
    "Comment where you think it stops 👇",
    "Everyone's a winner this weekend 🏆",
    "Feeling lucky? 🍀",
  ],
  "News & Hype": [
    "This is not a drill 🚨",
    "Okay this is actually happening",
    "We probably shouldn't be doing this…",
    "Run, don't walk 🏃",
  ],
  Meme: [
    "Fight me in the comments 😤",
    "Tell me I'm wrong 👇",
    "Too real? 😂",
    "Tag the person who needs to see this",
  ],
  Countdown: [
    "Set a reminder ⏰",
    "Clock's ticking ⏳",
    "Don't say we didn't warn you",
    "Last call 🔔",
  ],
  Aesthetic: [
    "Okay this one is actually beautiful ✨",
    "Watch it come together 👀",
    "We made a car ad you'll want to rewatch",
    "Save this for the aesthetic alone 📌",
  ],
  Cinematic: [
    "Some things you just have to see in person",
    "Built different ✨",
    "Your weekend plans just changed",
    "Meet your next car",
  ],
};

const CTAS = [
  "📍 {dealer}{cityPart}",
  "DM us “DEAL” and we'll hold it for you",
  "Comment “INFO” and we'll send the details",
  "Link in bio to lock it in 🔗",
  "Stop by this weekend 👋",
  "Save this so you don't forget 📌",
];

function fillCopy(s: string, b: Brand, ad: AdInputs) {
  return s
    .replaceAll("{dealer}", b.name)
    .replaceAll("{cityPart}", b.city ? ` · ${b.city}` : "")
    .replaceAll("{city}", b.city ?? "town")
    .replaceAll("{offer}", ad.offer)
    .replaceAll("{vehicle}", ad.vehicleName || "your next car");
}

function hashtagsFor(p: Platform, t: Template, b: Brand) {
  const city = b.city ? sanitize(b.city) : "";
  const make = b.makes[0] ? sanitize(b.makes[0]) : "";
  const pool = [
    p === "tiktok" ? "carsoftiktok" : p === "reels" ? "carsofinstagram" : p === "shorts" ? "shorts" : "cars",
    city && `${city}cars`.toLowerCase(),
    make && make.toLowerCase(),
    "newcar",
    "cardeals",
    t.category === "Illusion" ? "isitcake" : "",
    t.category === "Satisfying" ? "satisfying" : "",
    t.category === "POV" ? "pov" : "",
    t.category === "Meme" ? "relatable" : "",
    t.category === "Interactive" ? "challenge" : "",
    city && `${city}`.toLowerCase(),
    "dealership",
    "carbuying",
    make && `${make}nation`.toLowerCase(),
    sanitize(b.name).toLowerCase(),
  ].filter(Boolean) as string[];
  const [, max] = PLATFORM_META[p].tags;
  return [...new Set(pool)].slice(0, max).map((h) => "#" + h);
}

/** Scores one caption for one platform. Rules mirror what each feed rewards. */
export function scoreCaption(text: string, tags: string[], p: Platform, b: Brand, ad: AdInputs) {
  const meta = PLATFORM_META[p];
  const notes: string[] = [];
  let s = 50;
  const len = text.length;
  if (len >= meta.ideal[0] && len <= meta.ideal[1]) {
    s += 14;
    notes.push(`Length fits ${meta.label}'s sweet spot`);
  } else s -= Math.min(16, Math.abs(len - (len < meta.ideal[0] ? meta.ideal[0] : meta.ideal[1])) / 6);
  const first = text.split(/\s+/).slice(0, 6).join(" ");
  if (/\?|👀|wait|pov|bet|only|stop|don't|tell me|real/i.test(first)) {
    s += 12;
    notes.push("Hook lands in the first 6 words");
  }
  if (/comment|dm|tag|save|share|send|link in bio|stop by/i.test(text)) {
    s += 9;
    notes.push("Clear call to action");
  }
  if (ad.offer && text.includes(ad.offer)) {
    s += 6;
    notes.push("States the offer in plain words");
  }
  if (b.city && text.includes(b.city)) {
    s += 5;
    notes.push("Local signal for the algorithm");
  }
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emoji >= 1 && emoji <= 3) s += 4;
  else if (emoji > 4) s -= 4;
  const [lo, hi] = meta.tags;
  if (tags.length >= lo && tags.length <= hi) s += 4;
  if (p === "shorts" && len > 100) s -= 8;
  return { score: Math.max(1, Math.min(97, Math.round(s))), notes };
}

function candidates(t: Template, b: Brand, ad: AdInputs, p: Platform) {
  const openers = OPENERS[t.category] ?? OPENERS.Cinematic;
  const out: string[] = [];
  for (const o of openers) {
    for (const c of CTAS) {
      const middle =
        p === "shorts"
          ? ""
          : p === "x"
            ? ` ${ad.offer} at ${b.name}.`
            : `\n\n${ad.offer.replace(/[.!]$/, "")} at ${b.name}${b.city ? " in " + b.city : ""}.`;
      const body = p === "shorts" ? `${o} ${ad.offer}` : `${o}${middle}\n\n${c}`;
      out.push(fillCopy(body, b, ad).trim());
    }
  }
  return out;
}

export function buildReport(t: Template, b: Brand, ad: AdInputs): ViralityReport {
  const platforms: Platform[] = ["tiktok", "reels", "shorts", "facebook", "x"];
  const considered: { text: string; score: number }[] = [];
  const captions = {} as Record<Platform, Caption>;
  for (const p of platforms) {
    const tags = hashtagsFor(p, t, b);
    let best: Caption | null = null;
    for (const text of candidates(t, b, ad, p)) {
      const { score, notes } = scoreCaption(text, tags, p, b, ad);
      // tiny deterministic jitter so ties don't always pick the first opener
      const sc = score + hash(text + t.id) * 1.5;
      considered.push({ text: text.split("\n")[0], score: Math.round(sc) });
      if (!best || sc > best.score)
        best = { platform: p, text, hashtags: tags, score: sc, notes, bestTime: PLATFORM_META[p].time };
    }
    best!.score = Math.round(best!.score);
    captions[p] = best!;
  }

  const capAvg = platforms.reduce((a, p) => a + captions[p].score, 0) / platforms.length;
  const has = (tag: string) => t.tags.includes(tag);
  const hook = Math.min(98, t.score - 4 + (has("pattern interrupt") || has("illusion") ? 6 : 0) + hash(t.id) * 4);
  const retention = Math.min(98, t.score - 6 + (has("watch till end") || has("replay bait") || has("loop") ? 8 : 0) + hash(t.id + "r") * 4);
  const share = Math.min(98, t.score - 10 + (has("relatable") || has("humor") || has("meme") ? 9 : 0) + (has("screenshot") ? 6 : 0) + hash(t.id + "s") * 4);
  const comments = Math.min(98, t.score - 12 + (has("comment bait") || has("debate") || has("poll") || has("quiz") ? 14 : 0) + hash(t.id + "c") * 4);
  const brandFit = Math.min(98, 60 + (b.logo ? 12 : 0) + (ad.offer.length > 4 ? 10 : 0) + (b.city ? 6 : 0) + (ad.vehicleImage && !ad.vehicleImage.startsWith("/cars/") ? 8 : 0));
  const score = Math.round(t.score * 0.45 + capAvg * 0.2 + ((hook + retention + share + comments) / 4) * 0.25 + brandFit * 0.1);
  return {
    score: Math.min(97, score),
    breakdown: [
      { label: "Hook strength", value: Math.round(hook) },
      { label: "Retention", value: Math.round(retention) },
      { label: "Shareability", value: Math.round(share) },
      { label: "Comment pull", value: Math.round(comments) },
      { label: "Brand fit", value: Math.round(brandFit) },
    ],
    captions,
    considered,
  };
}

export function captionWithTags(c: Caption) {
  return `${c.text}\n\n${c.hashtags.join(" ")}`;
}
