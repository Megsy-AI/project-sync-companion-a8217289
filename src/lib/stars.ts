import { supabase } from "@/integrations/supabase/client";

export type StarsProductId = "ai_pro" | "usdt_5" | "usdt_10" | "usdt_25" | "server";

export const STARS_BOT = "@Goaccbot";

/**
 * Stars per product, priced at the official Fragment rate of ~$0.015 per Star
 * (fragment.com/stars/buy: 1,000 Stars = $15). Keep in sync with
 * supabase/functions/_shared/stars.ts.
 */
export const STARS_PRICES: Record<Exclude<StarsProductId, "server">, number> = {
  ai_pro: 667,
  usdt_5: 334,
  usdt_10: 667,
  usdt_25: 1667,
};

/** 1 Gram ≈ $3.50, 1 Star ≈ $0.015 — keep in sync with supabase/functions/_shared/stars.ts. */
export const starsForTon = (priceTon: number) => Math.max(1, Math.round((priceTon * 3.5) / 0.015));

type TgWebApp = {
  openInvoice?: (url: string, cb: (status: string) => void) => void;
  openTelegramLink?: (url: string) => void;
};

const webApp = (): TgWebApp | undefined =>
  (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

/**
 * Creates a Telegram Stars invoice (issued by the stars bot @Goaccbot, so the
 * stars are credited to that bot) and opens it for the player.
 * Resolves with the final invoice status: "paid" | "cancelled" | "failed" | "pending".
 */
export async function payWithStars(
  product: StarsProductId,
  profileId: string | null,
  telegramId?: number | string | null,
  extra?: { serverId?: string },
): Promise<string> {
  if (!profileId) throw new Error("Profile not ready yet");

  const { data, error } = await supabase.functions.invoke("telegram-bot", {
    body: {
      action: "starsInvoice",
      product,
      profileId,
      telegramId: telegramId ? Number(telegramId) : null,
      ...extra,
    },
  });
  if (error) throw error;
  const url = (data as { url?: string; error?: string })?.url;
  if (!url) throw new Error((data as { error?: string })?.error ?? "Could not create invoice");


  const tg = webApp();
  if (tg?.openInvoice) {
    return await new Promise<string>((resolve) => tg.openInvoice!(url, resolve));
  }
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return "pending";
  }
  window.open(url, "_blank");
  return "pending";
}
