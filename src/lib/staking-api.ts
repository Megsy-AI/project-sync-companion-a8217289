import { supabase } from "@/integrations/supabase/client";

export interface StakingPlan {
  id: string;
  name: string;
  currency: "ton" | "siri";
  duration_days: number;
  apr: number;
  min_amount: number;
  max_amount: number | null;
  early_exit_fee_pct: number;
  is_active: boolean;
  sort_order: number;
}

export interface StakeRecord {
  id: string;
  plan_id: string;
  plan_name: string;
  currency: "ton" | "siri";
  amount: number;
  apr: number;
  duration_days: number;
  early_exit_fee_pct: number;
  started_at: string;
  ends_at: string;
  last_claim_at: string;
  claimed_yield: number;
  pending_yield: number;
  status: "active" | "closed" | "early_closed";
}

export interface StakingOverview {
  success: boolean;
  plans: StakingPlan[];
  stakes: StakeRecord[];
  balances: { ton: number; siri: number } | null;
}

const rpc = async <T,>(fn: string, params: Record<string, unknown>): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, params);
  if (error) throw error;
  return data as T;
};

export const getStakingOverview = (telegramId: number) =>
  rpc<StakingOverview>("staking_get_overview_for_telegram", { _telegram_id: telegramId });

export const createStake = (telegramId: number, planId: string, amount: number) =>
  rpc<{ success: boolean; error?: string; stake_id?: string }>("staking_create_for_telegram", {
    _telegram_id: telegramId,
    _plan_id: planId,
    _amount: amount,
  });

export const claimStakeYield = (telegramId: number, stakeId: string) =>
  rpc<{ success: boolean; error?: string; claimed?: number; currency?: string }>("staking_claim_for_telegram", {
    _telegram_id: telegramId,
    _stake_id: stakeId,
  });

export const unstake = (telegramId: number, stakeId: string) =>
  rpc<{ success: boolean; error?: string; payout?: number; fee?: number; yield?: number; early?: boolean; currency?: string }>(
    "staking_unstake_for_telegram",
    { _telegram_id: telegramId, _stake_id: stakeId },
  );

export const STAKE_ERRORS: Record<string, string> = {
  profile_not_found: "Profile not found",
  plan_not_found: "Plan unavailable",
  amount_too_low: "Amount below plan minimum",
  amount_too_high: "Amount above plan maximum",
  insufficient_balance: "Insufficient balance",
  stake_not_found: "Bond not found",
  nothing_to_claim: "No yield to claim yet",
};
