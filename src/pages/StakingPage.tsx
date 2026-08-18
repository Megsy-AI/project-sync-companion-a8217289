import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Lock, TrendingUp } from "lucide-react";
import SpotlightHero from "@/components/hero/SpotlightHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useApp } from "@/context/AppContext";
import { readCache, writeCache } from "@/lib/cache";
import {
  STAKE_ERRORS,
  claimStakeYield,
  createStake,
  getStakingOverview,
  unstake,
  type StakeRecord,
  type StakingPlan,
} from "@/lib/staking-api";

const GRAM_ICON = "/images/gram-icon.png";
const NOVA_ICON = "/images/nova-icon.jpg";

const fmt = (n: number, d = 4) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d });

const label = (c: string) => (c === "ton" ? "gram" : "$NOVA");
const icon = (c: string) => (c === "ton" ? GRAM_ICON : NOVA_ICON);

const timeLeft = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Matured";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};

const progressPct = (s: StakeRecord) => {
  const start = new Date(s.started_at).getTime();
  const end = new Date(s.ends_at).getTime();
  if (!end || end <= start) return 100;
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
};

const estimate = (amount: number, apr: number, days: number) =>
  (amount || 0) * ((apr || 0) / 100) * ((days || 0) / 365);

const ease = [0.22, 1, 0.36, 1] as const;

const StakingPage = () => {
  const { user, refreshProfile } = useApp();
  const { toast } = useToast();
  const [tab, setTab] = useState<"plans" | "mine">("plans");
  const [plans, setPlans] = useState<StakingPlan[]>([]);
  const [stakes, setStakes] = useState<StakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<StakingPlan | null>(null);
  const [amount, setAmount] = useState("");
  const [exitTarget, setExitTarget] = useState<StakeRecord | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    // Plans are public catalog data -> safe to paint instantly from cache.
    // Stakes/balances always come fresh from the server (never trusted locally).
    const cachedPlans = readCache<StakingPlan[]>("staking-plans", 10 * 60 * 1000);
    if (cachedPlans?.length) {
      setPlans(cachedPlans);
      setLoading(false);
    }
    try {
      const res = await getStakingOverview(user.telegramUser.id);
      setPlans(res?.plans ?? []);
      setStakes(res?.stakes ?? []);
      writeCache("staking-plans", res?.plans ?? []);
    } catch (e) {
      console.error("staking load failed", e);
      toast({ title: "Couldn't load bonds", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user.telegramUser.id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const active = useMemo(() => stakes.filter((s) => s.status === "active"), [stakes]);

  const totals = useMemo(() => {
    const t = { ton: 0, siri: 0 };
    const pending = { ton: 0, siri: 0 };
    active.forEach((s) => {
      t[s.currency] += Number(s.amount || 0);
      pending[s.currency] += Number(s.pending_yield || 0);
    });
    return { t, pending };
  }, [active]);

  const balanceFor = (c: string) => (c === "ton" ? user.tonBalance : user.siriBalance);

  const openPlan = (p: StakingPlan) => {
    setSelected(p);
    setAmount(String(p.min_amount));
  };

  const amt = Number(amount);
  const available = balanceFor(selected?.currency ?? "ton");
  const invalid =
    !selected ||
    !Number.isFinite(amt) ||
    amt <= 0 ||
    amt < Number(selected.min_amount) ||
    (selected.max_amount != null && amt > Number(selected.max_amount)) ||
    amt > Number(available);

  const invalidReason = !selected
    ? ""
    : !Number.isFinite(amt) || amt <= 0
      ? "Enter an amount"
      : amt < Number(selected.min_amount)
        ? `Minimum is ${fmt(selected.min_amount, 2)} ${label(selected.currency)}`
        : selected.max_amount != null && amt > Number(selected.max_amount)
          ? `Maximum is ${fmt(selected.max_amount, 2)} ${label(selected.currency)}`
          : amt > Number(available)
            ? "Insufficient balance"
            : "";

  const submit = async () => {
    if (!selected || invalid) return;
    setBusy(true);
    try {
      const res = await createStake(user.telegramUser.id, selected.id, amt);
      if (!res?.success) {
        toast({ title: STAKE_ERRORS[res?.error ?? ""] ?? "Failed to stake", variant: "destructive" });
        return;
      }
      toast({
        title: "Bond opened",
        description: `${fmt(amt)} ${label(selected.currency)} locked for ${selected.duration_days} days`,
      });
      setSelected(null);
      await Promise.all([load(), refreshProfile()]);
      setTab("mine");
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doClaim = async (s: StakeRecord) => {
    setBusy(true);
    try {
      const res = await claimStakeYield(user.telegramUser.id, s.id);
      if (!res?.success) {
        toast({ title: STAKE_ERRORS[res?.error ?? ""] ?? "Claim failed", variant: "destructive" });
        return;
      }
      toast({ title: "Yield claimed", description: `+${fmt(Number(res.claimed))} ${label(s.currency)}` });
      await Promise.all([load(), refreshProfile()]);
    } catch {
      toast({ title: "Claim failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runUnstake = async (s: StakeRecord) => {
    setBusy(true);
    try {
      const res = await unstake(user.telegramUser.id, s.id);
      if (!res?.success) {
        toast({ title: STAKE_ERRORS[res?.error ?? ""] ?? "Unstake failed", variant: "destructive" });
        return;
      }
      toast({
        title: res.early ? "Early exit completed" : "Bond matured",
        description: `+${fmt(Number(res.payout))} ${label(s.currency)}${
          Number(res.fee) > 0 ? ` · fee ${fmt(Number(res.fee))}` : ""
        }`,
      });
      await Promise.all([load(), refreshProfile()]);
    } catch {
      toast({ title: "Unstake failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const requestUnstake = (s: StakeRecord) => {
    if (new Date(s.ends_at).getTime() > Date.now()) setExitTarget(s);
    else void runUnstake(s);
  };

  return (
    <div className="pb-28">
      <SpotlightHero title="Bonds">
        <div className="px-5 pt-4">
          {/* Portfolio summary */}
          <motion.section
            className="rounded-3xl border border-border bg-card/50 p-5 backdrop-blur-xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease }}
          >
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Total Locked
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["ton", "siri"] as const).map((c) => (
                <div key={c} className="rounded-2xl border border-border/70 bg-background/40 p-3.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <img src={icon(c)} alt={label(c)} className="h-4 w-4 rounded-full" loading="lazy" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label(c)}</p>
                  </div>
                  <p className="font-display text-xl font-bold text-foreground">
                    {fmt(totals.t[c], c === "ton" ? 4 : 2)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Pending {fmt(totals.pending[c], c === "ton" ? 4 : 2)}
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Segmented tabs */}
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card/40 p-1">
            {(["plans", "mine"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-xl py-2.5 font-display text-[11px] uppercase tracking-widest transition-all ${
                  tab === t ? "action-black" : "text-muted-foreground"
                }`}
              >
                {t === "plans" ? "Plans" : `My Bonds (${active.length})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading bonds…
            </div>
          ) : tab === "plans" ? (
            <div className="mt-4 space-y-3">
              {plans.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">No plans available</p>
              )}
              {plans.map((p, i) => (
                <motion.button
                  key={p.id}
                  onClick={() => openPlan(p)}
                  className="w-full rounded-2xl border border-border bg-card/40 p-4 text-left backdrop-blur-xl transition-all active:scale-[0.99] hover:border-primary/40"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease, delay: Math.min(i, 8) * 0.035 }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <img
                        src={icon(p.currency)}
                        alt={label(p.currency)}
                        className="h-9 w-9 rounded-full border border-border"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {p.duration_days} days · min {fmt(p.min_amount, 2)} {label(p.currency)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-bold leading-none text-primary">
                        {fmt(p.apr, 1)}%
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">APR</p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {stakes.length === 0 && (
                <div className="py-14 text-center">
                  <p className="font-display text-base text-foreground">No bonds yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">Open a bond from the Plans tab</p>
                </div>
              )}
              {stakes.map((s, i) => {
                const matured = new Date(s.ends_at).getTime() <= Date.now();
                const closed = s.status !== "active";
                const pct = progressPct(s);
                return (
                  <motion.article
                    key={s.id}
                    className="rounded-2xl border border-border bg-card/40 p-4 backdrop-blur-xl"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease, delay: Math.min(i, 8) * 0.035 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={icon(s.currency)}
                          alt={label(s.currency)}
                          className="h-9 w-9 rounded-full border border-border"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{s.plan_name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {fmt(s.amount, 2)} {label(s.currency)} · {fmt(s.apr, 1)}% APR
                          </p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest ${
                          closed
                            ? "bg-muted/50 text-muted-foreground"
                            : matured
                              ? "bg-primary/15 text-primary"
                              : "bg-accent/15 text-accent"
                        }`}
                      >
                        {closed
                          ? s.status === "early_closed"
                            ? "Early exit"
                            : "Closed"
                          : matured
                            ? "Matured"
                            : "Locked"}
                      </span>
                    </div>

                    {!closed && (
                      <>
                        <div className="mt-4">
                          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                            <span>{matured ? "Ready" : timeLeft(s.ends_at)}</span>
                            <span>{pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-muted">
                            <motion.div
                              className="h-full rounded-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.5, ease }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
                            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                              <Lock className="h-3 w-3" /> Unlocks
                            </p>
                            <p className="font-display text-sm text-foreground">{timeLeft(s.ends_at)}</p>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-background/40 p-2.5">
                            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                              <TrendingUp className="h-3 w-3" /> Pending
                            </p>
                            <p className="font-display text-sm text-primary">
                              {fmt(s.pending_yield)} {label(s.currency)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            disabled={busy || Number(s.pending_yield) <= 0}
                            onClick={() => void doClaim(s)}
                            className="h-10 rounded-xl font-display text-xs"
                          >
                            Claim yield
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() => requestUnstake(s)}
                            variant="outline"
                            className="h-10 rounded-xl border-border bg-card/40 font-display text-xs"
                          >
                            {matured ? "Withdraw" : `Exit · -${fmt(s.early_exit_fee_pct, 0)}%`}
                          </Button>
                        </div>
                      </>
                    )}
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      </SpotlightHero>

      {/* Open bond */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">{selected?.name}</DialogTitle>
            <DialogDescription>
              Lock {label(selected?.currency ?? "ton")} for {selected?.duration_days} days at{" "}
              {fmt(selected?.apr ?? 0, 1)}% APR. Early exit costs{" "}
              {fmt(selected?.early_exit_fee_pct ?? 0, 0)}% of principal and forfeits unclaimed yield.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Available</span>
              <button
                type="button"
                onClick={() => setAmount(String(available))}
                className="font-display text-foreground underline decoration-dotted"
              >
                {fmt(available, 4)} {label(selected?.currency ?? "ton")}
              </button>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min={selected?.min_amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="h-12 rounded-2xl"
            />
            <div className="rounded-2xl border border-border bg-card/40 p-3 text-xs text-muted-foreground">
              Estimated yield at maturity:{" "}
              <span className="font-display text-primary">
                {fmt(estimate(amt, selected?.apr ?? 0, selected?.duration_days ?? 0))}{" "}
                {label(selected?.currency ?? "ton")}
              </span>
            </div>
            {invalidReason && <p className="text-xs text-destructive">{invalidReason}</p>}
            <Button
              onClick={() => void submit()}
              disabled={busy || invalid}
              className="h-12 w-full gap-2 rounded-2xl font-display"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Lock now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Early exit confirm */}
      <AlertDialog open={!!exitTarget} onOpenChange={(o) => !o && setExitTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Exit early?</AlertDialogTitle>
            <AlertDialogDescription>
              This bond is still locked. You will pay a {fmt(exitTarget?.early_exit_fee_pct ?? 0, 0)}% fee on
              the principal and forfeit any unclaimed yield.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep bond</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={() => {
                const s = exitTarget;
                setExitTarget(null);
                if (s) void runUnstake(s);
              }}
            >
              Exit anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StakingPage;
