import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";

export interface PaymentDiscount {
  total_spent_ton: number;
  payments: number;
  tier: "none" | "bronze" | "silver" | "gold" | "diamond";
  tier_label: string;
  discount_pct: number;
  first_purchase: boolean;
  next_tier_pct: number | null;
  next_tier_ton: number | null;
  remaining_to_next_ton: number | null;
  ai_bonus_pct: number;
  ai_headline: string;
  ai_message: string;
  ai_cta: string;
  ai_expires_at: string | null;
}

const EMPTY: PaymentDiscount = {
  total_spent_ton: 0,
  payments: 0,
  tier: "none",
  tier_label: "Newcomer",
  discount_pct: 0,
  first_purchase: false,
  next_tier_pct: null,
  next_tier_ton: null,
  remaining_to_next_ton: null,
  ai_bonus_pct: 0,
  ai_headline: "",
  ai_message: "",
  ai_cta: "",
  ai_expires_at: null,
};

/** Price after the player's active discount, rounded to 3 decimals. */
export const applyDiscount = (price: number, pct: number) =>
  pct > 0 ? Math.max(0.001, Math.round(price * (1 - pct / 100) * 1000) / 1000) : price;

export const usePaymentDiscount = () => {
  const { user } = useApp();
  const telegramId = user.telegramUser.id;
  const [discount, setDiscount] = useState<PaymentDiscount>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);

  const refresh = useCallback(async () => {
    if (!telegramId) return;
    try {
      const { data, error } = await (supabase as any).rpc("get_payment_discount_for_telegram", {
        _telegram_id: telegramId,
      });
      if (!error && data) setDiscount({ ...EMPTY, ...(data as PaymentDiscount) });
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false);
    }
  }, [telegramId]);

  /**
   * Asks the AI strategist for a personalised 24h offer, then re-reads the
   * discount so the stacked bonus is reflected everywhere. The AI bonus is
   * always recomputed and capped server-side.
   */
  const requestSmartOffer = useCallback(
    async (surface: "servers" | "shop" | "ai" | "general" = "general"): Promise<boolean> => {
      if (!telegramId) return false;
      setThinking(true);
      try {
        const { error } = await supabase.functions.invoke("ai-smart-offer", {
          body: { telegram_id: telegramId, surface },
        });
        // Fallback: generate the offer directly in the backend when the AI
        // service is unreachable, so the button always delivers an offer.
        if (error) {
          await (supabase as any).rpc("create_smart_offer_for_telegram", {
            _telegram_id: telegramId,
            _surface: surface,
          });
        }
        await refresh();
        return true;
      } catch {
        try {
          await (supabase as any).rpc("create_smart_offer_for_telegram", {
            _telegram_id: telegramId,
            _surface: surface,
          });
          await refresh();
          return true;
        } catch {
          return false;
        }
      } finally {
        setThinking(false);
      }
    },
    [refresh, telegramId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    discount,
    loading,
    thinking,
    refresh,
    requestSmartOffer,
    priceFor: (p: number) => applyDiscount(p, discount.discount_pct),
  };
};
