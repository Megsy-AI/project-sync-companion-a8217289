import { useEffect, useState } from "react";

/** Official artwork from the public TON collection, used as NFT/server images. */
const COLLECTION = "EQDFiSDU87TEvY67yqx0dTLQ-xHKbrR84dYfrYXWa5FWtMiu";
const ENDPOINT = `https://tonapi.io/v2/nfts/collections/${COLLECTION}/items?limit=200&offset=0`;
const CACHE_KEY = "nft-art-v3";
const TTL = 6 * 60 * 60 * 1000;

const readCache = (): string[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > TTL) return null;
    return parsed.images as string[];
  } catch {
    return null;
  }
};

/** Deterministic shuffle so every session sees a varied but stable spread. */
const spread = (rows: string[]) => {
  const out = [...rows];
  let seed = 20260818;
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Returns a stable list of NFT image URLs (empty while loading / offline). */
export const useNftArt = (): string[] => {
  const [images, setImages] = useState<string[]>(() => readCache() ?? []);

  useEffect(() => {
    if (images.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ENDPOINT);
        if (!res.ok) return;
        const json = await res.json();
        const rows: string[] = (json.nft_items ?? [])
          .map((n: any) => {
            const previews = (n.previews ?? []) as { resolution: string; url: string }[];
            return (
              previews.find((p) => p.resolution === "1500x1500")?.url ??
              previews.find((p) => p.resolution === "500x500")?.url ??
              previews[previews.length - 1]?.url ??
              (n.metadata?.image as string) ??
              ""
            );
          })
          .filter(Boolean);
        if (cancelled || !rows.length) return;
        const mixed = spread(rows);
        setImages(mixed);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), images: mixed }));
        } catch {
          /* ignore */
        }
      } catch {
        /* keep local artwork */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [images.length]);

  return images;
};
