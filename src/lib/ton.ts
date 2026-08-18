import type { TonConnectUI } from "@tonconnect/ui-react";
import { beginCell } from "@ton/core";
import { supabase } from "@/integrations/supabase/client";

/** Single source of truth for the project treasury wallet. */
export const TREASURY_ADDRESS = "UQAp1QxnLJ2z44IooUovvtVShw7hJBEdxCRV3RlbCYC3D8qj";

/** Estimated fee shown in payment guidance. The connected wallet calculates the exact fee. */
export const TON_FEE_BUFFER = 0.05;

export type PaymentErrorCode =
  | "not_connected"
  | "wrong_network"
  | "invalid_amount"
  | "balance_unavailable"
  | "insufficient_funds"
  | "cancelled"
  | "failed";

export class PaymentError extends Error {
  code: PaymentErrorCode;
  constructor(code: PaymentErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PaymentError";
  }
}

export type TonPaymentAction = "deposit" | "wallet_verification" | "server" | "battle_item" | "ai_pro" | "custom_server";
type PaymentOptions = {
  amountTon: number;
  telegramId: number;
  action: TonPaymentAction;
  metadata?: Record<string, unknown>;
};

const toNano = (amountTon: number) => {
  const [whole = "0", fraction = ""] = amountTon.toFixed(9).split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
};

export const buildCommentPayload = (memo: string) => {
  if (!/^nova:[a-f0-9-]{36}$/.test(memo)) {
    throw new PaymentError("failed", "Invalid payment reference");
  }
  return beginCell().storeUint(0, 32).storeStringTail(memo).endCell().toBoc().toString("base64");
};

/** Reads the on-chain balance (in Gram/TON) of an address. Returns null when unavailable. */
export const fetchTonBalance = async (address: string): Promise<number | null> => {
  if (!address) return null;
  const endpoints = [
    `https://tonapi.io/v2/accounts/${address}`,
    `https://toncenter.com/api/v2/getAddressInformation?address=${encodeURIComponent(address)}`,
  ];
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) continue;
      const json: any = await res.json();
      const raw = json?.balance ?? json?.result?.balance;
      if (raw === undefined || raw === null) continue;
      const nano = Number(raw);
      if (!Number.isFinite(nano)) continue;
      return nano / 1e9;
    } catch {
      /* try next endpoint */
    }
  }
  return null;
};

const isCancellation = (err: unknown) => {
  const msg = String((err as any)?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("reject") ||
    msg.includes("cancel") ||
    msg.includes("declin") ||
    msg.includes("aborted") ||
    msg.includes("user")
  );
};

/**
 * Opens the wallet modal and resolves once the user is connected (or times out).
 * Without this the first tap on a pay button did nothing visible.
 */
/**
 * Sends Gram (TON) to the project treasury with pre-flight validation.
 * Throws a PaymentError with a specific code so callers can show accurate feedback.
 */
export const sendTonPayment = async (
  tonConnectUI: TonConnectUI,
  opts: PaymentOptions,
): Promise<{ boc: string; intentId: string; memo: string; amountTon: number; discountPct: number }> => {
  const amountTon = Number(opts.amountTon);
  if (!Number.isFinite(amountTon) || amountTon <= 0) {
    throw new PaymentError("invalid_amount", "Enter a valid Gram amount");
  }

  if (!tonConnectUI.connected) {
    throw new PaymentError("not_connected", "Connect your wallet first");
  }

  // Right after a fresh connection the account object can still be empty for a
  // moment (the bridge is restoring the session). Wait for it instead of failing.
  let account = tonConnectUI.account;
  for (let i = 0; i < 20 && !account?.address; i++) {
    await new Promise((r) => setTimeout(r, 250));
    account = tonConnectUI.account;
  }
  if (!account?.address) {
    throw new PaymentError("not_connected", "Reconnect your wallet and try again");
  }
  if (account.chain && account.chain !== "-239") {
    throw new PaymentError("wrong_network", "Switch your wallet to TON Mainnet and try again");
  }

  const { data: intent, error: intentError } = await supabase.functions.invoke("create-ton-payment-intent", {
    body: { telegram_id: opts.telegramId, action: opts.action, amount_ton: amountTon, metadata: opts.metadata ?? {} },
  });
  if (intentError || !intent?.id || !intent?.memo) {
    throw new PaymentError("failed", "Could not prepare payment. Please try again.");
  }

  // The backend re-prices the intent with the player's loyalty / first-purchase
  // discount, so the wallet must always charge the amount the server decided.
  const chargedNano = BigInt(intent.amount_nano ?? toNano(amountTon).toString());
  const chargedTon = Number(chargedNano) / 1e9;
  const discountPct = Number(intent.discount_pct ?? 0);
  const result0 = { intentId: intent.id as string, memo: intent.memo as string, amountTon: chargedTon, discountPct };

  const message = {
    address: TREASURY_ADDRESS,
    amount: chargedNano.toString(),
    payload: buildCommentPayload(intent.memo),
  };


  let sendError: unknown = null;
  try {
    // No `from` / `network` fields: some wallets reject the request when the
    // address format they report differs from the one we echo back.
    const result = (await Promise.race([
      tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [message],
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 120_000)),
    ])) as { boc?: string } | null;
    if (result?.boc) return { boc: result.boc, ...result0 };
  } catch (err) {
    sendError = err;
    console.error("[ton] sendTransaction failed", err);
  }

  // Inside Telegram the wallet often confirms the transfer on-chain without ever
  // returning the signed BOC to the mini app (the bridge callback is lost when
  // the user switches back). The memo is unique per payment, so ask the backend
  // to look for it on-chain before giving up.
  const confirmed = await waitForIntentOnChain(intent.id, account.address);
  if (confirmed) return { boc: "", ...result0 };

  if (sendError && isCancellation(sendError)) {
    throw new PaymentError("cancelled", "Payment cancelled in your wallet");
  }
  throw new PaymentError(
    "failed",
    "We couldn't confirm the transfer yet. If your wallet shows it as sent, it will be credited shortly.",
  );
};

/** Polls the backend, which checks the treasury wallet on-chain for this memo. */
const waitForIntentOnChain = async (intentId: string, sender?: string | null) => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/verify-ton-transaction`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ intent_id: intentId, sender: sender ?? null, quick: true }),
      });
      const json = await res.json().catch(() => null);
      if (json?.verified) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  return false;
};
