import { admin, corsHeaders, json, loadSubscription, PLAN_LIMITS, type PlanId } from "./shared.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const profileId = typeof body.profileId === "string" ? body.profileId : null;
    const action = body.action === "subscribe" ? "subscribe" : "status";

    if (!profileId) return json({ error: "Missing profile" }, 400);

    const db = admin();

    if (action === "status") {
      return json(await loadSubscription(db, profileId));
    }

    const plan = body.plan as PlanId;
    if (!plan || !["starter", "pro", "ultra"].includes(plan)) {
      return json({ error: "Invalid plan" }, 400);
    }

    const { error } = await db.rpc("ai_activate_plan", {
      _profile_id: profileId,
      _plan: plan,
      _price: PLAN_LIMITS[plan].price,
    });

    if (error) {
      const msg = error.message.includes("insufficient_balance")
        ? "Not enough USDT balance to activate this plan."
        : error.message.includes("profile_not_found")
          ? "Profile not found."
          : error.message;
      return json({ error: msg }, 400);
    }

    return json(await loadSubscription(db, profileId));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
