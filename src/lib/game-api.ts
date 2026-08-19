import { supabase } from "@/integrations/supabase/client";

type RpcParams = Record<string, unknown>;

export interface TelegramUserPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface ProfileRecord {
  id: string;
  telegram_id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  photo_url: string | null;
  referral_code: string | null;
  referred_by: string | null;
  siri_balance: number | null;
  ton_balance: number | null;
  usdt_balance: number | null;
  reward_balance: number | null;
}

export interface MiningSyncResult {
  success: boolean;
  isMining: boolean;
  claimed?: boolean;
  endsAt?: string;
  sessionId?: string;
  siriReward?: number;
  tonReward?: number;
  usdtReward?: number;
  balances?: { siri: number; ton: number; usdt: number };
}

export interface BattleInventoryItem {
  id: string;
  category: "attack" | "power" | "boost" | "spell";
  package_key: string;
  package_name: string;
  quantity: number;
  total_purchased: number;
  updated_at: string;
}

export interface ReferralSummary {
  count: number;
  ton_earned: number;
  users: Array<{ id: string; first_name: string; username?: string | null; photo_url?: string | null; joined_at: string }>;
  rewards: Array<{ id: string; source_type: string; ton_amount: number; created_at: string; referred_user_id: string }>;
}

export interface AttackResult {
  success: boolean;
  error?: string;
  damage: number;
  character: { id: string; name: string; current_hp: number; max_hp: number; ton_pool: number; is_active: boolean };
  inventory: BattleInventoryItem[];
  freeAttacksRemaining: number;
}

export interface AdminDashboard {
  success: boolean;
  error?: string;
  users: any[];
  tasks: any[];
  characters: any[];
  servers: any[];
  transactions: any[];
  notifications: any[];
  stats: {
    total_users: number;
    total_transactions: number;
    total_ton_volume: number;
    active_miners: number;
    total_attacks: number;
  };
}

const callRpc = async <T>(fn: string, params?: RpcParams): Promise<T> => {
  const { data, error } = await (supabase as any).rpc(fn, params ?? {});
  if (error) throw error;
  return data as T;
};

// ── Profile ──
const PROFILE_SELECT = "id, telegram_id, first_name, last_name, username, photo_url, referral_code, referred_by, siri_balance, ton_balance, usdt_balance, reward_balance, reward_expires_at";

const buildTelegramScopedUserId = (telegramId: number) => {
  const hex = Math.abs(Math.trunc(telegramId)).toString(16).padStart(32, "0").slice(-32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const fetchProfileByTelegramId = async (telegramId: number): Promise<ProfileRecord | null> => {
  const data = await callRpc<ProfileRecord | null>("game_get_own_profile", { _telegram_id: telegramId });
  return (data as ProfileRecord | null) ?? null;
};

export const findOrCreateProfile = async (telegramUser: TelegramUserPayload): Promise<ProfileRecord> => {
  const existing = await fetchProfileByTelegramId(telegramUser.id);
  if (existing) return existing;
  const created = await callRpc<ProfileRecord | null>("game_create_own_profile", {
    _telegram_id: telegramUser.id,
    _first_name: telegramUser.first_name || "Player",
    _last_name: telegramUser.last_name || "",
    _username: telegramUser.username || "",
    _photo_url: telegramUser.photo_url || "",
  });
  if (created) return created;
  const retry = await fetchProfileByTelegramId(telegramUser.id);
  if (retry) return retry;
  throw new Error("Profile creation failed");
};

export const fetchOwnProfile = (telegramId: number) => fetchProfileByTelegramId(telegramId);

export type PublicProfile = { id: string; username: string | null; first_name: string | null; photo_url: string | null };

export const fetchPublicProfiles = async (ids: string[]): Promise<PublicProfile[]> => {
  if (ids.length === 0) return [];
  const data = await callRpc<PublicProfile[]>("game_public_profiles", { _ids: ids });
  return data ?? [];
};

export const isWalletVerified = (telegramId: number) =>
  callRpc<boolean>("game_is_wallet_verified", { _telegram_id: telegramId });

/** Credits a confirmed on-chain deposit to the player balance (one time per payment). */
export const creditDepositWithIntent = (args: { telegramId: number; intentId: string; walletAddress?: string | null }) =>
  callRpc<{ success: boolean; error?: string; amount?: number; tonBalance?: number }>(
    "credit_ton_deposit_with_intent",
    { _telegram_id: args.telegramId, _intent_id: args.intentId, _wallet_address: args.walletAddress ?? null },
  );

/** Marks the wallet as verified after the verification payment is confirmed on chain. */
export const verifyWalletWithIntent = (args: { telegramId: number; intentId: string; walletAddress?: string | null }) =>
  callRpc<{ success: boolean; error?: string; verified?: boolean }>(
    "verify_wallet_with_intent",
    { _telegram_id: args.telegramId, _intent_id: args.intentId, _wallet_address: args.walletAddress ?? null },
  );

/** Server-validated withdrawal request (checks verification, balance and duplicates). */
export const requestWithdrawal = (args: { telegramId: number; amount: number; currency: "ton" | "usdt"; walletAddress?: string | null }) =>
  callRpc<{ success: boolean; error?: string; id?: string; balance?: number }>(
    "request_withdrawal_for_telegram",
    { _telegram_id: args.telegramId, _amount: args.amount, _currency: args.currency, _wallet_address: args.walletAddress ?? null },
  );


export const createTransaction = (params: {
  telegramId: number; type: "deposit" | "withdrawal" | "wallet_verification";
  amount: number; currency: string; walletAddress?: string | null; txHash?: string | null; status?: string;
}) =>
  callRpc<{ success: boolean; error?: string; id?: string }>("game_create_transaction", {
    _telegram_id: params.telegramId,
    _type: params.type,
    _amount: params.amount,
    _currency: params.currency,
    _wallet_address: params.walletAddress ?? null,
    _tx_hash: params.txHash ?? null,
    _status: params.status ?? "pending",
  });

// ── Mining ──
export const syncMiningForTelegram = (telegramId: number) =>
  callRpc<MiningSyncResult>("sync_mining_for_telegram", { _telegram_id: telegramId });

export const startMiningForTelegram = (telegramId: number) =>
  callRpc<MiningSyncResult>("start_mining_for_telegram", { _telegram_id: telegramId });

// ── Tasks ──
export const completeTaskForTelegram = (telegramId: number, taskId: string) =>
  callRpc<{ success: boolean; alreadyCompleted: boolean; rewardAmount: number; rewardType: string; balances: { siri: number; ton: number; usdt: number } }>(
    "complete_task_for_telegram", { _telegram_id: telegramId, _task_id: taskId }
  );

// ── Ad watching tasks (500 ads -> 0.5 Gram, 1000 ads -> 5 Gram) ──
export type AdTier = "a" | "b";

export const AD_TASK_GOAL = 500;
export const AD_TASK_REWARD = 0.5;
export const AD_TASK_GOAL_B = 1000;
export const AD_TASK_REWARD_B = 5;

export const getAdProgressForTelegram = (telegramId: number) =>
  callRpc<{
    success: boolean;
    adsWatched: number;
    totalClaims: number;
    adsWatchedB: number;
    totalClaimsB: number;
  }>("ad_watch_get_progress", {
    _telegram_id: telegramId,
  });

export const incrementAdWatchForTelegram = (telegramId: number, tier: AdTier = "a") =>
  callRpc<{ success: boolean; adsWatched: number; adsWatchedB: number }>("ad_watch_increment", {
    _telegram_id: telegramId,
    _tier: tier,
  });

export const claimAdRewardForTelegram = (telegramId: number, tier: AdTier = "a") =>
  callRpc<{
    success: boolean;
    error?: string;
    rewardAmount?: number;
    rewardType?: string;
    adsWatched: number;
    balances?: { siri: number; ton: number; usdt: number };
  }>("ad_watch_claim", { _telegram_id: telegramId, _tier: tier });

// ── Referrals ──
export const getReferralSummaryForTelegram = (telegramId: number) =>
  callRpc<ReferralSummary>("get_referral_summary_for_telegram", { _telegram_id: telegramId });

export const attachReferralForTelegram = (telegramId: number, code: string) =>
  callRpc<{ success: boolean; reason?: string; referrerId?: string }>("attach_referral_for_telegram", {
    _telegram_id: telegramId,
    _code: code,
  });

// ── Battle ──
export const getBattleInventoryForTelegram = (telegramId: number) =>
  callRpc<BattleInventoryItem[]>("get_battle_inventory_for_telegram", { _telegram_id: telegramId });

export const performAttackForTelegram = (args: { telegramId: number; attackType?: string; packageKey?: string | null }) =>
  callRpc<AttackResult>("perform_attack_for_telegram", {
    _telegram_id: args.telegramId,
    _attack_type: args.attackType ?? "free",
    _package_key: args.packageKey ?? null,
  });

// ── On-Chain Verification ──
export const verifyTonOnChain = async (
  intentId: string,
  boc: string,
  sender?: string | null,
): Promise<{ verified: boolean; tx_hash?: string; error?: string }> => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/verify-ton-transaction`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ intent_id: intentId, boc: boc || null, sender: sender ?? null }),
  });
  if (!res.ok) return { verified: false, error: `Verification service unavailable (${res.status})` };
  return await res.json();
};

// ── Purchases ──
// The server derives the paid amount from the confirmed payment intent and can
// only credit each intent once, so the client never supplies a price.
export const purchaseServerForTelegram = async (args: {
  telegramId: number; serverId: string; intentId: string; walletAddress?: string;
}) => {
  return callRpc<{ success: boolean; transactionId: string; referralReward: number }>("purchase_server_with_intent", {
    _telegram_id: args.telegramId,
    _server_id: args.serverId,
    _intent_id: args.intentId,
    _wallet_address: args.walletAddress ?? null,
  });
};

export const purchaseBattleItemForTelegram = async (args: {
  telegramId: number; category: string; packageKey: string; packageName: string;
  quantity: number; intentId: string; walletAddress?: string;
}) => {
  return callRpc<{ success: boolean; transactionId: string; referralReward: number; inventory: BattleInventoryItem[] }>(
    "purchase_battle_item_with_intent", {
      _telegram_id: args.telegramId,
      _category: args.category,
      _package_key: args.packageKey,
      _package_name: args.packageName,
      _quantity: args.quantity,
      _intent_id: args.intentId,
      _wallet_address: args.walletAddress ?? null,
    }
  );
};


// ── Admin ──
export const isTelegramAdmin = async (telegramId: number) => {
  const result = await callRpc<boolean>("is_telegram_admin", { _telegram_id: telegramId });
  return Boolean(result);
};

export const adminGetDashboard = (telegramId: number) =>
  callRpc<AdminDashboard>("admin_get_dashboard_for_telegram", { _telegram_id: telegramId });

export const adminUpsertTask = (telegramId: number, task: { id?: string; title: string; reward_amount: number; reward_type: string; task_type: string; link: string }) =>
  callRpc<{ success: boolean; taskId: string }>("admin_upsert_task_for_telegram", {
    _telegram_id: telegramId,
    _task_id: task.id ?? null,
    _title: task.title,
    _reward_amount: task.reward_amount,
    _reward_type: task.reward_type,
    _task_type: task.task_type,
    _link: task.link,
  });

export const adminToggleTask = (telegramId: number, taskId: string, isActive: boolean) =>
  callRpc<{ success: boolean }>("admin_toggle_task_for_telegram", { _telegram_id: telegramId, _task_id: taskId, _is_active: isActive });

export const adminDeleteTask = (telegramId: number, taskId: string) =>
  callRpc<{ success: boolean }>("admin_delete_task_for_telegram", { _telegram_id: telegramId, _task_id: taskId });

export const adminCreateCharacter = (telegramId: number, name: string, imageUrl: string, maxHp: number) =>
  callRpc<{ success: boolean; characterId: string }>("admin_create_character_for_telegram", {
    _telegram_id: telegramId, _name: name, _image_url: imageUrl, _max_hp: maxHp,
  });

export const adminActivateCharacter = (telegramId: number, characterId: string) =>
  callRpc<{ success: boolean }>("admin_activate_character_for_telegram", { _telegram_id: telegramId, _character_id: characterId });

export const adminCreateServer = (telegramId: number, server: {
  name: string; imageUrl: string; priceTon: number; rarity: string;
  miningBoost: number; attackBoost: number; tonMiningRate: number; usdtMiningRate: number;
}) =>
  callRpc<{ success: boolean; serverId: string }>("admin_create_server_for_telegram", {
    _telegram_id: telegramId,
    _name: server.name, _image_url: server.imageUrl, _price_ton: server.priceTon,
    _rarity: server.rarity, _mining_boost: server.miningBoost, _attack_boost: server.attackBoost,
    _ton_mining_rate: server.tonMiningRate, _usdt_mining_rate: server.usdtMiningRate,
  });

export const adminToggleBan = (telegramId: number, profileId: string, isBanned: boolean) =>
  callRpc<{ success: boolean }>("admin_toggle_ban_for_telegram", { _telegram_id: telegramId, _profile_id: profileId, _is_banned: isBanned });

export const adminBroadcastNotification = (telegramId: number, title: string, message: string) =>
  callRpc<{ success: boolean; queued: number }>("admin_broadcast_notification_for_telegram", {
    _telegram_id: telegramId, _title: title, _message: message,
  });
