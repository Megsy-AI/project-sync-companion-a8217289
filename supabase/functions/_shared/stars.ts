export const STARS_BOT_TOKEN = Deno.env.get("STARS_BOT_TOKEN") ?? "";
export const STARS_BOT_USERNAME = "Goaccbot";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type StarsProduct = {
  id: string;
  title: string;
  description: string;
  stars: number;
  usdt: number;
  aiPro?: boolean;
};

/**
 * Pricing follows the official Fragment rate of ~$0.015 per Star
 * (fragment.com/stars/buy: 1,000 Stars = $15).
 */
export const STARS_PRODUCTS: Record<string, StarsProduct> = {
  ai_pro: {
    id: "ai_pro",
    title: "Nova AI Pro — 30 days",
    description: "Unlimited chat, images and videos for 30 days.",
    stars: 667,
    usdt: 0,
    aiPro: true,
  },
  usdt_5: { id: "usdt_5", title: "5 USDT top-up", description: "Add 5 USDT to your in-game balance.", stars: 334, usdt: 5 },
  usdt_10: { id: "usdt_10", title: "10 USDT top-up", description: "Add 10 USDT to your in-game balance.", stars: 667, usdt: 10 },
  usdt_25: { id: "usdt_25", title: "25 USDT top-up", description: "Add 25 USDT to your in-game balance.", stars: 1667, usdt: 25 },
};

export async function starsApi(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${STARS_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    throw new Error(`[${res.status}] ${JSON.stringify(body)}`);
  }
  return body.result;
}

/** Reference rate used across the app: 1 Gram (TON) ≈ $3.50. */
export const GRAM_USD = 3.5;
/** Official Fragment rate: 1,000 Stars = $15 → $0.015 per Star. */
export const USD_PER_STAR = 0.015;

/** Stars needed to buy a server priced in Gram. */
export function starsForTon(priceTon: number) {
  return Math.max(1, Math.round((priceTon * GRAM_USD) / USD_PER_STAR));
}
