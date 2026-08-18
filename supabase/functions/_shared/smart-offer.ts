/**
 * AI-personalised purchase offer.
 *
 * Lives in _shared and is invoked through the `telegram-bot` function because
 * brand new edge functions do not deploy on this project.
 */

const MAX_BONUS = 15;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface SmartOfferResult {
  success: boolean;
  cached?: boolean;
  offer?: Record<string, unknown>;
  error?: string;
}

const OFFER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bonus_pct", "headline", "message", "cta", "focus"],
  properties: {
    bonus_pct: { type: "number", description: "Extra discount percent, 0 to 15" },
    headline: { type: "string" },
    message: { type: "string" },
    cta: { type: "string" },
    focus: { type: "string", enum: ["servers", "shop", "ai", "general"] },
  },
} as const;

const SYSTEM_PROMPT = [
  "You are the revenue strategist of Nova, a Telegram TON mini-app where players buy mining servers, battle items and an AI Pro plan with TON (called Gram in-app).",
  "Design ONE personalised, honest, 24-hour offer that maximises the chance this player pays today.",
  "bonus_pct is an EXTRA discount stacked on top of the loyalty discount the player already has:",
  "- 0-3 for players who already buy often.",
  "- 5-10 for players with abandoned checkouts or quiet for 7+ days.",
  "- 10-15 only for high churn risk: many abandoned checkouts and no purchase for 14+ days, or an active player who never paid.",
  "- Use 0 when the data does not justify giving away margin.",
  "headline (max 60 chars), message (max 160 chars) and cta (max 28 chars) must be ENGLISH, short, punchy, no emojis, no invented numbers or fake scarcity.",
  "focus = the product this player is most likely to buy next.",
].join("\n");

export async function buildSmartOffer(
  supabase: any,
  telegramId: number,
  surface: string,
): Promise<SmartOfferResult> {
  if (!Number.isFinite(telegramId) || telegramId <= 0) {
    return { success: false, error: "invalid_telegram_id" };
  }

  // A live offer is reused so the price a player sees stays stable for 24h.
  const { data: live } = await supabase
    .from("ai_smart_offers")
    .select("*")
    .eq("telegram_id", telegramId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live) return { success: true, cached: true, offer: live };

  const { data: intents } = await supabase
    .from("ton_payment_intents")
    .select("status, amount_nano, base_amount_nano, action, created_at")
    .eq("telegram_id", telegramId)
    .order("created_at", { ascending: false })
    .limit(60);

  const rows: any[] = intents ?? [];
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const abandoned = rows.filter((r) => r.status !== "confirmed");
  const spentTon = confirmed.reduce(
    (sum, r) => sum + Number(r.base_amount_nano ?? r.amount_nano ?? 0) / 1e9,
    0,
  );
  const lastPurchaseAt = confirmed[0]?.created_at ?? null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, siri_balance, ton_balance, created_at")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const context = {
    name: profile?.first_name ?? "Player",
    account_age_days: profile?.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86_400_000)
      : 0,
    confirmed_payments: confirmed.length,
    total_spent_ton: Math.round(spentTon * 1000) / 1000,
    abandoned_checkouts: abandoned.length,
    days_since_last_purchase: lastPurchaseAt
      ? Math.floor((Date.now() - new Date(lastPurchaseAt).getTime()) / 86_400_000)
      : null,
    ton_balance: Number(profile?.ton_balance ?? 0),
    gram_balance: Number(profile?.siri_balance ?? 0),
    recent_actions: confirmed.slice(0, 5).map((r) => r.action),
    surface,
  };

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { success: false, error: "ai_not_configured" };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Player data (JSON): ${JSON.stringify(context)}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "smart_offer", strict: true, schema: OFFER_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("smart offer gateway error", res.status, detail.slice(0, 300));
    return { success: false, error: res.status === 429 ? "rate_limited" : res.status === 402 ? "no_credits" : "ai_failed" };
  }

  let parsed: any;
  try {
    const payload = await res.json();
    parsed = JSON.parse(payload?.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    console.error("smart offer parse failed", e);
    return { success: false, error: "ai_failed" };
  }

  const bonus = Math.min(Math.max(Number(parsed?.bonus_pct ?? 0) || 0, 0), MAX_BONUS);
  const focus = ["servers", "shop", "ai", "general"].includes(parsed?.focus) ? parsed.focus : "general";

  const { data: saved, error } = await supabase
    .from("ai_smart_offers")
    .insert({
      telegram_id: telegramId,
      bonus_pct: bonus,
      headline: String(parsed?.headline ?? "Your personal offer").slice(0, 60),
      message: String(parsed?.message ?? "").slice(0, 160),
      cta: String(parsed?.cta ?? "Claim now").slice(0, 28),
      focus,
      context,
    })
    .select("*")
    .single();

  if (error) {
    console.error("smart offer insert failed", error.message);
    return { success: false, error: "save_failed" };
  }

  return { success: true, cached: false, offer: saved };
}
