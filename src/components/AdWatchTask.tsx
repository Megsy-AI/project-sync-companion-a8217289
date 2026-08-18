import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PlayCircle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { showAd, lastAdError } from "@/lib/telegram-ads";
import {
  AD_TASK_GOAL,
  AD_TASK_GOAL_B,
  AD_TASK_REWARD,
  AD_TASK_REWARD_B,
  AdTier,
  claimAdRewardForTelegram,
  getAdProgressForTelegram,
  incrementAdWatchForTelegram,
} from "@/lib/game-api";

const AdWatchTask = () => {
  const { user, setUser } = useApp();
  const { toast } = useToast();
  const [watched, setWatched] = useState(0);
  const [watchedB, setWatchedB] = useState(0);
  const [busy, setBusy] = useState<AdTier | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await getAdProgressForTelegram(user.telegramUser.id);
        if (!active) return;
        setWatched(res?.adsWatched ?? 0);
        setWatchedB(res?.adsWatchedB ?? 0);
      } catch {
        // keep zero on failure
      }
    })();
    return () => {
      active = false;
    };
  }, [user.telegramUser.id, user.profileId]);

  const handleWatch = async (tier: AdTier) => {
    if (busy) return;
    setBusy(tier);
    try {
      const shown = await showAd();
      if (!shown) {
        toast({
          title: "No ad available",
          description: lastAdError || "Try again in a moment",
          variant: "destructive",
        });
        return;
      }
      const res = await incrementAdWatchForTelegram(user.telegramUser.id, tier);
      if (res?.success) {
        setWatched(res.adsWatched ?? 0);
        setWatchedB(res.adsWatchedB ?? 0);
      }
    } catch {
      toast({ title: "Ad failed", description: "Please try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleClaim = async (tier: AdTier) => {
    if (busy) return;
    setBusy(tier);
    const goal = tier === "b" ? AD_TASK_GOAL_B : AD_TASK_GOAL;
    const reward = tier === "b" ? AD_TASK_REWARD_B : AD_TASK_REWARD;
    try {
      const res = await claimAdRewardForTelegram(user.telegramUser.id, tier);
      if (!res?.success) {
        toast({
          title: "Not yet!",
          description: `Watch ${goal} ads first (current: ${res?.adsWatched ?? (tier === "b" ? watchedB : watched)})`,
          variant: "destructive",
        });
        return;
      }
      if (tier === "b") setWatchedB(res.adsWatched ?? 0);
      else setWatched(res.adsWatched ?? 0);
      if (res.balances) {
        setUser((prev) => ({
          ...prev,
          siriBalance: res.balances!.siri,
          tonBalance: res.balances!.ton,
          usdtBalance: res.balances!.usdt,
        }));
      }
      toast({ title: "Reward Claimed!", description: `+${reward} Gram` });
    } catch {
      toast({ title: "Claim failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const renderTier = (tier: AdTier) => {
    const goal = tier === "b" ? AD_TASK_GOAL_B : AD_TASK_GOAL;
    const reward = tier === "b" ? AD_TASK_REWARD_B : AD_TASK_REWARD;
    const count = tier === "b" ? watchedB : watched;
    const ready = count >= goal;
    const progress = Math.min((count / goal) * 100, 100);
    const loading = busy === tier;

    return (
      <div className="paper-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="paper-eyebrow mb-1">{tier === "b" ? "Bonus round" : "Daily bonus"}</p>
            <h3 className="font-display text-xl leading-none text-foreground">Watch {goal} ads</h3>
          </div>
          <span className="chip-reward shrink-0 px-2.5 py-1 text-[11px]">+{reward} Gram</span>
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] font-medium">
          <span className="text-muted-foreground">Progress</span>
          <span className="text-foreground">
            {count} / {goal}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <button
          type="button"
          disabled={!!busy}
          onClick={() => void (ready ? handleClaim(tier) : handleWatch(tier))}
          className={`mt-4 h-11 w-full text-sm font-semibold ${ready ? "btn-ink" : "btn-ink-soft"}`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {!ready && !loading && <PlayCircle className="h-4 w-4" />}
            {loading ? "Loading..." : ready ? `Claim ${reward} Gram` : "Watch Ad"}
          </span>
        </button>
      </div>
    );
  };

  return (
    <motion.div
      layout
      className="mb-4 space-y-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {renderTier("a")}
      {renderTier("b")}
    </motion.div>
  );
};


export default AdWatchTask;
