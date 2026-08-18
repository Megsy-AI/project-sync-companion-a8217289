import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import logoGoogle from "@/assets/logo-google.svg";
import logoAlibaba from "@/assets/logo-alibaba.svg";
const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

const PrizeModal = () => {
  const { user, refreshProfile } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const [parts, setParts] = useState({ h: "00", m: "00", s: "00" });

  const reward = Number(user.rewardBalance ?? 0);
  const expires = user.rewardExpiresAt;

  const displayName =
    [user.telegramUser.first_name, user.telegramUser.last_name].filter(Boolean).join(" ").trim() ||
    user.telegramUser.username ||
    "Player";

  const sweep = useCallback(async () => {
    try {
      await (supabase as any).rpc("expire_prize_rewards");
      await refreshProfile();
    } catch {
      /* ignore */
    }
  }, [refreshProfile]);

  useEffect(() => {
    if (!user.profileId) return;
    void sweep();
  }, [user.profileId, sweep]);

  useEffect(() => {
    if (!user.profileId || !reward || !expires) return;
    if (new Date(expires).getTime() <= Date.now()) return;
    setOpen(true);
  }, [user.profileId, reward, expires]);

  useEffect(() => {
    if (!expires) return;
    const tick = () => {
      const ms = new Date(expires).getTime() - Date.now();
      if (ms <= 0) {
        setParts({ h: "00", m: "00", s: "00" });
        if (!expired) {
          setExpired(true);
          setOpen(false);
          void sweep();
        }
        return;
      }
      setParts({
        h: pad(Math.floor(ms / 3600000)),
        m: pad(Math.floor((ms % 3600000) / 60000)),
        s: pad(Math.floor((ms % 60000) / 1000)),
      });
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [expires, expired, sweep]);

  if (!reward || !expires || expired) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 right-auto top-auto z-[1001] flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[440px] -translate-x-1/2 translate-y-0 items-end justify-center overflow-hidden rounded-[36px] border-0 bg-transparent p-0 shadow-none sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overflow-x-hidden rounded-[36px] bg-[hsl(0_0%_100%/0.72)] px-5 pb-5 pt-7 text-center backdrop-blur-[36px] saturate-[180%] [-ms-overflow-style:none] [scrollbar-width:none] sm:max-h-[calc(100dvh-2rem)] sm:px-6 sm:pb-6 sm:pt-8 [@media(max-height:700px)]:pb-4 [@media(max-height:700px)]:pt-5"
          style={{
            border: "1px solid hsl(160 18% 90%)",
            boxShadow:
              "0 -24px 60px -22px rgba(16,46,38,0.22), inset 0 1px 0 hsl(0 0% 100% / 0.9)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(160deg, hsl(var(--primary) / 0.28) 0%, hsl(0 0% 100% / 0.72) 45%, hsl(var(--accent) / 0.3) 100%)",
            }}
          />

          {/* Top sheen */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-50"
            style={{
              background:
                "linear-gradient(180deg, hsl(var(--accent) / 0.16) 0%, hsl(var(--primary) / 0.08) 45%, transparent 100%)",
            }}
          />

          <div className="relative z-10">
            <h2 className="text-[clamp(20px,5.5vw,26px)] font-display font-medium leading-none text-foreground">{displayName}</h2>
            <p className="mt-1.5 text-[clamp(11px,3vw,12px)] text-muted-foreground">
              You won the{" "}
              <span className="text-[clamp(14px,4vw,16px)] font-display font-medium text-gradient-primary">
                Monthly Prize
              </span>
            </p>

            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
                In partnership with
              </p>
              <div className="flex items-center justify-center gap-3">
                <img src={logoGoogle} alt="Google logo" className="h-5 w-5" loading="lazy" />
                <span className="text-[13px] font-display font-medium text-foreground">Google</span>
                <span className="h-4 w-px bg-border" aria-hidden="true" />
                <img src={logoAlibaba} alt="Alibaba logo" className="h-5 w-5" loading="lazy" />
                <span className="text-[13px] font-display font-medium text-foreground">Alibaba</span>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-border bg-[hsl(0_0%_100%/0.66)] px-4 py-4 backdrop-blur-md sm:px-5 sm:py-5 [@media(max-height:700px)]:py-3">
              <p className="text-[clamp(32px,10vw,44px)] font-display font-medium leading-none tracking-tight text-gradient-primary [@media(max-height:700px)]:text-[30px]">
                ${reward.toLocaleString("en-US")}
              </p>
              <p className="mt-1.5 text-[clamp(9px,2.6vw,11px)] tracking-[0.18em] uppercase text-muted-foreground">USDT credited</p>
            </div>

            <div className="mt-2.5 rounded-[22px] border border-border bg-[hsl(0_0%_100%/0.66)] px-3 py-3 backdrop-blur-md sm:mt-3 sm:px-5 sm:py-4 [@media(max-height:700px)]:py-2.5">
              <p className="text-[clamp(9px,2.4vw,10px)] uppercase tracking-[0.24em] text-muted-foreground">Expires in</p>
              <div className="mt-2 flex items-end justify-center gap-2 sm:gap-3">
                {[
                  { v: parts.h, l: "hours" },
                  { v: parts.m, l: "minutes" },
                  { v: parts.s, l: "seconds" },
                ].map((seg) => (
                  <div
                    key={seg.l}
                    className="flex flex-1 flex-col items-center rounded-2xl bg-secondary/70 px-2 py-2.5 sm:px-3"
                  >
                    <p className="text-[clamp(24px,7.5vw,32px)] font-display font-medium leading-none text-foreground tabular-nums">
                      {seg.v}
                    </p>
                    <p className="mt-1 text-[clamp(8px,2.2vw,9px)] uppercase tracking-[0.16em] text-muted-foreground">{seg.l}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-3 text-[clamp(10px,2.8vw,11px)] leading-relaxed text-muted-foreground sm:mt-4 [@media(max-height:700px)]:mt-2">
              Withdraw within 72 hours. After the countdown ends, the reward is removed from your account
              automatically.
            </p>

            <Button
              onClick={() => {
                setOpen(false);
                navigate("/wallet");
              }}
              className="mt-4 h-11 w-full rounded-2xl font-display text-[14px] font-medium glow-primary sm:mt-5"
            >
              Go to Wallet
            </Button>
            <button
              onClick={() => setOpen(false)}
              className="mt-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Later
            </button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default PrizeModal;
