/**
 * Image cache: stores small images as data URLs in localStorage so repeat
 * visits render instantly with zero network requests, and refreshes them
 * periodically in the background.
 */

const KEY = "nova:img:";
const MAX_BYTES = 220 * 1024; // never cache images bigger than this
const TTL = 7 * 24 * 3600 * 1000;

type Entry = { t: number; d: string };

export function getCachedImage(url: string): string | null {
  try {
    const raw = localStorage.getItem(KEY + url);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (Date.now() - e.t > TTL) {
      localStorage.removeItem(KEY + url);
      return null;
    }
    return e.d;
  } catch {
    return null;
  }
}

export async function cacheImage(url: string): Promise<string | null> {
  if (!url || url.startsWith("data:")) return null;
  const existing = getCachedImage(url);
  if (existing) return existing;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size > MAX_BYTES) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    try {
      localStorage.setItem(KEY + url, JSON.stringify({ t: Date.now(), d: dataUrl } as Entry));
    } catch {
      pruneImages(0.5);
    }
    return dataUrl;
  } catch {
    return null;
  }
}

export function pruneImages(fraction = 0.3) {
  try {
    const items: { k: string; t: number }[] = [];
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(KEY)) continue;
      try {
        items.push({ k, t: (JSON.parse(localStorage.getItem(k) as string) as Entry).t ?? 0 });
      } catch {
        localStorage.removeItem(k);
      }
    }
    items.sort((a, b) => a.t - b.t);
    for (const it of items.slice(0, Math.ceil(items.length * fraction))) localStorage.removeItem(it.k);
  } catch {
    /* ignore */
  }
}

/** Warm the cache for a list of URLs when the browser is idle. */
export function warmImages(urls: string[]) {
  const run = () => urls.forEach((u) => void cacheImage(u));
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(run);
  else setTimeout(run, 1200);
}
