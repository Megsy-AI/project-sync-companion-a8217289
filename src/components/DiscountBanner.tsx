import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import type { PaymentDiscount } from "@/hooks/use-payment-discount";

interface Props {
  discount: PaymentDiscount;
  /** Asks the AI strategist for a personalised bonus on this surface. */
  onSmartOffer?: () => void;
  thinking?: boolean;
}

/** One slim row: the live discount number plus a single inline action. */
const DiscountBanner = ({ discount, onSmartOffer, thinking }: Props) => {
  if (!discount) return null;

  const hasAi = discount.ai_bonus_pct > 0 && !!discount.ai_headline;
  const total = discount.discount_pct + (hasAi ? discount.ai_bonus_pct : 0);
  const remaining = discount.remaining_to_next_ton;
  const nextPct = discount.next_tier_pct;

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 flex items-center gap-3 rounded-full border border-white/12 bg-white/[0.06] py-2 pl-3 pr-2 backdrop-blur-xl"
    >
      <span className="flex h-9 min-w-[54px] items-center justify-center rounded-full bg-white px-2.5 font-display text-[15px] leading-none text-black">
        {total}%
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">
          {total > 0 ? "Discount applied at checkout" : "No discount yet"}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {remaining !== null && nextPct !== null ? `${remaining} Gram → ${nextPct}%` : "Top tier reached"}
        </p>
      </div>

      {onSmartOffer && !hasAi && (
        <button
          type="button"
          onClick={onSmartOffer}
          disabled={thinking}
          aria-label="Get my AI offer"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/14 bg-white/10 px-3 text-[11px] font-semibold text-foreground"
        >
          {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {thinking ? "…" : "Offer"}
        </button>
      )}
    </motion.section>
  );
};

export default DiscountBanner;
