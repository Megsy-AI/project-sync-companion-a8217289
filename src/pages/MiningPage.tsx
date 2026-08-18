import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/context/AppContext";
import { Progress } from "@/components/ui/progress";
import SpotlightHero from "@/components/hero/SpotlightHero";
import MiningBoosters from "@/components/MiningBoosters";


const TON_ICON = "/images/gram-icon.png";
const USDT_ICON = "/images/usdt.png";

const MiningPage = () => {
  const { user, startMining, getMiningTimeLeft, getMiningProgress } = useApp();
  const [timeLeft, setTimeLeft] = useState("00:00:00");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getMiningTimeLeft());
      setProgress(getMiningProgress());
    }, 1000);
    return () => clearInterval(interval);
  }, [getMiningTimeLeft, getMiningProgress]);

  return (
    <SpotlightHero title="NOVA AI" center>
      <div className="flex w-full flex-col px-5 pb-28 pt-2">
        <motion.div
          className="nv-card p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="nv-eyebrow block text-center">$NOVA Balance</p>
          <p className="hero-title mt-1.5 text-center text-[56px] leading-none tracking-tight">
            {user.siriBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>

          <button
            onClick={user.isMining ? undefined : startMining}
            disabled={user.isMining}
            className="nv-pill mt-6 w-full"
          >
            {user.isMining ? `Mining · ${timeLeft}` : "Start Mining"}
          </button>

          {user.isMining && (
            <div className="mt-4">
              <Progress value={progress} className="h-1 bg-white/15" />
              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-white/60">
                {progress.toFixed(0)}% complete
              </p>
            </div>
          )}
        </motion.div>

        <motion.div
          className="mt-3 grid grid-cols-2 gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {[
            { label: "Gram", value: user.tonBalance, icon: TON_ICON },
            { label: "USDT", value: user.usdtBalance, icon: USDT_ICON },
          ].map((s) => (
            <div key={s.label} className="nv-card flex items-center gap-3 p-4">
              <img
                src={s.icon}
                alt={s.label}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="min-w-0">
                <p className="nv-eyebrow">{s.label}</p>
                <p className="nv-stat-num truncate">
                  {Number(s.value || 0).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                </p>
              </div>
            </div>
          ))}
        </motion.div>

        <MiningBoosters />
      </div>
    </SpotlightHero>
  );
};


export default MiningPage;
