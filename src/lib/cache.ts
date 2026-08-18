/**
 * Lightweight localStorage cache with TTL + stale-while-revalidate.
 *
 * SECURITY MODEL
 * --------------
 * localStorage lives on the client, so it can NEVER be trusted as a source of
 * truth. This cache is display-only:
 *  1. Sensitive value fields (balances, points, rewards, prices, boosts...) are
 *     stripped before anything is written, so a tampered cache can't inflate
 *     what the user owns.
 *  2. Every entry is checksummed; hand-edited entries fail validation and are
 *     dropped instead of being rendered.
 *  3. Entries are scoped to the current player id, so a cache from another
 *     account is never reused.
 * Real balances, points and coins are always read from Supabase (RPC + RLS),
 * which is the only authority.
 */

const PREFIX = "nova:cache:";
const VERSION = "v3";

type Entry<T> = { v: string; t: number; s: string; c: string; d: T };

const now = () => Date.now();

/** Value fields that must never be restored from client storage. */
const SENSITIVE_KEYS = new Set([
  "balance",
  "ton_balance",
  "usdt_balance",
  "siri_balance",
  "gram_balance",
  "reward_balance",
  "reward_expires_at",
  "points",
  "coins",
  "gram",
  "usdt",
  "nova",
  "siri",
  "pending_yield",
  "amount",
  "payout",
  "fee",
  "is_admin",
  "is_banned",
  "role",
  "roles",
]);

const scope = () => {
  try {
    return String(JSON.parse(localStorage.getItem("nova:tg-user") || "{}")?.id ?? "anon");
  } catch {
    return "anon";
  }
};

/** Deterministic 32-bit checksum (FNV-1a) — detects tampered entries. */
const checksum = (input: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/** Recursively remove sensitive value fields before persisting. */
const sanitize = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map((v) => sanitize(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = sanitize(v);
    }
    return out as T;
  }
  return value;
};

export function readCache<T>(key: string, maxAgeMs = 5 * 60 * 1000): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (entry.v !== VERSION || entry.s !== scope()) return null;
    if (now() - entry.t > maxAgeMs) return null;
    const payload = JSON.stringify(entry.d);
    if (entry.c !== checksum(`${VERSION}|${entry.s}|${entry.t}|${key}|${payload}`)) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.d;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T) {
  const safe = sanitize(data);
  const t = now();
  const s = scope();
  const entry: Entry<T> = {
    v: VERSION,
    t,
    s,
    c: checksum(`${VERSION}|${s}|${t}|${key}|${JSON.stringify(safe)}`),
    d: safe,
  };
  const raw = JSON.stringify(entry);
  try {
    localStorage.setItem(PREFIX + key, raw);
  } catch {
    // quota exceeded -> drop the oldest entries and retry once
    pruneCache(0.5);
    try {
      localStorage.setItem(PREFIX + key, raw);
    } catch {
      /* ignore */
    }
  }
}

export function clearCache(prefix = "") {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX + prefix)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Remove a fraction of the oldest cache entries. */
export function pruneCache(fraction = 0.3) {
  try {
    const items: { k: string; t: number }[] = [];
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(PREFIX)) continue;
      try {
        items.push({ k, t: (JSON.parse(localStorage.getItem(k) as string) as Entry<unknown>).t ?? 0 });
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

/**
 * Stale-while-revalidate fetcher: returns cached (sanitized) data immediately
 * for instant page paint, then refreshes from the server and updates the cache.
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T, fromCache: boolean) => void,
  maxAgeMs = 5 * 60 * 1000,
): Promise<void> {
  const cached = readCache<T>(key, maxAgeMs);
  if (cached !== null) onData(cached, true);
  try {
    const fresh = await fetcher();
    writeCache(key, fresh);
    onData(fresh, false);
  } catch {
    /* keep cached value */
  }
}
