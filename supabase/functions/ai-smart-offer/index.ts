// AI smart offer: personalised discount bonus (redeploy trigger).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { generateText, Output } from "npm:ai";
import { z } from "npm:zod@3.24.2";

const BodySchema = z.object({
  telegram_id: z.number().int().positive(),
  surface: z.enum(["servers", "shop", "ai", "general"]).optional().default("general"),
});

const OfferSchema = z.object({
  bonus_pct: z.number().min(0).max(15),
  headline: z.string().min(3).max(60),
  message: z.string().min(10).max(160),
  cta: z.string().min(2).max(28),
  focus: z.enum(["servers", "shop", "ai", "general"]),
});

const MAX_BONUS = 15;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { telegram_id, surface } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // A live offer is reused so the price a player sees stays stable for 24h.
    const { data: live } = await admin
      .from("ai_smart_offers")
      .select("*")
      .eq("telegram_id", telegram_id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (live) return json({ offer: live, cached: true });

    // ── Behaviour signals the model reasons about ──
    const { data: intents } = await admin
      .from("ton_payment_intents")
      .select("status, amount_nano, base_amount_nano, action, created_at")
      .eq("telegram_id", telegram_id)
      .order("created_at", { ascending: false })
      .limit(60);

    const rows = intents ?? [];
    const confirmed = rows.filter((r) => r.status === "confirmed");
    const abandoned = rows.filter((r) => r.status !== "confirmed");
    const spentTon = confirmed.reduce(
      (sum, r) => sum + Number(r.base_amount_nano ?? r.amount_nano ?? 0) / 1e9,
      0,
    );
    const lastPurchaseAt = confirmed[0]?.created_at ?? null;
    const daysSincePurchase = lastPurchaseAt
      ? Math.floor((Date.now() - new Date(lastPurchaseAt).getTime()) / 86_400_000)
      : null;

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, siri_balance, ton_balance, usdt_balance, created_at")
      .eq("telegram_id", telegram_id)
      .maybeSingle();

    const context = {
      name: profile?.first_name ?? "Player",
      account_age_days: profile?.created_at
        ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86_400_000)
        : 0,
      confirmed_payments: confirmed.length,
      total_spent_ton: Math.round(spentTon * 1000) / 1000,
      abandoned_checkouts: abandoned.length,
      days_since_last_purchase: daysSincePurchase,
      ton_balance: Number(profile?.ton_balance ?? 0),
      gram_balance: Number(profile?.siri_balance ?? 0),
      favourite_actions: confirmed.slice(0, 5).map((r) => r.action),
      surface,
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    let offer: z.infer<typeof OfferSchema>;
    try {
      const result = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        output: Output.object({ schema: OfferSchema }),
        system: [
          "You are the revenue strategist of Nova, a Telegram TON mini-app where players buy mining servers, battle items and an AI Pro plan with TON (called Gram in-app).",
          "Design ONE personalised, honest, 24-hour offer that maximises the chance this player pays today.",
          "bonus_pct is an EXTRA discount stacked on top of the loyalty discount they already have. Rules:",
          "- 0-3 for players who already buy often (they don't need a push).",
          "- 5-10 for players with abandoned checkouts or who went quiet for 7+ days.",
          "- 10-15 only for high-risk churn: many abandoned checkouts and no purchase for 14+ days, or a player who never paid but has been active for a while.",
          "- Use 0 when nothing in the data justifies giving away margin.",
          "Write headline, message and cta in ENGLISH, short, punchy, mobile-sized, no emojis, no fake scarcity or invented numbers.",
          "focus = the product this player is most likely to buy next.",
        ].join("\n"),
        prompt: `Player data (JSON): ${JSON.stringify(context)}`,
      });
      offer = OfferSchema.parse(result.output);
    } catch (aiError) {
      console.error("smart offer generation failed", aiError);
      return json({ error: "Could not build an offer right now" }, 502);
    }

    const bonus = Math.min(Math.max(offer.bonus_pct, 0), MAX_BONUS);
    const { data: saved, error } = await admin
      .from("ai_smart_offers")
      .insert({
        telegram_id,
        bonus_pct: bonus,
        headline: offer.headline,
        message: offer.message,
        cta: offer.cta,
        focus: offer.focus,
        context,
      })
      .select("*")
      .single();
    if (error) {
      console.error("offer insert failed", error.message);
      return json({ error: "Could not save the offer" }, 500);
    }

    return json({ offer: saved, cached: false });
  } catch (error) {
    console.error("ai-smart-offer failed", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
