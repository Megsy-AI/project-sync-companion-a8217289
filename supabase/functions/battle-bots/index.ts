import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BOT_NAMES = [
  "CryptoHunter", "TonWarrior", "DragonSlayer", "ShadowBlade",
  "NightFury", "StormRider", "IronFist", "PhantomX",
  "BlazeMaster", "FrostBite", "ThunderBolt", "VenomStrike",
  "StarKnight", "DarkReaper", "SilverWolf", "GoldRush",
  "CyberNinja", "RocketPunch", "TurboMax", "MegaBlast",
];

// Realistic attack patterns - bots attack with varying intensity
const ATTACK_PATTERNS = [
  { type: "quick_strike", minDmg: 2, maxDmg: 6, chance: 0.4 },
  { type: "normal_hit", minDmg: 5, maxDmg: 12, chance: 0.35 },
  { type: "heavy_blow", minDmg: 10, maxDmg: 20, chance: 0.2 },
  { type: "critical_hit", minDmg: 18, maxDmg: 35, chance: 0.05 },
];

function pickAttackPattern(): { type: string; damage: number } {
  const roll = Math.random();
  let cumulative = 0;
  for (const pattern of ATTACK_PATTERNS) {
    cumulative += pattern.chance;
    if (roll <= cumulative) {
      const damage = Math.floor(Math.random() * (pattern.maxDmg - pattern.minDmg + 1)) + pattern.minDmg;
      return { type: pattern.type, damage };
    }
  }
  return { type: "normal_hit", damage: Math.floor(Math.random() * 8) + 5 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get active character
  const { data: chars } = await supabase
    .from("characters")
    .select("id, name, current_hp, max_hp, ton_pool, is_active")
    .eq("is_active", true)
    .limit(1);

  const character = chars?.[0];
  if (!character || character.current_hp <= 0) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_active_character" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pick 2-5 random bot attacks per invocation for more activity
  const numAttacks = Math.floor(Math.random() * 4) + 2;
  let totalDamage = 0;
  let totalTonAdded = 0;
  const attackLog: any[] = [];

  for (let i = 0; i < numAttacks; i++) {
    const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const botTelegramId = 900000000 + BOT_NAMES.indexOf(botName);

    // Find or create bot profile
    let { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_id", botTelegramId)
      .maybeSingle();

    if (!profile) {
      const hex = Math.abs(botTelegramId).toString(16).padStart(32, "0").slice(-32);
      const uuidStr = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

      const { data: newProfile } = await supabase
        .from("profiles")
        .insert({
          telegram_id: botTelegramId,
          first_name: botName,
          username: botName.toLowerCase(),
          user_id: uuidStr,
          referral_code: `BOT${botTelegramId}`,
        })
        .select("id")
        .single();

      if (!newProfile) continue;
      profile = newProfile;
    }

    // Use realistic attack patterns
    const { type: attackType, damage } = pickAttackPattern();
    const tonReward = +(damage * 0.002).toFixed(4);

    // Check character still alive
    const { data: freshChar } = await supabase
      .from("characters")
      .select("current_hp, ton_pool")
      .eq("id", character.id)
      .single();

    if (!freshChar || freshChar.current_hp <= 0) break;

    const newHp = Math.max(freshChar.current_hp - damage, 0);

    // Record attack
    await supabase.from("attacks").insert({
      user_id: profile.id,
      character_id: character.id,
      damage,
      attack_type: "free",
      is_killing_blow: newHp <= 0,
      metadata: { package_key: null, ton_reward: tonReward, is_bot: true, bot_attack_type: attackType },
    });

    // Update character HP and pool
    await supabase
      .from("characters")
      .update({
        current_hp: newHp,
        ton_pool: (freshChar.ton_pool || 0) + tonReward,
        defeated_by: newHp <= 0 ? profile.id : undefined,
        is_active: newHp > 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", character.id);

    // Give bot TON reward - use try/catch instead of .catch()
    try {
      await supabase.rpc("sync_mining_for_telegram", { _telegram_id: botTelegramId });
    } catch {
      // ignore bot mining sync errors
    }

    totalDamage += damage;
    totalTonAdded += tonReward;
    attackLog.push({ bot: botName, damage, type: attackType, tonReward });

    if (newHp <= 0) break;

    // Random delay between bot attacks (50-200ms) for realism
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 150) + 50));
  }

  return new Response(
    JSON.stringify({ ok: true, attacks: attackLog.length, totalDamage, totalTonAdded, log: attackLog }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
