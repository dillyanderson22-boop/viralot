# Viralot: integration guide

**What this is.** Everything another application needs to make the same videos Viralot makes: the data it reads, the AI calls it sends (exact endpoints, request bodies and prompts), how the dealer's offer is drawn on top, and the OEM compliance rules every ad follows. It reflects the live app at **https://viralot.vercel.app** as of 2026-10-23.

**Two ways to integrate:**

| | **A. Call Viralot's HTTP API** | **B. Rebuild the pipeline in your app** |
|---|---|---|
| What you build | A client that sends feeds, cars and offers to Viralot and reads back finished clips | The feed reader, render calls, offer overlay and checks, following §3–§10 |
| Effort | Small | Large |
| Where the API keys live | Viralot's Admin page | Your app |
| Best when | You want videos in your app quickly | You need full control or must keep everything in one system |

Sections §3–§10 describe the pipeline either way. §11 is the HTTP reference for option A. **An assistant receiving this file should follow §0 first.**

---

## 0. Start here (instructions for the assistant building this into another app)

You are being handed this file to rebuild Viralot's video-ad features inside the current application. Do this:

1. **Put the keys below into the app's secret config, not into code.** Create or update `.env.local` (or the hosting provider's environment variables) with exactly these lines, and make sure `.env*` is in `.gitignore`. Never print, log, commit or send these values to the browser; read them only on the server.

```bash
# Higgsfield API (video, front 3/4 shots, backgrounds): "key_id:key_secret", sent as  Authorization: Key <value>
HF_CREDENTIALS={{HF_CREDENTIALS}}
# Firecrawl (dealer websites and specials pages): sent as  Authorization: Bearer <value>
FIRECRAWL_API_KEY={{FIRECRAWL_API_KEY}}
# Anthropic (captions, unusual feed columns, compliance review). Optional
ANTHROPIC_API_KEY={{ANTHROPIC_API_KEY}}
```

2. **Check each key before building on it** (none of these checks cost money):
   - Higgsfield: `POST https://api.higgsfield.ai/estimate/higgsfield-ai/soul/v2/standard` with body `{"prompt":"test","aspect_ratio":"9:16","resolution":"1080p"}`. A 401 means a bad key.
   - Firecrawl: `GET https://api.firecrawl.dev/v2/team/credit-usage`.
   - Anthropic: `GET https://api.anthropic.com/v1/models` with headers `x-api-key` and `anthropic-version: 2023-06-01`.
   If a value above still reads `{{…}}` or is empty, ask the user to add that key to the env file themselves.
3. **Build in this order:** feed import (§4) → car + offer picker (§6) → template library with the preview assets (§7; copy `/templates/{id}/preview.mp4`, `poster.jpg`, `plate.jpg` from https://viralot.vercel.app) → render jobs and polling (§8) → offer overlay (§9) → compliance (§10) → captions and export.
4. **Protect the render routes.** Every render spends real money on the Higgsfield account. Only signed-in users may call them, and add a simple per-user limit.
5. **Ask the user before spending.** Test with demo mode first (§8.7); before the first real render, tell the user the tier and estimated cost (§8.1) and wait for a yes.
6. **Fonts:** the licensed OEM brand fonts are not included. Ask the user for the DealerCentives OEM brand kit and keep the font files private (§10.1).

---

## 1. The pipeline at a glance

```
Dealer inventory feed (CSV / XML / JSON)  ──►  §4 Feed reader  ──►  cars, each with photos, description, and every offer
Dealer website (optional)                 ──►  §5 Specials scan (Firecrawl) ─┘
                                                     │
                     §6 Pick a car + tick its offers (one, some or all)  ──►  ad inputs
                                                     │
          ┌──────────────────────────────────────────┼───────────────────────────────────────────┐
          ▼                                          ▼                                           ▼
 §7 Cinematic template (11)              §7 "Create your own" (prompt + ref images)       Offer spots (canvas only)
          │                                          │                                           │
          └────────────► §8 Higgsfield render: car photo + location plate / references ──► text-free footage
                                                     │
                     §9 Offer overlay drawn on top (never baked into the footage)
                                                     │
                     §10 Compliance: OEM fonts, casing, full disclosures, expiry, checks
                                                     │
                     Export 1080×1920 (+ 4:5, 1:1, 16:9) · captions per platform (§10.6)
```

**The core idea:** the AI only ever films the car. It never writes prices or text. The dealer's real offer, fine print, dealer name and logo are drawn on top by code from the feed's own numbers, so nothing is invented and everything stays compliant.

---

## 2. Accounts and keys

| Service | Used for | Key format | Notes |
|---|---|---|---|
| **Higgsfield API** (`https://api.higgsfield.ai`) | Filming the car, front 3/4 car shots, backgrounds | `Authorization: Key {key_id}:{key_secret}` | Billed in USD on the API account, separate from Higgsfield subscription credits. Results are kept about 7 days, so copy them to your own storage (§8.6). |
| **Firecrawl** (`https://api.firecrawl.dev/v2`) | Reading dealer sites and specials pages | `Authorization: Bearer {key}` | About 25–30 credits for a full specials scan (§5). |
| **Anthropic Claude** | Captions, unusual feed columns, full compliance review | Workspace-scoped API key | Optional. Everything else works without it. |
| **Private file storage** (Viralot uses Vercel Blob, private) | Finished clips, uploaded reference images | — | Higgsfield must receive **public** image URLs, so Viralot uploads privately and passes 1-hour signed links. |

**Security:**
- **Viralot's API is open by default.** Unless an access code is switched on in Admin, anyone who knows the URL can call the render endpoints, and each render spends Higgsfield money.
- **Before connecting another app, turn the access code on** (Admin → Access) and send that cookie with each request, or put the calls behind your own server.

---

## 3. Data model

These are TypeScript shapes; the field names are what Viralot stores and returns.

```ts
/** One deal on a car, as the feed or specials page states it. */
type SpecialOffer = {
  kind: "lease" | "finance" | "cash" | "discount" | "msrp" | "price" | "trade" | "bonus" | "other";
  label: string;        // "Lease", "Finance", "Customer Cash", "Military Bonus", "MSRP"…
  value: string;        // "$349/mo", "2.99% APR", "$2,250", "$33,070" (the feed's own numbers, formatted)
  detail?: string;      // "36 months · $4,199 due at signing · 10,000 miles/year"
  disclaimer?: string;  // THIS offer's fine print, verbatim (never shortened)
  expires?: string;     // as written, e.g. "November 2, 2026" or "11/02/2026"
};

/** A car from the dealer's inventory feed. */
type InventoryCar = {
  id: string;                 // VIN, else stock #, else `${url}#${slug(title)}` (offer feeds have no VIN)
  title: string;              // "New 2027 Honda CR-V LX 2WD" (use the feed's finished name)
  year?: number; make?: string; model?: string; trim?: string; color?: string;
  price?: number; msrp?: number; mileage?: number; stock?: string; vin?: string;
  image?: string;             // best photo (see §4.3)
  images?: string[];          // every usable photo, best first (fallbacks)
  description?: string;
  offers?: SpecialOffer[];    // every offer on this car, deals first, MSRP/price last
  disclaimer?: string;        // car-level fine print when the feed has one
  expires?: string;
  condition: "new" | "used" | "cpo";
  url: string;
};

/** A car on the dealer's specials pages (website scan, §5). */
type Special = { id: string; vehicle: string; image?: string; page?: string; expires?: string; disclaimer?: string; stock?: string; vin?: string; offers: SpecialOffer[] };

/** What one ad is made from. */
type AdInputs = {
  offer: string;              // headline built from the ticked offers (§6)
  offerSub: string;           // "Ends November 2, 2026 · Stock #9430 · New"
  cta: string;                // "Shop now"
  vehicleName: string;        // the car's full name
  vehicleImage: string;       // the photo used (car reference for the AI and the spot layouts)
  vehicleImages?: string[];   // backups if the main photo won't load
  offers?: SpecialOffer[];    // the ticked offers
  vin?: string; stock?: string; description?: string;
  direction?: string;         // optional text prompt
  promptMode?: "add" | "own"; // add notes to a template, or replace its shots
  seconds?: number;           // "Create your own" length (5/10/15)
  refIds?: string[];          // "Create your own" reference images kept in private storage
  cinematic?: Record<string, string>; // template id → URL of the finished, text-free footage
  angled?: boolean;           // photo is already a front 3/4 studio shot
};
```

---

## 4. Reading the inventory feed

Viralot takes a feed **link** or an uploaded **file** in CSV, TSV, XML or JSON format. Column names do not need to match exactly: every field is found by a ranked list of names (normalised to lowercase letters and digits only).

### 4.1 Car fields (first match wins)

| Field | Names tried, in order |
|---|---|
| title | `vehiclename`, `title`, `name`, `vehicletitle`, `descriptiontitle`, `titleraw` (else year make model trim) |
| year · make · model · trim | `year`/`modelyear` · `make`/`brand` · `model` · `trim`/`series`/`style` |
| price | `saleprice`/`specialprice`/`finalprice` first, then `price`, `internetprice`, `sellingprice`, `ourprice`, `listprice`… |
| msrp | `msrp`, `sticker`, `stickerprice`, `originalprice` |
| vin · stock | `vin` (must be 17 valid characters) · `stock`, `stocknumber`, `stockno`… |
| url | `vdpurl`, `url`, `link`, `vehicleurl`, `detailurl`… |
| color · description | `exteriorcolor`, `extcolor`, `color`… · `description`, `comments`, `sellernotes`… (HTML stripped) |
| condition | `condition`, `newused`, `type`… (cert/cpo → cpo; used/pre → used; else new) |

If the title or price can't be found, Claude maps the columns from the header row and 5 sample rows. That's the only use of Claude in this step.

### 4.2 Offer fields

Each family is tried in order. Empty, `none`, `null`, `n/a` and **zero** values are skipped. Never invent a value.

| Offer | Value from | Detail from |
|---|---|---|
| **Lease** → `"$349/mo"` | `leasepayment`, `leasemonthly`, `monthlylease`, `leaseamount`, `leasepmt`, `lease`, `leaseprice` | term `leaseterm`, `leasetermmonths`, `termmonths`… · due `dueatsigningtotal`, `dueatsigning`, `leasetotaldueatsigning`, `das`, `leasedownpayment`… · miles `leasemileageallowance`, `mileagelimit`… |
| **Finance** → `"2.99% APR"` | `financerate`, `financeaprformatted`, `aprformatted`, `financeapr`, `apr`, `specialapr`, `interestrate`, `upstreamapr` (**must be a number**: some feeds put the word "APR" in `finance_apr`) | term `financetermmonthsnumeric`, `financeterm`, `financetermmonths`… |
| **Payment** | `financepayment`, `monthlypayment`, `loanpayment` | — |
| **Cash** | `cashamount`, `cashback`, `customercash`, `rebate`, `bonuscash`, `factorycash`… | label `cashlabel`, `cashheadline`, `cashsubtype` (leading amount stripped) |
| Trade-in · Bonus · Discount | any other money column whose name contains `tradein` · `bonus/loyalty/conquest/military/college/graduate/firstresponder` · `discount/savings/dealercash` | — |
| Nested lists | JSON arrays or XML blocks named `*offer*`, `*incentive*`, `*special*`, `*program*`, `*rebate*`, `*lease*`, `*finance*` | each item's `amount/value/payment/rate`, `term/months`, `disclaimer`, `expires` |
| MSRP / Price | `msrp`, price | adds "Below MSRP $X" only when MSRP > price |

**Skip columns that are labels or settings:** names containing `formatted`, `label`, `title`, `headline`, `detail`, `disclaimer`, `fee`, `deposit`, `residual`, `total`, `percent`, `min`, `max`, `hero`, `gradient`, `color`, `background`, `badge`, `logo`. Only plain amounts count ("$1,500" or "1500"), never sentences or CSS.

**Per-offer fine print:** `leasedisclaimer` / `financedisclaimer` / `cashdisclaimer` for that offer, else the general one (`prominentdisclosure`, `combineddisclaimer`, `disclaimerraw`, `disclaimer`…). The end date comes from `offerexpireslong`, `expirationdate`, `expires`, `validthrough`…

### 4.3 Photos

1. The feed's own photo fields come first, in this order: `photolink`, `imageoemstock`, `vehiclefront`, `imagelibrary`, `photolinkoriginal`, `image`, `imageurl`…
2. Every other link anywhere in the record (including nested JSON or XML) is then scored by its **file path only**, not query settings like `background=transparent`:
   - **+5** for stock "jelly bean" libraries (`/chrome/`, `chromedata`, `evox`, `izmo`, `jelly`, `carshot`, `oem`, `stock`)
   - **+3** for `.png`
   - **+1** for `front`, `1280`, `large`, `hero`
   - **excluded:** logo, badge, background, backdrop, icon, banner, placeholder
   - **−4 (last resort):** manufacturer sites that block servers (`automobiles.honda.com`, `toyota.com`, `ford.com`…)
3. **Commas inside a link are part of it.** Image CDNs put resize options in the path (`…/cdn-cgi/image/width=1400,height=900,…/x.png`). Only a comma, `|` or space that starts another `http` link separates two photos.
4. A car with no photo borrows one from another row of the **same model**.
5. Keep several photos per car and fall back to the next one when one fails to load.

### 4.4 Grouping and cleanup

- **Offer feeds list one row per offer** (lease row, finance row, cash row for the same car). Group rows by VIN, else stock number, else title plus first photo, and merge their offers. An offer is a duplicate when it has the same kind and the same digits.
- **Expired offers are removed** (§10.4).
- Deals are listed first, MSRP and price last.

**Dealercentives example** (`core.dealercentives.com/…/feeds/{dealer}/all.json`, data under `data[]`): `vehicle_name` → title, `photo_link` / `image_oem_stock` → Chrome jelly-bean PNG, `lease_payment` + `lease_term` + `due_at_signing` + `mileage_limit`, `finance_rate` + `finance_term`, `cash_amount` + `cash_label`, `lease_disclaimer` / `finance_disclaimer` / `cash_disclaimer`, `expiration_date`. A real feed of 19 rows gives 18 cars, all with photos and offers.

Template for dealers: `https://viralot.vercel.app/viralot-feed-template.csv`.

---

## 5. Reading a dealer's specials pages (optional)

Use this when there's no feed. It takes about 1–2 minutes and roughly 25–30 Firecrawl credits.

1. **Find the pages:** take the homepage links (Firecrawl scrape) plus a site map (`POST https://api.firecrawl.dev/v2/map` with `{"url": origin, "search": "specials offers incentives lease finance deals", "limit": 100}`).
2. **Score each same-site link** by its path and title, and keep the top 5 with a score of 4 or more:
   - **+5** for `special`
   - **+4** for `offer|incentive|rebate|deal|promotion|savings|clearance|event`
   - **+2** for `lease|finance|apr`
   - **+1** for `new`
   - **never:** `service|parts|coupon|collision|career|blog|review|staff|apply|schedule`, or a single vehicle's page (a VIN in the path)
3. **Extract offers from each page** with Firecrawl's JSON format (`POST /v2/scrape` with `formats: [{type: "json", schema, prompt}]`, `waitFor: 2500`):

```text
This is a car dealership specials page. For EVERY vehicle with a special on it, list that vehicle once with ALL of its separate offers: lease payment, finance/APR, customer cash or rebates, dealer discounts, MSRP, sale or internet price, trade-in bonus, and any loyalty, conquest, military, college or first-responder bonus. Copy every number, term, date and the fine print exactly as written; leave a field empty when it isn't shown and never guess. Skip service, parts and accessory coupons, and skip ordinary inventory listings that aren't presented as a special.
```

```json
{
  type: "object",
  properties: {
    specials: {
      type: "array",
      description: "One entry per vehicle that has a special",
      items: {
        type: "object",
        properties: {
          vehicle: { type: "string", description: "Year make model trim, e.g. '2026 Honda CR-V LX FWD'" },
          imageUrl: { type: "string", description: "URL of this vehicle's photo on the page" },
          stockNumber: { type: "string" },
          vin: { type: "string" },
          expires: { type: "string", description: "Offer end date as written" },
          disclaimer: { type: "string", description: "This vehicle's fine print, verbatim" },
          offers: {
            type: "array",
            description: "EVERY separate offer on this vehicle",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["lease", "finance", "cash", "discount", "msrp", "price", "trade", "bonus", "other"] },
                label: { type: "string", description: "Short name as shown, e.g. 'Lease', 'APR', 'Customer Cash', 'Dealer Discount', 'MSRP', 'Sale Price', 'Trade-In Bonus', 'Military Bonus'" },
                amount: { type: "string", description: "The headline number exactly as written, e.g. '$299/mo', '2.99% APR', '$1,500', '$32,450'" },
                details: { type: "string", description: "Terms exactly as written, e.g. '36 months · $4,771 due at signing'" },
              },
              required: ["type", "label", "amount"],
            },
          },
        },
        required: ["vehicle", "offers"],
      },
    },
  },
  required: ["specials"],
}
```

4. **Merge cars across pages:** match on the lower-cased name with "new" removed, then dedupe offers. Matching values in the same family are one offer: "Finance 1.99% APR" equals "APR 1.99%", and Sale price equals Price.
5. **Drop expired specials** (§10.4).

The extractor occasionally pairs a number with the wrong car. Always show the dealer the source page link for each car.

---

## 6. Picking the car and its offers → ad inputs

- **Search** by full VIN, the last 5 or more VIN characters, stock number (exact or partial), or name words ("crv ex" finds "CR-V EX").
- **Selecting a car ticks its deals** (everything except plain MSRP and price). The dealer can untick, tick **All**, or tick **Deals only**.
- **Headline** from the ticked offers, first offer leading:
  - lease → "Lease a {short model} for {value}"
  - finance → "{value} on the {model}"
  - price/MSRP → "{model} · {label} {value}"
  - other → "{value} {label} on the {model}"
  - then the rest joined with " · ", e.g. "Lease a Ridgeline RTL for $419/mo · $2,250 Customer Cash".
- **Spot fields:**
  - the first offer's value split into a big number and a unit ("$419" + "/mo")
  - supporting line = the first offer's detail, plus the other offers' "{label} {value}"
  - fine print = **the distinct disclaimers of only the ticked offers**, joined in order
- **`offerSub`:** "Ends {date} · Stock #{n} · New".
- **Car photo:** the car's best photo with backups. Stock jelly-bean shots count as already front 3/4 (`angled: true`).

---

## 7. Templates

### 7.1 The 11 cinematic templates (+ Create your own)

| id | Name | Source | Length | Offer style | Offer hold | Best for |
|---|---|---|---|---|---|---|
| `luxury-car-beat-montage` | Luxury Car Beat Montage | katana | 15s | card | last 4s | SUV / crossover launches, lease specials, luxury trims |
| `pink-protocol-car-edit` | Pink Protocol Car Edit | katana | 15s | card | last 3s | bold paint colours, trucks / full-size SUVs, TikTok / Reels |
| `car-edit` | Car Edit (Studio Black) | katana | 15s | card | last 3s | new model arrivals, sports / sedans, 'just landed' posts |
| `cyberpunk-scan-analysis` | Cyberpunk Night Scan | katana-adapted | 15s | card | last 4s | EVs / tech features, night events, midnight madness sales |
| `futuristic-3d-motion-scan` | Spec Scan (3D Motion Study) | katana-adapted | 15s | card | last 3s | feature / spec explainers, trim comparisons, new model year |
| `cinematic-film-look` | Golden Hour Aura | katana-adapted | 15s | card | last 3s | trucks / off-road, Utah red-rock & desert, lifestyle / adventure |
| `nocturne` | Kinetic Offer Type (Nocturne) | katana-adapted | 15s | kinetic | last 3s | OFFER-FIRST ads, payment / APR callouts, event countdowns |
| `showroom-light-sweep` | Showroom Light Sweep Reveal | original | 10s | card | last 3s | just-arrived inventory, any vehicle, loopable Reels |
| `pov-test-drive` | POV: Your Test Drive | original | 12s | pov | last 3s | test-drive CTAs, first-time buyers, TikTok trends |
| `rain-night-drive` | Rain Night Drive (Slow-Mo) | original | 12s | card | last 3s | safety / AWD features, fall & winter promos, ASMR-style posts |
| `price-drop-countdown` | Price Drop Countdown | original | 10s | slam | last 2s | month-end pushes, expiring offers, retargeting |
| `custom-prompt` | Your own prompt (Create your own) | original | 5/10/15s (dealer picks) | card | last 3s | any car, the dealer’s own idea |

**Assets per template** (public): `/templates/{id}/preview.mp4` (8.06 s sample with sound, ending in a labelled **SAMPLE OFFER** card, for library cards only), `/templates/{id}/poster.jpg`, and `/templates/{id}/plate.jpg` (an empty 9:16 location plate with no text, people or other cars, sent to the AI as the location reference).

Full template prompts are in **Appendix A**. `{{VEHICLE_DESCRIPTION}}` becomes "the {vehicle name} shown in the photo".

### 7.2 Text prompts

| Mode | What the AI receives |
|---|---|
| Template only | The template prompt |
| **Add to template** | The template prompt + `\n\nDirector's notes from the dealer (follow them, within the rules above): {notes}` |
| **Write your own** (template) | "Vertical 9:16 car video, {n} seconds. The first reference image owns the vehicle: {car}. The second reference image owns the location. {prompt}" + guardrails + "Audio: cinematic music and sound design that fit the scene, no vocals." |
| **Create your own** (no template; up to 4 reference images) | Same, but "The other {k} reference images show the place, background or look to use: match them closely, but never copy any text, logos, people or other vehicles from them." No location plate is sent. |

**Guardrails added to every own prompt:**

```text
No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot.
```

The dealer's text is collapsed to single spaces and capped at 700 characters. "Write your own" needs at least 10 characters.

**Example ("Create your own", 2 reference images):**

```text
Vertical 9:16 car video, 10 seconds. The first reference image owns the vehicle: the 2026 Honda CR-V EX-L AWD shown in the photo. The other 2 reference images show the place, background or look to use: match them closely, but never copy any text, logos, people or other vehicles from them. Coastal highway at golden hour, drone shots, slow push-in on the grille.

No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: cinematic music and sound design that fit the scene, no vocals.
```

---

## 8. AI rendering (Higgsfield)

All requests go to `POST https://api.higgsfield.ai/{endpoint}` with headers `Authorization: Key {id}:{secret}` and `content-type: application/json`. The response is `{"request_id": "…"}`. Poll with `GET https://api.higgsfield.ai/requests/{request_id}/status` until `status` is `completed` (the result is in `video.url` or `images[0].url`), `failed`, `nsfw` or `canceled`. Failed and NSFW jobs are not charged. Higgsfield allows only about 8 concurrent jobs, so Viralot films two at a time.

**Image inputs must be public URLs.** Viralot uploads to private storage and sends 1-hour signed links.

### 8.1 Filming the car (cinematic templates and Create your own)

```json
{
  "image_urls": ["{car photo}", "{template plate}  ← or up to 4 reference images for Create your own"],
  "prompt": "{see §7.2}",
  "duration": 15,
  "resolution": "720p",
  "aspect_ratio": "9:16",
  "generate_audio": true,
  "bitrate_mode": "standard"
}
```

- **`bitrate_mode`:** Seedance 2.5 only. Leave it out for Seedance 2.0.
- **`duration`:** the template length (Create your own: 5, 10 or 15), capped at the tier's maximum.
- **Strict schema:** the endpoints reject unknown fields.
- **Car photo:** Viralot converts it to a JPEG on white, no larger than 1280 px.

**Quality tiers and cost** (from Higgsfield's published API rates):
- **Seedance 2.5** bills per second.
- **Seedance 2.0** bills by video tokens = seconds × width × height × 24 / 1024, at $0.014 per 1,000.
- Image references are free and audio is included.

| Tier | Endpoint | Resolution | Bitrate | USD / second | Max length |
|---|---|---|---|---|---|
| Draft (`draft`) | `bytedance/seedance-2.0/reference-to-video` | 480p | — | $0.1345 | 15s |
| Good (`good`) | `bytedance/seedance-2.0/reference-to-video` | 720p | — | $0.3024 | 15s |
| Standard (`standard`) | `bytedance/seedance-2.5/reference-to-video` | 720p | standard | $0.4622 | 30s |
| Max (`max`) | `bytedance/seedance-2.5/reference-to-video` | 1080p | high | $1.1372 | 30s |

For example, a 15 s render costs about $2.02 at Draft, $4.54 at Good, $6.93 at Standard and $17.06 at Max. Viralot defaults to **Good**. The app currently hides prices from users.

### 8.2 Front 3/4 car shot

This turns a side-view photo into a front three-quarter studio shot. It's used for offer spots, only when Generate is clicked, once per car and then cached. Skip it when the photo is already angled (jelly-bean libraries, or file names containing `angular`, `three-quarter`, `front-3-4`…).

`POST marketing-studio/image/flare` (GPT Image 2.5 Flare, about 7¢; fallbacks are `xai/grok-imagine-image-2.0`, then `alibaba/qwen-image-3/edit`):

```json
{ "prompt": "Show this exact same vehicle, keeping its model, generation, body style, trim, wheels, paint colour, lights and badges identical, from a front three-quarter view: the front of the vehicle faces the camera and points toward the left side of the frame at about 35 degrees, camera at headlight height. The whole vehicle is in frame with a small margin, centred. Pure white seamless studio background, soft even studio light, only a faint contact shadow under the tyres, no reflections, no floor line. Photoreal automotive press photo. No text, no logos added, no people, no other vehicles.", "image_urls": ["{car photo}"], "resolution": "1k", "aspect_ratio": "3:2", "quality": "medium" }
```

### 8.3 Rolling clip (offer spots, optional)

`POST bytedance/seedance-2.0/image-to-video` (or `kling-video/v3.0/std/image-to-video`): `{ "image_url": "{first frame with the car placed in the scene}", "prompt": CLIP_PROMPT [+ " Dealer's direction: …"], "duration": 8, "resolution": "720p", "generate_audio": false }`

```text
Cinematic car commercial, tracking shot. The camera moves smoothly alongside the car as it drives forward down the road at a steady speed; the car stays in the same place in frame, wheels turning, the background and road scrolling past with natural motion blur. Keep the car's exact shape, colour and badges. Photoreal, stable, no text, no logos added, no people.
```

### 8.4 Generated background (offer spots, optional)

`POST higgsfield-ai/soul/v2/standard`: `{ "prompt": scenePrompt(place), "aspect_ratio": "9:16", "resolution": "1080p" }`

```text
Vertical 9:16 photograph for a car commercial. Location: {PLACE}. An empty road seen from eye level (camera about 1.2 m high) looking straight down the middle of the road, which runs away from the camera to a vanishing point in the centre of the frame. The horizon sits just below the middle of the frame; the road surface fills the bottom 40% of the image, clean and unobstructed. No vehicles, no people, no text, no signs with words, no logos. Photoreal, natural light, sharp, high dynamic range, commercial photography.
```

### 8.5 Free key check

Send the same body to `POST https://api.higgsfield.ai/estimate/{endpoint}`. It returns a 401 for bad credentials and doesn't charge. For video endpoints the estimate returns a pricing description, not a number.

### 8.6 Storage

When a job completes, download `video.url` or `images[0].url` right away and store it in your own private storage. Higgsfield deletes outputs after about 7 days. Viralot serves its copies through short-lived signed links (`/api/clips/file?id=…`).

### 8.7 Demo mode

Viralot's `VIRALOT_HF_MOCK=1` (never in production) fakes jobs: each finishes after a few seconds and returns the template's sample clip. It's useful for testing the integration without spending money.

---

## 9. The offer overlay (drawn by code on top of the footage)

- **Canvas:** 1080×1920 at 30 fps, exported as MP4 (WebM where the browser can't record MP4). Other sizes re-frame the vertical master: 4:5 1080×1350, 1:1 1080×1080, 16:9 1920×1080.
- **Audio:** the footage's own soundtrack (cinematic templates generate audio). Spots get a synthesized beat.

**On cinematic footage**, the offer appears for the template's last `offerSeconds`:
- **card** (default): a dark gradient rises behind the bottom half, then vehicle name, offer label, big number + unit, supporting line, dealer name + city, and the full fine print. The dealer logo pill sits top-right.
- **slam:** each offer value slams on screen in turn before the card.
- **kinetic:** huge offer words drift across the frame before the card.
- **pov:** a TikTok-style caption at the top ("POV: you just leased the {car}"), then the card.
- **Several ticked offers:** a 1- or 2-column grid of label / value / terms instead of one big number, then the dealer line and fine print.
- **Fade:** the last 0.25 s fades to black.
- **Sample previews:** when no footage exists yet, show the template sample with nothing drawn on it. It already labels itself "SAMPLE OFFER".

**Offer spots:** five layouts (diagonal headline, price hero, sales event, vehicle spotlight, clean showroom). They place the car photo in a real or generated scene, set the big number, supporting line, CTA, dealer line and fine print, and can use a rolling clip as the background.

---

## 10. Compliance (DealerCentives OEM brand kit)

This is built in automatically for every make the kit covers, detected from the dealer's makes and the feed's `make` field.

### 10.1 Fonts

- **The make's own licensed face, Regular 400 and Bold 700 only.** Text heavier than 700 uses the real Bold, never a faked one. The only fallbacks allowed are Arial and Helvetica.
- **Files:** the kit's `fonts/<Make>/web/*.woff2`.
- **Use the true Bold originals** where the kit flags a mislabelled file:
  - Chevrolet: `desktop/ChevySans-Bold.otf` (the web "bold" file is Condensed Bold)
  - Toyota: `desktop/ToyotaType-Bold.otf`
  - Honda: `desktop/Avenir Next Rounded*.ttf`
- **Figure face** for Acura (Futura Cond ExtraBold Oblique), Genesis (Genesis Sans Head), Hyundai (Hyundai Sans Head) and VW (VW Head).
- **CDJR and Subaru** use Helvetica.

**Licensing is OPEN** in the kit (only Toyota Type is confirmed). Never publish the font files. Serve them only to your own renderer, as Viralot does via its access-checked `/api/brand-font`. Burning the text into video frames is what the kit says is normally fine.

### 10.2 Casing

- **Never uppercase text for style.** "Honda" and "Kia" are never in all capitals.
- **Display text is title case.** These words stay lowercase after the first word: a an and as at but by for from in nor of on or per the to via vs with.
- **Some words stay uppercase:** two-letter codes in shouted text (LX, SE…, but not everyday words like up/is/it), plus the kit's list (APR, AWD, MSRP, VIN, SUV, RTL, TRD, GMC, BMW, LYRIQ, NISMO…). Words containing a digit or `&` stay as written ("$349/mo", "F-150").
- **Apply the manufacturer spelling table last,** as whole words: CR-V, HR-V, EX-L, TrailSport, RAV4, 4Runner, bZ4X, i-FORCE MAX, Mazda3, CX-5, IONIQ 5, ID. Buzz, 4MATIC®…
- **Use the feed's finished vehicle name.** It already follows the drivetrain-in-name rules.

For example, "LEASE A NEW 2026 HONDA RIDGELINE RTL" becomes "Lease a New 2026 Honda Ridgeline RTL", and "TUNDRA I-FORCE MAX" becomes "Tundra i-FORCE MAX".

### 10.3 Disclosures

- **Verbatim and complete:** never truncated, re-cased, abbreviated or reordered. The layout grows to fit them.
- **Viralot's fitting:** fine print starts at 24 px (on the 1080-wide frame) and shrinks by 1 px until every line fits. Below 13 px it stops shrinking and grows upward instead.
- **One claim, one disclosure:** only the disclaimers of the offers shown.
- **Never hidden** behind an end card or "see details". It stays on screen to the end.
- **"Vehicle shown may differ"** appears whenever the car is a stock render or AI footage: 20 px white on `rgba(0,0,0,.55)`, bottom-right.

### 10.4 Expiry

An offer is valid through 23:59:59 dealer-local time on its end date. With the time zone unknown, use the latest US zone (Hawaii, UTC−10), so `expired = now > end date + 24 h + 10 h`. Expired offers are removed from feeds, specials and pickers. An expiry date is never made up.

### 10.5 Brand guidelines and checks

- **Format:** guidelines live in a markdown file with one `## Brand` section per make, `## General` for all makes, and `Also covers: Acura` for aliases.
- **Key lines:** `Heading font:`, `Body font:`, `Headline case:`, `Required disclaimer:`, `Minimum fine print size:`.
- **Lists under `###` headings:** Banned words, Required phrases, Trademarks, Rules. Wrap a banned word in backticks for exact case: `` `HONDA` `` fails "HONDA" but passes "Honda".
- **Default rules:** the built-in file converts the full kit (12 hard rules, lease/APR/cash/fee/eligibility/expiry rules, and 20 per-brand quick sheets). An uploaded file replaces it.

**Instant checks on every ad:**
- banned words in the on-screen text or captions
- required phrases
- brand disclaimer present
- trademark marks
- fine print present
- offer not expired
- headline casing

**Full review (Claude):** the ad text and captions plus the matching guideline sections. It returns `{"verdict": "pass" | "fix", "issues": [{"rule", "problem", "fix"}]}`.

### 10.6 Captions

Claude writes captions per platform (TikTok, Reels, Shorts, Facebook, X). It gets the template, dealer, makes, the offer to state exactly ("never invent other prices or terms"), the CTA, the vehicle, and the feed description as "use only these facts". It returns `{"captions": {"tiktok": {"text", "hashtags": []}, …}}`.

---

## 11. Viralot HTTP API (option A)

**Base URL:** `https://viralot.vercel.app`. **Auth:** if the access code is on, every route needs the access cookie; admin routes need the admin session.

| Method & path | Body / params | Returns |
|---|---|---|
| `POST /api/inventory/import` | JSON `{url, site?}` (feed link) or multipart `file` (≤ 8 MB; CSV, TSV, XML, JSON) | `{cars: InventoryCar[], mappedBy: "auto" or "claude"}`. Photo URLs come back proxied as `/api/img?u=…` |
| `POST /api/specials` | `{url}` (dealer site) | `{specials: Special[], pages: string[]}` |
| `POST /api/scan` | `{url}` | Streamed NDJSON progress, then the brand kit (logo, colors, makes, vehicles, offers, specials) |
| `GET /api/cinematic` | — | `{available, demo}` (whether a Higgsfield key is set) |
| `POST /api/cinematic` | multipart: `cid` (template id or `custom-prompt`), `tier` (`draft`, `good`, `standard`, `max`), `vehicle`, `car` (image ≤ 2.5 MB), `plate` (templates; ≤ 1.8 MB), optional `direction` + `mode` (`add` or `own`). Create your own adds `seconds` (5–15), up to 4 `ref` images (≤ 2.5 MB each), or `refIds` to reuse earlier ones | `{requestId, refIds}` |
| `GET /api/cinematic?id={requestId}` | — | `{status: "queued", "in_progress", "completed" or "failed", url?, error?}`. `url` is a stable `/api/clips/file?id=…` link to the stored MP4 |
| `POST /api/front` · `GET /api/front?id=` | multipart `photo` | `{requestId}` · status as above (image) |
| `POST /api/clips` · `GET /api/clips?id=` | multipart `frame` (JPEG), `model` (`seedance` or `kling`), `direction?` | rolling clip job |
| `POST /api/scenes` · `GET /api/scenes?id=` | `{place}` | generated background job |
| `GET /api/guidelines?makes=Honda,Acura` | — | `{rules: BrandRules[]}`: the guideline sections that apply |
| `POST /api/compliance` | `{makes, headline, offer, finePrint, captions[], vehicle}` | Claude review (§10.5) |
| `POST /api/captions` | `{template:{name,category,why,hook}, brand:{name,city,state,makes}, offer, cta, vehicle?, description?}` | `{captions}` |
| `GET /api/img?u={url}` | — | Same-origin image proxy (needed so canvas exports aren't blocked) |
| `GET /api/brand-font?f={Make}/{file}` | — | A licensed OEM font, for the renderer only |
| Public files | `/templates/{id}/preview.mp4`, `poster.jpg`, `plate.jpg` · `/viralot-feed-template.csv` · `/viralot-brand-guidelines-template.md` | |

**A typical option-A flow:**
1. `POST /api/inventory/import` with the dealer's feed link.
2. Pick a car and its offers in your UI.
3. `POST /api/cinematic` with the car photo, template id and tier.
4. Poll `GET /api/cinematic?id=` every 8 s until it finishes.
5. Draw the offer overlay (§9–§10) over the returned clip in your renderer, or show the ad in Viralot.

---

## 12. Open items

- **Disclosure timing in video.** The kit has no minimum on-screen time or rendered size for a disclosure in video. Viralot keeps it on screen to the end. Confirm the rule with DealerCentives compliance.
- **Not built from the kit yet:**
  - exact per-brand layouts, colors, CTA colors and spacing
  - per-brand string sets ("Lease For", "Finance At"…)
  - Honda numeral kerning
  - the California total-price rule and the Texas "Selling Price" wording
  - rebuilding disclaimers to the kit's standard short forms (Viralot shows the feed's disclaimer verbatim instead)
- **Feed accuracy.** Feeds without VINs produce model-level ads. Per the kit, model-wide ads must not show a VIN or stock number.
- **Specials scan.** Firecrawl's AI can attach the wrong car to a number. Prefer the feed.

---

## Appendix A. Template prompts (verbatim)

### `luxury-car-beat-montage` — Luxury Car Beat Montage

Length 15s · offer card, last 4s · vibe: Premium alpine road trip. ~25 beat cuts: drone aerials, low rear chase, split screens, wheel and light macros, cabin inserts, sunset flare finale.

```text
Premium luxury car commercial, fast beat-cut montage, 15 seconds. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the location: the alpine mountain road at golden hour with golden grass, grey rocks, white roadside posts and the low sun over the peaks.

Shot list, cutting on a steady beat about every 0.6 seconds: 1) drone aerial high above the hillside following the small vehicle climbing the winding road; 2) lower drone chase closing in through a bend; 3) low rear chase right behind the vehicle, taillights glowing, peaks ahead; 4) split screen of three vertical panels: rear chase, spinning alloy wheel close-up, golden hillside; 5) head-on, the vehicle drives toward camera with headlights on past the white posts; 6) aerial of the switchbacks; 7) fast side tracking shot past a dark rock wall with heavy motion blur; 8) front three-quarter at the rock wall in shade; 9) close-up of the digital gauge cluster and steering wheel badge inside the dark cabin; 10) driver's view through the windshield down the valley road; 11) rear three-quarter hero of the parked vehicle against dark pine trees; 12) macro of the body line and LED headlight; 13) wheel close-up spinning with autumn leaves kicking up; 14) very high aerial of the tiny vehicle on the road; 15) final low rear chase into the setting sun, strong lens flare over the peaks, hold for the last 2 seconds.

Cinematic film look, warm gold highlights, soft halation, smooth stabilized drone and chase camera, crisp cuts. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: modern cinematic beat with deep bass pulse, engine and wind whooshes on the cuts, no vocals.
```

### `pink-protocol-car-edit` — Pink Protocol Car Edit

Length 15s · offer card, last 3s · vibe: Vertical black-and-white edit with ONE accent colour (the paint) left in. Airfield tarmac, low dutch angles, triple-stack panel inserts, HUD 'TARGET LOCKED' callouts, title card finale.

```text
Vertical 9:16 hype car edit, 15 seconds, black-and-white grade with selective colour: ONLY the vehicle's paint keeps its colour. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the location: airfield tarmac under dramatic clouds.

Shots, hard cuts on the beat: 1) tight tyre and wheel close-up rolling; 2) headlight macro as the LEDs switch on; 3) grille detail with thin technical line callouts; 4) taillight macro; 5) same body-line close-up repeated in three stacked horizontal panels; 6) ground-level dutch angle as the vehicle rushes past camera; 7) low hero front shot on the tarmac, jet in background, a thin square targeting frame tightening on the grille; 8) camera spins under the wheel arch looking up at the sky; 9) three-quarter drift with tyre smoke at a steep dutch angle; 10) symmetrical front hero, headlights flare; 11) stacked headlight panels; 12) final slow push-in on the front, fade to black for a title card. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: dark phonk beat with distorted 808 and cowbell, hits on the cuts.
```

### `car-edit` — Car Edit (Studio Black)

Length 15s · offer card, last 3s · vibe: Black-void studio reveal: headlights glowing out of darkness, spinning wheel, rim-light sweeps along the body, glitch-type model name, speedometer insert, design-philosophy text cards.

```text
Studio car reveal, 15 seconds, pure black void with glossy floor and thin rim lights. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the studio.

Shots: 1) headlights switch on out of total darkness, front of the vehicle barely lit; 2) black frame (title beat); 3) spinning wheel close-up, brake caliper visible; 4) taillight glows as a light sweep runs along the rear quarter; 5) side profile silhouette with flowing light trails behind; 6) speedometer needle sweeping up; 7) wheel close-up with chromatic RGB edge glitch; 8) slow rim-light sweep across the bonnet in silver; 9) rear three-quarter rolling out of shadow; 10) final: front fascia slowly lit, headlights flare, fade to black. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: deep cinematic hits and whooshes, sub-bass drops on the reveals.
```

### `cyberpunk-scan-analysis` — Cyberpunk Night Scan

Length 15s · offer card, last 4s · vibe: Neon night city on wet streets with a sci-fi HUD: scanner brackets, counters, labels on objects, 'AFTER HOURS' title. Adapt: the vehicle is the scanned subject.

```text
Night-time neon car showcase, 15 seconds, wet streets, magenta and cyan neon reflections, light rain, film grain. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the street.

Shots: 1) abstract neon light smear; 2) long low tracking shot down the street, the vehicle's headlights approaching; 3) vehicle parked under a neon sign, rain beading on paint; 4) tight macro of the headlight in the rain; 5) rolling past shop windows with neon reflections sliding over the body; 6) overhead shot of the vehicle on the glistening street; 7) wheel and puddle splash in slow motion; 8) driver's view of the neon road ahead through the windshield; 9) rear lights glowing red into the haze as the vehicle drives away; 10) final raindrop ripples in a neon puddle. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Leave clean negative space top-left and right for HUD overlays. Audio: dark synthwave pulse, rain ambience.
```

### `futuristic-3d-motion-scan` — Spec Scan (3D Motion Study)

Length 15s · offer card, last 3s · vibe: 'EXPERIMENTAL: MODEL 2025' technical-poster look: subject on black or white, thin leader-line callouts, particle/point-cloud scan, motion-study silhouettes, huge name type finale.

```text
Technical showcase, 15 seconds, alternating pure black and pure white studio backgrounds. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the studio.

Shots: 1) small side silhouette of the vehicle crossing a white frame; 2) hero front three-quarter on black, slowly rotating; 3) the vehicle dissolving into a glowing point-cloud scan, gold and white particles; 4) red-lit side profile racing across black with light streaks; 5) close-up of the wheel as particles re-form into the solid surface; 6) four quick silhouettes of the vehicle from different angles in a row; 7) overhead top-down rotation on black; 8) final front hero, particles settle, hold 2 seconds of clean black space below the vehicle. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: minimal techno pulse with glitch ticks.
```

### `cinematic-film-look` — Golden Hour Aura

Length 15s · offer card, last 3s · vibe: Shot straight into a low sun: lens flares, teal shadows vs gold highlights, vintage wide lens, grain, gate weave, slow-mo spray glowing in backlight, b/w freeze, fade into the sun.

```text
Golden-hour aura edit, 15 seconds, shot straight into a low sun: strong backlight, lens flares, deep teal shadows against warm gold highlights, halation, vintage ultra-wide lens with soft corners, film grain. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the red-rock desert road.

Shots, cutting on a 125 BPM grid: 1) slow push-in on the headlights as they switch on, cut to black; 2) tyres slam through a dip and blast glowing dust at the lens, white flash; 3) fast cuts: hand on the shifter, wheel spinning, FPV dive over the road, rush past camera, high aerial; 4) the action slows to a black-and-white freeze; 5) colour returns as the vehicle crests a rise into the sun; 6) silhouette of the vehicle against the sun on a ridge; 7) quick b/w step-print inserts of details; 8) the vehicle drives away into the sun, the light blooms, fade to black. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: dark phonk-style track, cowbell melody, distorted 808, claps on the cuts.
```

### `nocturne` — Kinetic Offer Type (Nocturne)

Length 15s · offer kinetic, last 3s · vibe: Huge condensed words masked into the footage (subject passes in front of the type), warm then red then b/w grade, editorial frame labels, minimal end title.

```text
Moody editorial car film, 15 seconds, slow deliberate camera moves with lots of clean background space for giant typography to sit behind the vehicle. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the showroom.

Shots: 1) slow dolly along the side of the vehicle in warm amber light; 2) static wide, the vehicle centred with empty wall behind; 3) close-up of the badge and grille; 4) the grade shifts to deep red, slow push on the headlight; 5) wide again, vehicle slightly off-centre with empty space; 6) black-and-white slow orbit; 7) final wide hold for 3 seconds. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: slow cinematic piano with a deep pulse.
```

### `showroom-light-sweep` — Showroom Light Sweep Reveal

Length 10s · offer card, last 3s · vibe: Dark showroom, a single bar of light sweeps across and reveals the car in sections, ends on a full hero. Satisfying, loopable, very 'new arrival'.

```text
Vertical 9:16 reveal, 10 seconds. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the dark showroom. The vehicle sits in total darkness; a thin bright bar of light sweeps slowly from left to right across it, revealing the headlight, then the badge, then the wheel, then the side mirror in tight close-ups; on the final sweep the full vehicle lights up in a front three-quarter hero, reflections glide across the paint, camera does a slow 15-degree orbit and settles. Last frame matches the first for a seamless loop. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: rising synth swell into a bass hit on the full reveal.
```

### `pov-test-drive` — POV: Your Test Drive

Length 12s · offer pov, last 3s · vibe: First-person trend format: key fob in hand, door opens, push-start, pull out of the dealership onto a scenic road. Feels like the viewer is already driving it.

```text
Vertical 9:16 first-person POV, 12 seconds, handheld natural feel. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the dealership lot and road. 1) POV: a hand holds the key fob up toward the vehicle, the lights flash; 2) the hand opens the driver's door, the interior is revealed; 3) close-up of a thumb pressing the start button, the gauge cluster lights up; 4) POV through the windshield pulling off the lot onto the open road; 5) quick cut to an outside tracking shot of the vehicle cruising the scenic road; 6) back to POV, sun flare through the windshield. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Only hands visible, no faces. Audio: upbeat trending-style pop beat, door chime and engine start SFX.
```

### `rain-night-drive` — Rain Night Drive (Slow-Mo)

Length 12s · offer card, last 3s · vibe: Moody ASMR car content: rain on paint in slow motion, wipers, headlights through mist, red taillights on a wet road. Huge on car TikTok.

```text
Moody slow-motion rain film, 12 seconds, 9:16. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the wet night road. 1) extreme macro of raindrops landing and beading on the paint; 2) headlights switch on and cut through the mist; 3) wiper sweeping across the windshield from inside, blurred lights beyond; 4) low tracking shot alongside, tyre throwing a slow-motion spray; 5) rear view, red taillights reflecting on the wet road as the vehicle disappears into mist. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: rain ambience, soft low synth, wiper thump.
```

### `price-drop-countdown` — Price Drop Countdown

Length 10s · offer slam, last 2s · vibe: Fast beat-cut hype reel where the offer IS the hook: numbers slam on screen on each hit (36 MONTHS → $4,632 DUE → $539/MO), car shots between them, deadline ticker at the end.

```text
Vertical 9:16 hype reel, 10 seconds, punchy cuts every 0.5 seconds with brief solid-colour flash frames between shots for text slams. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the dealership lot. Shots: whip-pan onto the front three-quarter; headlight macro; wheel spin; low side tracking; rear three-quarter; interior wheel badge; top-down drone over the vehicle; final front hero pushing in. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Leave the centre third of each flash frame empty. Audio: high-energy trap beat with hard hits.
```

## Appendix B. Where things live in the Viralot code

| Topic | File |
|---|---|
| Feed reader (fields, offers, photos, grouping) | `src/lib/server/feed.ts` |
| Specials scan (Firecrawl map + JSON extraction) | `src/lib/server/firecrawl.ts` |
| Car + offers → ad inputs, headline, spot fields, photo fallbacks | `src/lib/specials.ts` |
| Templates, tiers, prompt builders | `src/lib/cinematic.ts` |
| Higgsfield calls, storage, demo mode | `src/lib/server/clips.ts`, `src/app/api/{cinematic,front,clips,scenes}/route.ts` |
| Start or poll filming from the browser | `src/lib/ad/film.ts` |
| Offer overlay | `src/lib/ad/engines-cinematic.ts`, `src/lib/ad/engines-spot.ts`, `src/lib/ad/draw.ts`, `src/lib/ad/runtime.ts` |
| OEM fonts, casing, expiry | `src/lib/oem.ts`, `src/brand-kit/fonts/` (licensed, not in git) |
| Guidelines parser + checks | `src/lib/guidelines.ts`, built-in rules `src/brand-kit/oem-guidelines.md` |
