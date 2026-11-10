/**
 * Cinematic templates (Viralot Car Templates pack v1, 2026-10-16).
 *
 * Each one is a recipe: the dealer's own car photo + a reusable empty
 * location plate go to Seedance 2.5 (reference-to-video) with the template's
 * shot list; the footage has no text, and the dealer's real offer is drawn on
 * top by the cinematic engine. Library cards play the pack's sample preview.
 * Seven are adapted from Higgsfield Katana presets (style reference only);
 * four are original concepts.
 */

export type OfferStyle = "card" | "slam" | "kinetic" | "pov";

export type Cinematic = {
  id: string;
  name: string;
  source: "katana" | "katana-adapted" | "original";
  nativeAspect: string;
  /** Length of the generated dealer video. */
  seconds: number;
  bestFor: string[];
  vibe: string;
  offerWindow: string;
  offerStyle: OfferStyle;
  /** How long the offer card holds at the end. */
  offerSeconds: number;
  credits720: number;
  credits1080: number;
  /** Rough USD at Higgsfield Plus (annual, monthly), 720p. */
  usd720: [number, number];
  /** Seedance prompt; {{VEHICLE_DESCRIPTION}} is filled per dealer car. */
  prompt: string;
};

export const CINEMATIC: Cinematic[] = [
 {
  "id": "luxury-car-beat-montage",
  "name": "Luxury Car Beat Montage",
  "source": "katana",
  "nativeAspect": "16:9",
  "seconds": 15,
  "bestFor": [
   "SUV / crossover launches",
   "lease specials",
   "luxury trims"
  ],
  "vibe": "Premium alpine road trip. ~25 beat cuts: drone aerials, low rear chase, split screens, wheel and light macros, cabin inserts, sunset flare finale.",
  "offerWindow": "last 4 s (offer fades in at 11.0 s over the sunset chase)",
  "offerStyle": "card",
  "offerSeconds": 4.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Premium luxury car commercial, fast beat-cut montage, 15 seconds. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the location: the alpine mountain road at golden hour with golden grass, grey rocks, white roadside posts and the low sun over the peaks.\n\nShot list, cutting on a steady beat about every 0.6 seconds: 1) drone aerial high above the hillside following the small vehicle climbing the winding road; 2) lower drone chase closing in through a bend; 3) low rear chase right behind the vehicle, taillights glowing, peaks ahead; 4) split screen of three vertical panels: rear chase, spinning alloy wheel close-up, golden hillside; 5) head-on, the vehicle drives toward camera with headlights on past the white posts; 6) aerial of the switchbacks; 7) fast side tracking shot past a dark rock wall with heavy motion blur; 8) front three-quarter at the rock wall in shade; 9) close-up of the digital gauge cluster and steering wheel badge inside the dark cabin; 10) driver's view through the windshield down the valley road; 11) rear three-quarter hero of the parked vehicle against dark pine trees; 12) macro of the body line and LED headlight; 13) wheel close-up spinning with autumn leaves kicking up; 14) very high aerial of the tiny vehicle on the road; 15) final low rear chase into the setting sun, strong lens flare over the peaks, hold for the last 2 seconds.\n\nCinematic film look, warm gold highlights, soft halation, smooth stabilized drone and chase camera, crisp cuts. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: modern cinematic beat with deep bass pulse, engine and wind whooshes on the cuts, no vocals."
 },
 {
  "id": "pink-protocol-car-edit",
  "name": "Pink Protocol Car Edit",
  "source": "katana",
  "nativeAspect": "9:16",
  "seconds": 15,
  "bestFor": [
   "bold paint colours",
   "trucks / full-size SUVs",
   "TikTok / Reels"
  ],
  "vibe": "Vertical black-and-white edit with ONE accent colour (the paint) left in. Airfield tarmac, low dutch angles, triple-stack panel inserts, HUD 'TARGET LOCKED' callouts, title card finale.",
  "offerWindow": "title card at the end (replace 'PINK PROTOCOL' with model name + payment)",
  "offerStyle": "card",
  "offerSeconds": 3.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Vertical 9:16 hype car edit, 15 seconds, black-and-white grade with selective colour: ONLY the vehicle's paint keeps its colour. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the location: airfield tarmac under dramatic clouds.\n\nShots, hard cuts on the beat: 1) tight tyre and wheel close-up rolling; 2) headlight macro as the LEDs switch on; 3) grille detail with thin technical line callouts; 4) taillight macro; 5) same body-line close-up repeated in three stacked horizontal panels; 6) ground-level dutch angle as the vehicle rushes past camera; 7) low hero front shot on the tarmac, jet in background, a thin square targeting frame tightening on the grille; 8) camera spins under the wheel arch looking up at the sky; 9) three-quarter drift with tyre smoke at a steep dutch angle; 10) symmetrical front hero, headlights flare; 11) stacked headlight panels; 12) final slow push-in on the front, fade to black for a title card. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: dark phonk beat with distorted 808 and cowbell, hits on the cuts."
 },
 {
  "id": "car-edit",
  "name": "Car Edit (Studio Black)",
  "source": "katana",
  "nativeAspect": "16:9",
  "seconds": 15,
  "bestFor": [
   "new model arrivals",
   "sports / sedans",
   "'just landed' posts"
  ],
  "vibe": "Black-void studio reveal: headlights glowing out of darkness, spinning wheel, rim-light sweeps along the body, glitch-type model name, speedometer insert, design-philosophy text cards.",
  "offerWindow": "black title beats (2 s) + final 3 s",
  "offerStyle": "card",
  "offerSeconds": 3.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Studio car reveal, 15 seconds, pure black void with glossy floor and thin rim lights. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the studio.\n\nShots: 1) headlights switch on out of total darkness, front of the vehicle barely lit; 2) black frame (title beat); 3) spinning wheel close-up, brake caliper visible; 4) taillight glows as a light sweep runs along the rear quarter; 5) side profile silhouette with flowing light trails behind; 6) speedometer needle sweeping up; 7) wheel close-up with chromatic RGB edge glitch; 8) slow rim-light sweep across the bonnet in silver; 9) rear three-quarter rolling out of shadow; 10) final: front fascia slowly lit, headlights flare, fade to black. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: deep cinematic hits and whooshes, sub-bass drops on the reveals."
 },
 {
  "id": "cyberpunk-scan-analysis",
  "name": "Cyberpunk Night Scan",
  "source": "katana-adapted",
  "nativeAspect": "16:9",
  "seconds": 15,
  "bestFor": [
   "EVs / tech features",
   "night events",
   "midnight madness sales"
  ],
  "vibe": "Neon night city on wet streets with a sci-fi HUD: scanner brackets, counters, labels on objects, 'AFTER HOURS' title. Adapt: the vehicle is the scanned subject.",
  "offerWindow": "HUD overlay throughout (labels = specs) + offer panel last 4 s",
  "offerStyle": "card",
  "offerSeconds": 4.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Night-time neon car showcase, 15 seconds, wet streets, magenta and cyan neon reflections, light rain, film grain. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the street.\n\nShots: 1) abstract neon light smear; 2) long low tracking shot down the street, the vehicle's headlights approaching; 3) vehicle parked under a neon sign, rain beading on paint; 4) tight macro of the headlight in the rain; 5) rolling past shop windows with neon reflections sliding over the body; 6) overhead shot of the vehicle on the glistening street; 7) wheel and puddle splash in slow motion; 8) driver's view of the neon road ahead through the windshield; 9) rear lights glowing red into the haze as the vehicle drives away; 10) final raindrop ripples in a neon puddle. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Leave clean negative space top-left and right for HUD overlays. Audio: dark synthwave pulse, rain ambience."
 },
 {
  "id": "futuristic-3d-motion-scan",
  "name": "Spec Scan (3D Motion Study)",
  "source": "katana-adapted",
  "nativeAspect": "16:9",
  "seconds": 15,
  "bestFor": [
   "feature / spec explainers",
   "trim comparisons",
   "new model year"
  ],
  "vibe": "'EXPERIMENTAL: MODEL 2025' technical-poster look: subject on black or white, thin leader-line callouts, particle/point-cloud scan, motion-study silhouettes, huge name type finale.",
  "offerWindow": "callout labels mid-video (real specs only) + big model name and payment in the last 3 s",
  "offerStyle": "card",
  "offerSeconds": 3.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Technical showcase, 15 seconds, alternating pure black and pure white studio backgrounds. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the studio.\n\nShots: 1) small side silhouette of the vehicle crossing a white frame; 2) hero front three-quarter on black, slowly rotating; 3) the vehicle dissolving into a glowing point-cloud scan, gold and white particles; 4) red-lit side profile racing across black with light streaks; 5) close-up of the wheel as particles re-form into the solid surface; 6) four quick silhouettes of the vehicle from different angles in a row; 7) overhead top-down rotation on black; 8) final front hero, particles settle, hold 2 seconds of clean black space below the vehicle. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: minimal techno pulse with glitch ticks."
 },
 {
  "id": "cinematic-film-look",
  "name": "Golden Hour Aura",
  "source": "katana-adapted",
  "nativeAspect": "16:9",
  "seconds": 15,
  "bestFor": [
   "trucks / off-road",
   "Utah red-rock & desert",
   "lifestyle / adventure"
  ],
  "vibe": "Shot straight into a low sun: lens flares, teal shadows vs gold highlights, vintage wide lens, grain, gate weave, slow-mo spray glowing in backlight, b/w freeze, fade into the sun.",
  "offerWindow": "b/w freeze beat (payment word) + final 3 s",
  "offerStyle": "card",
  "offerSeconds": 3.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Golden-hour aura edit, 15 seconds, shot straight into a low sun: strong backlight, lens flares, deep teal shadows against warm gold highlights, halation, vintage ultra-wide lens with soft corners, film grain. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the red-rock desert road.\n\nShots, cutting on a 125 BPM grid: 1) slow push-in on the headlights as they switch on, cut to black; 2) tyres slam through a dip and blast glowing dust at the lens, white flash; 3) fast cuts: hand on the shifter, wheel spinning, FPV dive over the road, rush past camera, high aerial; 4) the action slows to a black-and-white freeze; 5) colour returns as the vehicle crests a rise into the sun; 6) silhouette of the vehicle against the sun on a ridge; 7) quick b/w step-print inserts of details; 8) the vehicle drives away into the sun, the light blooms, fade to black. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: dark phonk-style track, cowbell melody, distorted 808, claps on the cuts."
 },
 {
  "id": "nocturne",
  "name": "Kinetic Offer Type (Nocturne)",
  "source": "katana-adapted",
  "nativeAspect": "16:9",
  "seconds": 15,
  "bestFor": [
   "OFFER-FIRST ads",
   "payment / APR callouts",
   "event countdowns"
  ],
  "vibe": "Huge condensed words masked into the footage (subject passes in front of the type), warm then red then b/w grade, editorial frame labels, minimal end title.",
  "offerWindow": "the whole video: words LEASE / $539 / A MONTH / 3.49% / APR / ENDS NOV 2 sit behind the car",
  "offerStyle": "kinetic",
  "offerSeconds": 3.0,
  "credits720": 105.12,
  "credits1080": 240.12,
  "usd720": [
   4.12,
   5.17
  ],
  "prompt": "Moody editorial car film, 15 seconds, slow deliberate camera moves with lots of clean background space for giant typography to sit behind the vehicle. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the showroom.\n\nShots: 1) slow dolly along the side of the vehicle in warm amber light; 2) static wide, the vehicle centred with empty wall behind; 3) close-up of the badge and grille; 4) the grade shifts to deep red, slow push on the headlight; 5) wide again, vehicle slightly off-centre with empty space; 6) black-and-white slow orbit; 7) final wide hold for 3 seconds. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: slow cinematic piano with a deep pulse."
 },
 {
  "id": "showroom-light-sweep",
  "name": "Showroom Light Sweep Reveal",
  "source": "original",
  "nativeAspect": "9:16",
  "seconds": 10,
  "bestFor": [
   "just-arrived inventory",
   "any vehicle",
   "loopable Reels"
  ],
  "vibe": "Dark showroom, a single bar of light sweeps across and reveals the car in sections, ends on a full hero. Satisfying, loopable, very 'new arrival'.",
  "offerWindow": "last 3 s, centred under the vehicle",
  "offerStyle": "card",
  "offerSeconds": 3.0,
  "credits720": 70.12,
  "credits1080": 160.12,
  "usd720": [
   2.75,
   3.45
  ],
  "prompt": "Vertical 9:16 reveal, 10 seconds. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the dark showroom. The vehicle sits in total darkness; a thin bright bar of light sweeps slowly from left to right across it, revealing the headlight, then the badge, then the wheel, then the side mirror in tight close-ups; on the final sweep the full vehicle lights up in a front three-quarter hero, reflections glide across the paint, camera does a slow 15-degree orbit and settles. Last frame matches the first for a seamless loop. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: rising synth swell into a bass hit on the full reveal."
 },
 {
  "id": "pov-test-drive",
  "name": "POV: Your Test Drive",
  "source": "original",
  "nativeAspect": "9:16",
  "seconds": 12,
  "bestFor": [
   "test-drive CTAs",
   "first-time buyers",
   "TikTok trends"
  ],
  "vibe": "First-person trend format: key fob in hand, door opens, push-start, pull out of the dealership onto a scenic road. Feels like the viewer is already driving it.",
  "offerWindow": "caption-style text at top throughout ('POV: you just leased the {{MODEL}}') + offer last 3 s",
  "offerStyle": "pov",
  "offerSeconds": 3.0,
  "credits720": 84.12,
  "credits1080": 192.12,
  "usd720": [
   3.29,
   4.14
  ],
  "prompt": "Vertical 9:16 first-person POV, 12 seconds, handheld natural feel. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the dealership lot and road. 1) POV: a hand holds the key fob up toward the vehicle, the lights flash; 2) the hand opens the driver's door, the interior is revealed; 3) close-up of a thumb pressing the start button, the gauge cluster lights up; 4) POV through the windshield pulling off the lot onto the open road; 5) quick cut to an outside tracking shot of the vehicle cruising the scenic road; 6) back to POV, sun flare through the windshield. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Only hands visible, no faces. Audio: upbeat trending-style pop beat, door chime and engine start SFX."
 },
 {
  "id": "rain-night-drive",
  "name": "Rain Night Drive (Slow-Mo)",
  "source": "original",
  "nativeAspect": "9:16",
  "seconds": 12,
  "bestFor": [
   "safety / AWD features",
   "fall & winter promos",
   "ASMR-style posts"
  ],
  "vibe": "Moody ASMR car content: rain on paint in slow motion, wipers, headlights through mist, red taillights on a wet road. Huge on car TikTok.",
  "offerWindow": "last 3 s",
  "offerStyle": "card",
  "offerSeconds": 3.0,
  "credits720": 84.12,
  "credits1080": 192.12,
  "usd720": [
   3.29,
   4.14
  ],
  "prompt": "Moody slow-motion rain film, 12 seconds, 9:16. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the wet night road. 1) extreme macro of raindrops landing and beading on the paint; 2) headlights switch on and cut through the mist; 3) wiper sweeping across the windshield from inside, blurred lights beyond; 4) low tracking shot alongside, tyre throwing a slow-motion spray; 5) rear view, red taillights reflecting on the wet road as the vehicle disappears into mist. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Audio: rain ambience, soft low synth, wiper thump."
 },
 {
  "id": "price-drop-countdown",
  "name": "Price Drop Countdown",
  "source": "original",
  "nativeAspect": "9:16",
  "seconds": 10,
  "bestFor": [
   "month-end pushes",
   "expiring offers",
   "retargeting"
  ],
  "vibe": "Fast beat-cut hype reel where the offer IS the hook: numbers slam on screen on each hit (36 MONTHS \u2192 $4,632 DUE \u2192 $539/MO), car shots between them, deadline ticker at the end.",
  "offerWindow": "the whole video (numbers slam on every hit) + full disclaimer last 2 s",
  "offerStyle": "slam",
  "offerSeconds": 2.0,
  "credits720": 70.12,
  "credits1080": 160.12,
  "usd720": [
   2.75,
   3.45
  ],
  "prompt": "Vertical 9:16 hype reel, 10 seconds, punchy cuts every 0.5 seconds with brief solid-colour flash frames between shots for text slams. the first reference image owns the vehicle: {{VEHICLE_DESCRIPTION}}. the second reference image owns the dealership lot. Shots: whip-pan onto the front three-quarter; headlight macro; wheel spin; low side tracking; rear three-quarter; interior wheel badge; top-down drone over the vehicle; final front hero pushing in. No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot. Leave the centre third of each flash frame empty. Audio: high-energy trap beat with hard hits."
 }
];

/**
 * "Create your own": no template shot list or location plate. The dealer's
 * prompt and reference images (places, backgrounds, moods) drive the footage;
 * the car photo and the offer layer work exactly like the templates.
 */
export const CUSTOM_ID = "custom-prompt";
export const CUSTOM: Cinematic = {
  id: CUSTOM_ID,
  name: "Your own prompt",
  source: "original",
  nativeAspect: "9:16",
  seconds: 10,
  bestFor: ["any car", "your idea"],
  vibe: "Your own scene: describe the place, mood and shots, and add reference images.",
  offerWindow: "offer card over the final seconds",
  offerStyle: "card",
  offerSeconds: 3,
  credits720: 70,
  credits1080: 0,
  usd720: [2.75, 3.45],
  prompt: "",
};

export const cinematicById = (id: string) => (id === CUSTOM_ID ? CUSTOM : CINEMATIC.find((c) => c.id === id));

export const previewOf = (id: string) => `/templates/${id}/preview.mp4`;
export const plateOf = (id: string) => `/templates/${id}/plate.jpg`;
export const posterOf = (id: string) => `/templates/${id}/poster.jpg`;
/** Length of the bundled sample previews. */
export const PREVIEW_SECONDS = 8.06;

/** Rough Higgsfield cost of one 720p render, e.g. "$4–5". */
export const costLabel = (c: Cinematic) => {
  const [lo, hi] = c.usd720.map((n) => Math.round(n));
  return lo === hi ? `$${lo}` : `$${lo}–${hi}`;
};

/** How the dealer's offer appears on their version. */
export const OFFER_STYLE_LABEL: Record<OfferStyle, string> = {
  card: "an offer card over the final seconds",
  slam: "each number slammed on screen, then the offer card",
  kinetic: "huge drifting offer type, then the offer card",
  pov: "a POV caption up top, then the offer card",
};

/**
 * Render quality for a cinematic video, priced from Higgsfield's published API
 * rates (2026-10-17): Seedance 2.5 bills per second ($0.4622/s at 720p,
 * $1.1372/s at 1080p); Seedance 2.0 bills video tokens = seconds × w × h × 24 /
 * 1024 at $0.014 per 1,000 (≈ $0.1345/s at 480p, $0.3024/s at 720p).
 * Image references are free, and generated audio is included.
 */
export type TierId = "draft" | "good" | "standard" | "max";
export type Tier = { id: TierId; label: string; blurb: string; endpoint: string; resolution: "480p" | "720p" | "1080p"; bitrate?: "standard" | "high"; usdPerSec: number; maxSeconds: number };
const tokenRate = (w: number, h: number) => ((w * h * 24) / 1024 / 1000) * 0.014;
export const TIERS: Tier[] = [
  { id: "draft", label: "Draft", blurb: "Seedance 2.0 · 480p — quick, for trying ideas", endpoint: "bytedance/seedance-2.0/reference-to-video", resolution: "480p", usdPerSec: tokenRate(854, 480), maxSeconds: 15 },
  { id: "good", label: "Good", blurb: "Seedance 2.0 · 720p — sharp on phones", endpoint: "bytedance/seedance-2.0/reference-to-video", resolution: "720p", usdPerSec: tokenRate(1280, 720), maxSeconds: 15 },
  { id: "standard", label: "Standard", blurb: "Seedance 2.5 · 720p — the pack's look", endpoint: "bytedance/seedance-2.5/reference-to-video", resolution: "720p", bitrate: "standard", usdPerSec: 0.4622, maxSeconds: 30 },
  { id: "max", label: "Max", blurb: "Seedance 2.5 · 1080p, high bitrate — sharpest", endpoint: "bytedance/seedance-2.5/reference-to-video", resolution: "1080p", bitrate: "high", usdPerSec: 1.1372, maxSeconds: 30 },
];
export const tierById = (id?: string) => TIERS.find((t) => t.id === id) ?? TIERS[2];

/** What one render of this template costs on a tier, in USD. */
export const priceUsd = (c: Cinematic, t: Tier) => t.usdPerSec * Math.min(c.seconds, t.maxSeconds);

/** Guardrails every custom prompt keeps, so the dealer's offer layer and car stay correct. */
const GUARDRAILS =
  "No on-screen text, captions, logos or watermarks; no people unless stated. Keep the vehicle's exact shape, trim and paint from the first reference image in every shot.";

/** Free text from the dealer, tidied: no newlines spam, no prompt-breaking length. */
export const cleanDirection = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 700);

/**
 * The prompt for one render. "add" keeps the template's shot list and layers the
 * dealer's direction on top; "own" replaces the shot list with theirs while
 * keeping the car and location references and the guardrails.
 */
export function buildCinematicPrompt(c: Cinematic, vehicle: string, direction?: string, mode: "add" | "own" = "add") {
  const car = vehicle ? `the ${vehicle} shown in the photo` : "the vehicle shown in the photo";
  const d = direction ? cleanDirection(direction) : "";
  if (d && mode === "own") {
    return `Vertical 9:16 car video, ${c.seconds} seconds. The first reference image owns the vehicle: ${car}. The second reference image owns the location. ${d}\n\n${GUARDRAILS} Audio: cinematic music and sound design that fit the scene, no vocals.`;
  }
  const base = c.prompt.replaceAll("{{VEHICLE_DESCRIPTION}}", car);
  return d ? `${base}\n\nDirector's notes from the dealer (follow them, within the rules above): ${d}` : base;
}

/** The prompt for a "Create your own" render: the dealer's words, with the car and reference images explained. */
export function buildCustomPrompt(vehicle: string, direction: string, seconds: number, refs: number) {
  const car = vehicle ? `the ${vehicle} shown in the photo` : "the vehicle shown in the photo";
  const d = cleanDirection(direction);
  const references = refs
    ? ` The other ${refs === 1 ? "reference image shows" : `${refs} reference images show`} the place, background or look to use: match ${refs === 1 ? "it" : "them"} closely, but never copy any text, logos, people or other vehicles from ${refs === 1 ? "it" : "them"}.`
    : "";
  return `Vertical 9:16 car video, ${seconds} seconds. The first reference image owns the vehicle: ${car}.${references} ${d}\n\n${GUARDRAILS} Audio: cinematic music and sound design that fit the scene, no vocals.`;
}
