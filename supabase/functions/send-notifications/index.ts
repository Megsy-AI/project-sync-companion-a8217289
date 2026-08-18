import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN_HELLO") || Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!TELEGRAM_BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN_HELLO (or TELEGRAM_BOT_TOKEN) not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  // Fetch pending notifications (large batch, parallel send)
  const { data: notifications, error: fetchErr } = await supabase
    .from("telegram_notifications")
    .select("id, profile_id, title, message, notification_type")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(500);

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!notifications || notifications.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get unique profile IDs and fetch telegram_ids
  const profileIds = [...new Set(notifications.map((n: any) => n.profile_id))];
  const profileMap = new Map<string, number>();
  // Batch profile lookup to avoid URL length limits with .in()
  const BATCH = 100;
  for (let i = 0; i < profileIds.length; i += BATCH) {
    const slice = profileIds.slice(i, i + BATCH);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, telegram_id")
      .in("id", slice);
    for (const p of profiles || []) {
      profileMap.set(p.id, p.telegram_id);
    }
  }

  let sentCount = 0;
  let errorCount = 0;

  // Process in parallel chunks to respect Telegram ~25-30 msg/sec rate
  const CHUNK_SIZE = 25;
  for (let i = 0; i < notifications.length; i += CHUNK_SIZE) {
    const chunk = notifications.slice(i, i + CHUNK_SIZE);
    const sentIds: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    await Promise.all(chunk.map(async (notif: any) => {
      const telegramId = profileMap.get(notif.profile_id);
      if (!telegramId) {
        failed.push({ id: notif.id, reason: "No telegram_id found" });
        return;
      }
      try {
        const text = `<b>${notif.title}</b>\n\n${notif.message}`;
        const res = await fetch(`${BASE_URL}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "HTML" }),
        });
        const result = await res.json();
        if (result.ok) {
          sentIds.push(notif.id);
        } else {
          failed.push({ id: notif.id, reason: JSON.stringify(result.description || result).slice(0, 400) });
        }
      } catch (err) {
        failed.push({ id: notif.id, reason: String(err).slice(0, 400) });
      }
    }));

    if (sentIds.length > 0) {
      await supabase
        .from("telegram_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .in("id", sentIds);
      sentCount += sentIds.length;
    }
    for (const f of failed) {
      await supabase
        .from("telegram_notifications")
        .update({ status: "failed", error_message: f.reason, updated_at: new Date().toISOString() })
        .eq("id", f.id);
      errorCount++;
    }
    // small pause between chunks to stay under Telegram global rate limit
    if (i + CHUNK_SIZE < notifications.length) await new Promise((r) => setTimeout(r, 1100));
  }

  return new Response(
    JSON.stringify({ ok: true, sent: sentCount, errors: errorCount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
