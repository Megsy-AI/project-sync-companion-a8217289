import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { PaymentError, sendTonPayment } from "@/lib/ton";
import { getBattleInventoryForTelegram, purchaseBattleItemForTelegram, verifyTonOnChain } from "@/lib/game-api";

const BASE_PRICE = 0.5;

type BoostKind = "time" | "yield";

const packageKey = (kind: BoostKind) => `mining_boost_${kind}`;
const storageKey = (id: number | string, kind: BoostKind) => `nova-boost-${kind}-${id}`;

const readLevel = (id: number | string, kind: BoostKind) => {
  const raw = Number(localStorage.getItem(storageKey(id, kind)) ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

/** Price grows with every purchase, starting at 0.5 Gram. */
const priceForLevel = (level: number) => Math.round(BASE_PRICE * Math.pow(1.6, level) * 100) / 100;

/** Two paid upgrades: longer mining cycle and a rewards multiplier that stacks. */
const MiningBoosters = () => {
  const { user } = useApp();
  const { toast } = useToast();
  const [tonConnectUI] = useTonConnectUI();
  const id = user.telegramUser.id;

  const [levels, setLevels] = useState<Record<BoostKind, number>>(() => ({
    time: readLevel(id, "time"),
    yield: readLevel(id, "yield"),
  }));
  const [busy, setBusy] = useState<BoostKind | null>(null);

  // Paid upgrades must survive a cache wipe or a device change, so the levels
  // come from the server inventory; localStorage is only an offline fallback.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const inventory = await getBattleInventoryForTelegram(id);
        if (cancelled || !Array.isArray(inventory)) return;
        const levelFor = (kind: BoostKind) =>
          Number(inventory.find((row) => row.package_key === packageKey(kind))?.total_purchased ?? 0);
        const next = { time: levelFor("time"), yield: levelFor("yield") };
        setLevels((prev) => ({
          time: Math.max(prev.time, next.time),
          yield: Math.max(prev.yield, next.yield),
        }));
        localStorage.setItem(storageKey(id, "time"), String(next.time));
        localStorage.setItem(storageKey(id, "yield"), String(next.yield));
      } catch {
        /* keep the cached levels */
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [id]);

  const buy = async (kind: BoostKind) => {
    const level = levels[kind];
    const amountTon = priceForLevel(level);
    setBusy(kind);
    try {
      const tx = await sendTonPayment(tonConnectUI, {
        amountTon,
        telegramId: id,
        action: "battle_item",
        metadata: { boost: kind, level: level + 1 },
      });
      const verification = await verifyTonOnChain(tx.intentId, tx.boc, tonConnectUI.account?.address);
      if (!verification.verified) {
        toast({ title: "Payment not verified", variant: "destructive" });
        return;
      }
      const purchase = await purchaseBattleItemForTelegram({
        telegramId: id,
        category: "boost",
        packageKey: packageKey(kind),
        packageName: kind === "time" ? "Longer mining cycle" : "Mining rewards multiplier",
        quantity: 1,
        intentId: tx.intentId,
        walletAddress: tonConnectUI.account?.address,
      });
      if (!purchase?.success) {
        toast({ title: "Payment confirmed but not applied", description: "Contact support", variant: "destructive" });
        return;
      }
      const next = level + 1;
      localStorage.setItem(storageKey(id, kind), String(next));
      setLevels((prev) => ({ ...prev, [kind]: next }));
      toast({
        title: kind === "time" ? "Cycle extended" : "Rewards multiplied",
        description: kind === "time" ? `+${next * 2}h per mining cycle` : `x${(1 + next * 0.5).toFixed(1)} rewards`,
      });
    } catch (err) {
      if (err instanceof PaymentError) {
        toast({
          title: err.code === "not_connected" ? "Wallet not connected" : "Payment failed",
          description: err.message,
          variant: "destructive",
        });
      } else {
        toast({ title: "Something went wrong", variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  };


  const rows: { kind: BoostKind; title: string; effect: string }[] = [
    { kind: "time", title: "Longer cycle", effect: `+${(levels.time + 1) * 2}h` },
    { kind: "yield", title: "Multiply rewards", effect: `x${(1 + (levels.yield + 1) * 0.5).toFixed(1)}` },
  ];

  return (
    <motion.div
      className="mt-3 rounded-2xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 backdrop-blur-xl"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {rows.map(({ kind, title, effect }, i) => (
        <div
          key={kind}
          className={`flex items-center gap-3 py-2 ${i > 0 ? "border-t border-white/10" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-foreground">
              {title} <span className="text-muted-foreground">{effect}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              {levels[kind] > 0 ? `Level ${levels[kind]}` : "Not active"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void buy(kind)}
            disabled={busy === kind}
            className="h-8 shrink-0 rounded-full bg-white px-3.5 text-[11px] font-semibold text-black disabled:opacity-60"
          >
            {busy === kind ? "…" : `${priceForLevel(levels[kind])} TON`}
          </button>
        </div>
      ))}
    </motion.div>
  );
};

export default MiningBoosters;
