import { useEffect, useState } from "react";

/** Open-source market data (CoinGecko public API) for the coins we display. */
export type CoinId = "the-open-network" | "tether" | "dogs-2" | "notcoin";

export interface CoinMarket {
  price: number;
  image: string;
  change24h: number;
}

const IDS: CoinId[] = ["the-open-network", "tether", "dogs-2", "notcoin"];
const ENDPOINT = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${IDS.join(",")}`;
const CACHE_KEY = "coin-markets-v1";
const TTL = 5 * 60 * 1000;

const FALLBACK: Record<CoinId, CoinMarket> = {
  "the-open-network": { price: 0, image: "/images/gram-icon.png", change24h: 0 },
  tether: { price: 1, image: "/images/usdt.png", change24h: 0 },
  "dogs-2": { price: 0, image: "https://coin-images.coingecko.com/coins/images/39042/large/dogs.jpeg", change24h: 0 },
  notcoin: { price: 0, image: "https://coin-images.coingecko.com/coins/images/33453/large/logo.png", change24h: 0 },
};

const readCache = (): Record<string, CoinMarket> | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.at > TTL) return null;
    return parsed.data as Record<string, CoinMarket>;
  } catch {
    return null;
  }
};

/** Live USD prices + official icons, cached for 5 minutes. */
export const useCoinPrices = () => {
  const [markets, setMarkets] = useState<Record<string, CoinMarket>>(() => readCache() ?? FALLBACK);

  useEffect(() => {
    if (readCache()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ENDPOINT);
        if (!res.ok) return;
        const rows = (await res.json()) as { id: string; current_price: number; image: string; price_change_percentage_24h: number }[];
        const next: Record<string, CoinMarket> = { ...FALLBACK };
        for (const row of rows) {
          next[row.id] = {
            price: Number(row.current_price ?? 0),
            image: row.image,
            change24h: Number(row.price_change_percentage_24h ?? 0),
          };
        }
        if (cancelled) return;
        setMarkets(next);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: next }));
        } catch {
          /* storage full — ignore */
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return markets;
};

export const formatUsd = (value: number) =>
  value >= 1
    ? `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
