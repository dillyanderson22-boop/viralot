/**
 * The car-sales calendar. Each event knows when it runs, what to offer and
 * how each template format should talk about it. Dates are computed, so the
 * list stays right every year.
 */

export type SalesEvent = {
  id: string;
  name: string;
  emoji: string;
  /** Short all-caps word for boards and signs (≤ 12 chars). */
  tag: string;
  blurb: string;
  offers: string[];
  window: (year: number) => [Date, Date];
  /** Per-engine param overrides; `{offer}`/`{dealer}` placeholders are filled at render. */
  hooks?: Record<string, Record<string, unknown>>;
};

const d = (y: number, m: number, day: number) => new Date(y, m, day);
/** nth weekday (0=Sun) of a month; n = -1 means the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  if (n > 0) {
    const first = d(y, m, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return d(y, m, 1 + offset + (n - 1) * 7);
  }
  const last = d(y, m + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return d(y, m, last.getDate() - offset);
}
const around = (day: Date, before: number, after: number): [Date, Date] => [
  new Date(day.getTime() - before * 864e5),
  new Date(day.getTime() + after * 864e5),
];

export const EVENTS: SalesEvent[] = [
  {
    id: "new-year",
    name: "New Year Sales Event",
    emoji: "🎆",
    tag: "NEW YEAR",
    blurb: "New year, new ride",
    offers: ["New year, new ride — 0% APR on select models", "Start the year with $0 down"],
    window: (y) => [d(y, 0, 1), d(y, 0, 10)],
  },
  {
    id: "tax-season",
    name: "Tax Refund Season",
    emoji: "💸",
    tag: "TAX REFUND",
    blurb: "Turn your refund into a down payment",
    offers: ["Turn your tax refund into a down payment", "We'll double your down payment up to $1,000"],
    window: (y) => [d(y, 1, 1), d(y, 3, 15)],
    hooks: {
      kinetic: { lines: ["Got your refund?", "Make it", "a down payment.", "{offer}."] },
      chart: { ticker: "$REFUND", label: "What your tax refund can do", hook: "Your refund just became a car 📈" },
    },
  },
  {
    id: "presidents-day",
    name: "Presidents' Day Sale",
    emoji: "🇺🇸",
    tag: "PRESIDENTS",
    blurb: "One of the biggest car-buying weekends of winter",
    offers: ["Presidents' Day: $2,000 off select models", "0.9% APR all weekend"],
    window: (y) => around(nthWeekday(y, 1, 1, 3), 10, 1),
  },
  {
    id: "memorial-day",
    name: "Memorial Day Sales Event",
    emoji: "🇺🇸",
    tag: "MEMORIAL DAY",
    blurb: "Kick off summer with the first big weekend",
    offers: ["Memorial Day: up to $3,000 off", "0% APR for 60 months this weekend"],
    window: (y) => around(nthWeekday(y, 4, 1, -1), 10, 1),
  },
  {
    id: "july-4",
    name: "4th of July Sale",
    emoji: "🎇",
    tag: "4TH OF JULY",
    blurb: "Fireworks pricing all week",
    offers: ["Fireworks pricing: $0 down all week", "Independence from high payments"],
    window: (y) => [d(y, 5, 25), d(y, 6, 6)],
  },
  {
    id: "back-to-school",
    name: "Back to School",
    emoji: "🎒",
    tag: "SCHOOL RUN",
    blurb: "Safe, reliable rides for the school year",
    offers: ["First payment on us before school starts", "Student & first-time buyer program"],
    window: (y) => [d(y, 7, 1), d(y, 7, 31)],
  },
  {
    id: "labor-day",
    name: "Labor Day Sales Event",
    emoji: "🛠️",
    tag: "LABOR DAY",
    blurb: "The last big weekend of summer",
    offers: ["Labor Day: up to $2,500 off", "No payments for 90 days"],
    window: (y) => around(nthWeekday(y, 8, 1, 1), 10, 1),
  },
  {
    id: "model-year",
    name: "Model-Year Clearance",
    emoji: "📆",
    tag: "CLEARANCE",
    blurb: "Last year's models have to go",
    offers: ["Model-year clearance: every outgoing model must go", "Last year's prices on this year's favorites"],
    window: (y) => [d(y, 7, 15), d(y, 9, 31)],
    hooks: {
      news: { headline: "Every outgoing model at {dealer} must go", sub: "Clearance pricing: \"{offer}\"" },
    },
  },
  {
    id: "halloween",
    name: "Halloween Deals",
    emoji: "🎃",
    tag: "SPOOKY DEAL",
    blurb: "Scary-low prices",
    offers: ["Scary-low prices all week 🎃", "No tricks, just $0 down treats"],
    window: (y) => [d(y, 9, 18), d(y, 9, 31)],
    hooks: {
      mystery: { hook: "Trick or treat? Open the box 🎃" },
      neon: { hook: "SCARY LOW PRICES", color: "#ff7a1a" },
    },
  },
  {
    id: "veterans-day",
    name: "Veterans Day",
    emoji: "🎖️",
    tag: "THANK YOU",
    blurb: "Honor those who served",
    offers: ["$500 military appreciation bonus", "Thank you for your service — extra $500 off"],
    window: (y) => around(d(y, 10, 11), 7, 0),
  },
  {
    id: "black-friday",
    name: "Black Friday",
    emoji: "🛍️",
    tag: "BLACK FRIDAY",
    blurb: "The biggest deals of the year",
    offers: ["Black Friday: biggest savings of the year", "Doorbuster: $0 down, first payment on us"],
    window: (y) => around(new Date(nthWeekday(y, 10, 4, 4).getTime() + 864e5), 10, 3),
    hooks: {
      neon: { hook: "BLACK FRIDAY", color: "#ff2d55" },
      brutal: { hook: "BLACK FRIDAY.", bg: "#ffd23f" },
    },
  },
  {
    id: "holiday",
    name: "Holiday Sales Event",
    emoji: "🎄",
    tag: "HOLIDAY",
    blurb: "Year-end pricing, the best of the year",
    offers: ["Year-end pricing: the best deals of the year", "Unwrap $0 down this holiday season"],
    window: (y) => [d(y, 11, 1), d(y, 11, 31)],
    hooks: {
      mystery: { hook: "Unwrap your holiday deal 🎁" },
      deco: { hook: "THE HOLIDAY EVENT" },
    },
  },
  {
    id: "end-of-month",
    name: "End-of-Month Push",
    emoji: "⏳",
    tag: "MONTH END",
    blurb: "Dealers chase targets — buyers win",
    offers: ["End of month: we need to hit our numbers", "Month-end pricing until we hit our goal"],
    window: (y) => {
      const now = new Date();
      const m = now.getFullYear() === y ? now.getMonth() : 0;
      const last = d(y, m + 1, 0);
      return [d(y, m, last.getDate() - 7), last];
    },
    hooks: {
      news: { headline: "{dealer} is a few sales short of its monthly goal", sub: "Month-end deals: \"{offer}\"" },
      kinetic: { lines: ["It's the end of the month.", "We have a goal.", "You get the deal.", "{offer}."] },
    },
  },
];

/** Engines that read naturally with event copy, and how they say it by default. */
export function defaultEventParams(ev: SalesEvent): Record<string, Record<string, unknown>> {
  const short = ev.name.replace(/ (Sales Event|Sale|Deals)$/i, "");
  return {
    countdown: { hook: `${short} deals drop in…` },
    kinetic: { lines: [`${short}.`, "Prices this low", "don't last.", "{offer}."] },
    calendar: { hook: `${short} ends soon ${ev.emoji}` },
    splitflap: { lines: [ev.tag, "{dealer}", "{offer}", "ENDS SOON"], hook: `${short} is boarding ${ev.emoji}` },
    neon: { hook: ev.tag },
    news: { headline: `${short} at {dealer} is officially on`, sub: "Shoppers report \"{offer}\"" },
    wheel: { hook: `${short} spin ${ev.emoji}` },
    deco: { hook: ev.tag },
    brutal: { hook: ev.tag + "." },
    weather: { line: `${short.toLowerCase()} savings`, hook: `Forecast: ${short} deals ${ev.emoji}` },
    mystery: { hook: `What's in the ${short} box? ${ev.emoji}` },
    slots: { hook: `${short} jackpot ${ev.emoji}` },
  };
}

export function eventById(id?: string | null) {
  return id ? EVENTS.find((e) => e.id === id) : undefined;
}

/** Events running now or starting within `days`, soonest first. */
export function upcomingEvents(now = new Date(), days = 45) {
  const horizon = now.getTime() + days * 864e5;
  const out: { ev: SalesEvent; start: Date; end: Date; live: boolean; daysAway: number }[] = [];
  for (const ev of EVENTS) {
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      const [start, end] = ev.window(y);
      const endOfDay = end.getTime() + 864e5 - 1;
      if (endOfDay < now.getTime() || start.getTime() > horizon) continue;
      out.push({ ev, start, end, live: start.getTime() <= now.getTime(), daysAway: Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 864e5)) });
      break;
    }
  }
  return out.sort((a, b) => Number(b.live) - Number(a.live) || a.start.getTime() - b.start.getTime());
}
