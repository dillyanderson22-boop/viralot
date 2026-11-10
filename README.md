# Viralot

Paste a dealership URL → get branded, viral-format social ads with platform-tuned captions and a virality score.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Needs Google Chrome installed (the scanner drives it headlessly).

## How it works

| Step | What happens | Where |
| --- | --- | --- |
| Scan | Renders the site in real Chrome, pulls name, logo, brand colours, phone/city, makes, vehicle photos and live offers. Streams progress to the UI. | `src/app/api/scan`, `src/lib/scan`, `src/lib/scrape-core` (vendored from `dealer-scrape`) |
| Brand kit | Edit anything; every template re-themes live. | `src/components/BrandKit.tsx` |
| Library | One card per distinct format (no duplicates); hooks and colour looks are picked inside each format. Offer and car pickers apply to every preview (45 animation engines, incl. 14 aesthetic styles: split-flap, neon, comic, VHS, neo-brutalism, holographic, pixel art, blueprint, art deco, particles, glassmorphism, ASCII, liquid, Bauhaus). Hover to play. | `src/lib/ad/catalog.ts`, `engines-*.ts` |
| Generate | Particle sphere → brain scoring caption candidates → virality test. | `src/components/Generating.tsx`, `ParticleBrain.tsx` |
| Launch | Player, virality breakdown, captions per platform, one-click copy, MP4 download (1080×1920 with sound, rendered in the browser). | `src/components/Results.tsx`, `src/lib/ad/runtime.ts` |

Ads are drawn in code over a small set of reusable AI clips in `public/plates/`, so generating ads costs **zero Higgsfield credits**. Honda dealers automatically get the original Honda cake / race-by clips.

## Dashboard features

- **Inventory** — reads the dealer's new/used listing pages (photo, price, stock #, VIN, mileage), tracks days on lot across scans, flags aged units (outgoing model years, 60+/45+ days, price drops) and turns one car or a set of cars into one ad each. `src/app/api/inventory`, `src/lib/scan/inventory-probe.ts`, `src/lib/inventory.ts`.
- **Events** — holiday weekends, tax season, model-year clearance, Halloween, Black Friday, holiday, end of month; computed per year in `src/lib/events.ts`. Turning one on swaps in event hooks and offers.
- **Learning** — rate ads 🔥/👍/👎; `src/lib/learning.ts` re-ranks formats per dealer.
- **Every size** — one real-time pass records 9:16, 4:5, 1:1 and 16:9 and zips them (`exportAds` in `src/lib/ad/runtime.ts`).
- **Calendar** — auto-plans one ad per day at each platform's best hour, Posted ✓ tracking, `.ics` export (`src/lib/calendar.ts`).

## Admin

Visit `/admin`. It is locked until `ADMIN_PASSWORD` is set (Vercel → Settings → Environment Variables, then redeploy). From there you can:

- save API keys (encrypted with `SETTINGS_SECRET`, stored in a private Vercel Blob; admin values override env vars),
- lock the studio behind an access code,
- see scans, failed scans, Claude captions and exports from the last 7 days.

Locally, `.env.local` sets `VIRALOT_LOCAL_STORE=1` so dev uses `.data/` instead of the production Blob store.

## Optional

- `ANTHROPIC_API_KEY` — Claude writes the captions (falls back to the built-in caption engine without it). `CAPTION_MODEL` overrides the model.
- `BROWSER_WS_ENDPOINT` — use a hosted browser (Browserless, Browserbase) instead of local Chrome, e.g. when deploying.

## Adding a template

Add a variant to a family in `src/lib/ad/catalog.ts` (new hook copy, colours, params). For a new format, write an engine `(s: Scene) => void` in an `engines-*.ts` file, register it in `ENGINES`, and end it with `endCard(s, t)`. Check it on `/qa?ids=<id>`.
