import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.24.2";

const BodySchema = z.object({
  telegram_id: z.number().int().positive(),
  action: z.enum(["deposit", "wallet_verification", "server", "battle_item", "ai_pro", "custom_server"]),
  amount_ton: z.number().positive().max(100000),
  metadata: z.record(z.unknown()).optional().default({}),
});

// Discounts only apply to product purchases — never to deposits or wallet checks,
// where the user picks the amount themselves.
const DISCOUNTABLE = new Set(["server", "battle_item", "ai_pro", "custom_server"]);
const MAX_DISCOUNT_PCT = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const baseNano = Math.round(parsed.data.amount_ton * 1_000_000_000);
    let discountPct = 0;
    let discountReason: string | null = null;

    if (DISCOUNTABLE.has(parsed.data.action)) {
      // The discount is always recomputed on the server so the client can never
      // pick its own price.
      const { data: discount } = await admin.rpc("get_payment_discount_for_telegram", {
        _telegram_id: parsed.data.telegram_id,
      });
      const pct = Number((discount as Record<string, unknown> | null)?.discount_pct ?? 0);
      if (Number.isFinite(pct) && pct > 0) {
        discountPct = Math.min(pct, MAX_DISCOUNT_PCT);
        discountReason = (discount as Record<string, unknown>)?.first_purchase
          ? "first_purchase"
          : String((discount as Record<string, unknown>)?.tier ?? "tier");
      }
    }

    const amountNano = Math.max(1, Math.round(baseNano * (1 - discountPct / 100)));
    const memo = `nova:${crypto.randomUUID()}`;

    const { data, error } = await admin.from("ton_payment_intents").insert({
      telegram_id: parsed.data.telegram_id,
      action: parsed.data.action,
      amount_nano: amountNano,
      base_amount_nano: baseNano,
      discount_pct: discountPct,
      discount_reason: discountReason,
      memo,
      metadata: parsed.data.metadata,
    }).select("id,memo,expires_at,amount_nano,base_amount_nano,discount_pct,discount_reason").single();
    if (error) {
      console.error("intent insert failed", error.message);
      return json({ error: "Could not prepare payment" }, 500);
    }
    return json({
      ...data,
      amount_ton: amountNano / 1_000_000_000,
      base_amount_ton: baseNano / 1_000_000_000,
    });
  } catch (error) {
    console.error("create intent failed", error);
    return json({ error: "Unexpected error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
