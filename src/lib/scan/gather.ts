/**
 * Runs inside the page (serialised into page.evaluate): what Claude needs to
 * read the site — logo candidates with positions, big promo/banner images
 * (where dealers bake their offers), and the specials page link.
 */
export function gatherForClaude() {
  const abs = (u: string) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return "";
    }
  };
  const PROMO = "[class*='slide'],[class*='carousel'],[class*='hero'],[class*='banner'],[class*='special'],[class*='offer'],[class*='promo'],[class*='swiper']";
  const imgs = Array.from(document.images);
  const logos: { src: string; alt: string; hint: string; x: number; y: number; w: number; h: number }[] = [];
  for (const im of imgs) {
    const r = im.getBoundingClientRect();
    const src = im.currentSrc || im.src;
    if (!src || r.width < 30 || r.height < 12) continue;
    const y = r.top + window.scrollY;
    const hint = [
      String(im.className || ""),
      im.id,
      String(im.parentElement?.className || ""),
      im.closest("a")?.getAttribute("href") ?? "",
      im.closest("header, nav, [class*='header']") ? "in-header" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (y < 260 || /logo/i.test(hint + " " + im.alt + " " + src)) logos.push({ src: abs(src), alt: im.alt || "", hint, x: r.left, y, w: r.width, h: r.height });
  }
  const seen = new Set<string>();
  const banners: string[] = [];
  const add = (u: string) => {
    const a = abs(u);
    if (!a || seen.has(a) || /\.svg(\?|$)|logo|icon|sprite/i.test(a)) return;
    seen.add(a);
    banners.push(a);
  };
  for (const im of imgs) {
    const src = im.currentSrc || im.src;
    if (!src || im.naturalWidth < 700 || im.naturalHeight < 180) continue;
    if (im.closest(PROMO) || im.naturalWidth >= 1100) add(src);
  }
  for (const el of Array.from(document.querySelectorAll(PROMO)).slice(0, 80)) {
    const m = getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/);
    if (m) add(m[1]);
  }
  const special = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
    (a) => a.href.startsWith(location.origin) && /special|offer|incentive|deal/i.test(a.getAttribute("href") ?? "") && !/finance|apply|trade|service|parts/i.test(a.getAttribute("href") ?? "")
  );
  return { logos: logos.slice(0, 14), banners: banners.slice(0, 10), specials: special?.href ?? null };
}
