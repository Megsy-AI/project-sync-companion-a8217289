import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { useToast } from "@/hooks/use-toast";
import { useApp } from "@/context/AppContext";
import { battlePackagesByCategory, battleCategoryOrder, battleCategoryLabels, type BattleCategory } from "@/lib/battle-store";
import { purchaseBattleItemForTelegram, verifyTonOnChain } from "@/lib/game-api";
import { Sword, Zap, Shield, Flame, Package, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

import { PaymentError, sendTonPayment } from "@/lib/ton";
import { usePaymentDiscount } from "@/hooks/use-payment-discount";
import DiscountBanner from "@/components/DiscountBanner";

const TON_ICON = "/images/gram-icon.png";

const CATEGORY_ICONS: Record<BattleCategory, typeof Sword> = {
  attack: Sword, power: Zap, boost: Shield, spell: Flame, combo: Package, defense: ShieldCheck,
};

const CATEGORY_GRADIENTS: Record<BattleCategory, string> = {
  attack: "from-blue-500 via-cyan-500 to-sky-500",
  power: "from-red-500 via-orange-500 to-rose-500",
  boost: "from-emerald-500 via-green-500 to-lime-500",
  spell: "from-purple-500 via-fuchsia-500 to-pink-500",
  combo: "from-amber-500 via-yellow-500 to-orange-500",
  defense: "from-teal-500 via-cyan-500 to-blue-500",
};

const CATEGORY_GLOW: Record<BattleCategory, string> = {
  attack: "shadow-[0_0_30px_rgba(59,130,246,0.4)]",
  power: "shadow-[0_0_30px_rgba(239,68,68,0.4)]",
  boost: "shadow-[0_0_30px_rgba(16,185,129,0.4)]",
  spell: "shadow-[0_0_30px_rgba(168,85,247,0.4)]",
  combo: "shadow-[0_0_30px_rgba(245,158,11,0.4)]",
  defense: "shadow-[0_0_30px_rgba(20,184,166,0.4)]",
};

const AttackShopPage = () => {
  const { toast } = useToast();
  const { user, refreshProfile } = useApp();
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress();
  const [verifying, setVerifying] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<BattleCategory>("attack");
  const { discount, priceFor, refresh: refreshDiscount, requestSmartOffer, thinking: offerThinking } = usePaymentDiscount();

  const items = battlePackagesByCategory[activeCategory];
  const cheapestKey = useMemo(() => {
    return items.reduce((min, p) => (p.price < min.price ? p : min), items[0]).key;
  }, [items]);

  const handleBuy = async (category: BattleCategory, packageKey: string) => {
    const pkg = battlePackagesByCategory[category].find((item) => item.key === packageKey);
    if (!pkg) return;

    try {
      const transaction = await sendTonPayment(tonConnectUI, {
        amountTon: pkg.price, // discount is applied server-side on the intent
        telegramId: user.telegramUser.id,
        action: "battle_item",
        metadata: { category, packageKey },
      });

      setVerifying(packageKey);
      toast({ title: "Verifying payment...", description: "Checking blockchain confirmation" });

      const verification = await verifyTonOnChain(transaction.intentId, transaction.boc, tonConnectUI.account?.address);

      if (!verification.verified) {
        setVerifying(null);
        toast({ title: "Verification Failed", description: "Transaction not found on blockchain.", variant: "destructive" });
        return;
      }

      await purchaseBattleItemForTelegram({
        telegramId: user.telegramUser.id,
        category, packageKey: pkg.key, packageName: pkg.name,
        quantity: pkg.quantity, tonPaid: transaction.amountTon,
        walletAddress, txHash: verification.tx_hash || transaction?.boc,
      });

      await refreshProfile();
      void refreshDiscount();
      setVerifying(null);
      toast({ title: "Purchase Complete!", description: `${pkg.name} added to your inventory` });
    } catch (err) {
      setVerifying(null);
      if (err instanceof PaymentError) {
        toast({
          title: err.code === "not_connected" ? "Wallet not connected" : "Payment failed",
          description: err.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Purchase failed", description: "Please try again", variant: "destructive" });
    }
  };

  const ActiveIcon = CATEGORY_ICONS[activeCategory];
  const activeGradient = CATEGORY_GRADIENTS[activeCategory];

  const handleSmartOffer = async (surface: "servers" | "shop") => {
    const ok = await requestSmartOffer(surface);
    if (!ok) {
      toast({ title: "Offer unavailable", description: "Try again in a moment", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark pb-24 px-4 pt-safe">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-3xl p-4 mb-4 bg-gradient-to-br ${activeGradient} ${CATEGORY_GLOW[activeCategory]}`}
      >
        <div className="absolute inset-0 bg-card/40 backdrop-blur-sm" />
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
            <ActiveIcon className="w-6 h-6 text-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-display font-bold text-foreground">Battle Shop</h1>
            <p className="text-[11px] text-foreground/80 font-display">{battleCategoryLabels[activeCategory]} · from 0.2 Gram</p>
          </div>
          <div className="flex items-center gap-1 glass rounded-xl px-2 py-1">
            <Sparkles className="w-3 h-3 text-accent" />
            <span className="text-[10px] font-display text-foreground">{items.length} items</span>
          </div>
        </div>
      </motion.div>

      <DiscountBanner discount={discount} thinking={offerThinking} onSmartOffer={() => void handleSmartOffer("shop")} />

      {/* Category Selector */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {battleCategoryOrder.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const isActive = activeCategory === cat;
          return (
            <motion.button
              key={cat}
              whileTap={{ scale: 0.94 }}
              onClick={() => setActiveCategory(cat)}
              className={`relative flex flex-col items-center gap-1 p-2.5 rounded-2xl transition-all overflow-hidden ${
                isActive ? "text-primary-foreground" : "glass text-muted-foreground"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="catBg"
                  className={`absolute inset-0 bg-gradient-to-br ${CATEGORY_GRADIENTS[cat]}`}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <Icon className="w-4 h-4 relative z-10" />
              <span className="text-[9px] font-display font-bold relative z-10">{battleCategoryLabels[cat]}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Items */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          {items.map((pkg, i) => {
            const isCheapest = pkg.key === cheapestKey;
            const Icon = CATEGORY_ICONS[activeCategory];

            return (


              <motion.div
                key={pkg.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`relative rounded-2xl p-[1.5px] bg-gradient-to-r ${CATEGORY_GRADIENTS[activeCategory]} ${pkg.popular ? CATEGORY_GLOW[activeCategory] : ""}`}
              >
                {/* Top corner badges */}
                <div className="absolute -top-2 left-3 z-20 flex gap-1">
                  {isCheapest && (
                    <span className="text-[8px] bg-neon-green text-background px-2 py-0.5 rounded-full font-bold font-display flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5" /> CHEAPEST
                    </span>
                  )}
                  {pkg.popular && !isCheapest && (
                    <span className="text-[8px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-bold font-display">
                      HOT
                    </span>
                  )}
                </div>

                <div className="glass glass-strong rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    {/* Icon tile */}
                    <div className={`shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${CATEGORY_GRADIENTS[activeCategory]} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-bold text-foreground truncate">{pkg.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{pkg.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-md">
                          x{pkg.quantity}
                        </span>
                        {pkg.damageLabel && (
                          <span className="text-[10px] text-muted-foreground font-display">{pkg.damageLabel}</span>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="action-black rounded-xl font-display text-xs shrink-0 h-11 px-3 hover:opacity-90"
                      onClick={() => handleBuy(activeCategory, pkg.key)}
                      disabled={verifying === pkg.key}
                    >
                      {verifying === pkg.key ? (
                        <span className="animate-pulse text-[11px]">Verifying...</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <img src={TON_ICON} alt="Gram" className="w-4 h-4 rounded-full"  loading="lazy" decoding="async" />
                          {discount.discount_pct > 0 && (
                            <span className="line-through opacity-50">{pkg.price}</span>
                          )}
                          {priceFor(pkg.price)}
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      <p className="text-[10px] text-center text-muted-foreground mt-4 font-display">
        Secure on-chain TON verification · Items added instantly after confirmation
      </p>
    </div>
  );
};

export default AttackShopPage;
