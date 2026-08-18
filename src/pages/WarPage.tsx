import SpotlightHero from "@/components/hero/SpotlightHero";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import monster1 from "@/assets/monsters/monster-1.png";
import monster2 from "@/assets/monsters/monster-2.png";
import monster3 from "@/assets/monsters/monster-3.png";
import monster4 from "@/assets/monsters/monster-4.png";
import monster5 from "@/assets/monsters/monster-5.png";
import monster6 from "@/assets/monsters/monster-6.png";
import monster7 from "@/assets/monsters/monster-7.png";
import monster8 from "@/assets/monsters/monster-8.png";
import monster9 from "@/assets/monsters/monster-9.png";
import monster10 from "@/assets/monsters/monster-10.png";
import monster11 from "@/assets/monsters/monster-11.png";
import monster12 from "@/assets/monsters/monster-12.png";
import monster13 from "@/assets/monsters/monster-13.png";
import monster14 from "@/assets/monsters/monster-14.png";
import monster15 from "@/assets/monsters/monster-15.png";
import { getBattleInventoryForTelegram, fetchPublicProfiles, performAttackForTelegram, type BattleInventoryItem } from "@/lib/game-api";
import { sfx } from "@/lib/war-sounds";
import { incrementMetric } from "@/lib/war-quests";
import { ComboMeter } from "@/components/war/ComboMeter";
import { WeakSpot } from "@/components/war/WeakSpot";
import { LastHitTimer } from "@/components/war/LastHitTimer";
import { DamageHeatmap } from "@/components/war/DamageHeatmap";
import { DailyQuestsPanel } from "@/components/war/DailyQuestsPanel";
import BossStage, { type HitSignal } from "@/components/war/BossStage";

const TON_ICON = "/images/gram-icon.png";

const monsterImages: Record<string, string> = {
  "monster-1": monster1, "monster-2": monster2, "monster-3": monster3, "monster-4": monster4,
  "monster-5": monster5, "monster-6": monster6, "monster-7": monster7, "monster-8": monster8,
  "monster-9": monster9, "monster-10": monster10, "monster-11": monster11, "monster-12": monster12,
  "monster-13": monster13, "monster-14": monster14, "monster-15": monster15,
};

interface Character {
  id: string; name: string; image_url: string;
  max_hp: number; current_hp: number; ton_pool: number; is_active: boolean;
}

interface AttackFeed { id: string; username: string; photo_url: string; damage: number; tonReward: number; timestamp: number; }
interface LastAttacker { userId: string; username: string; photo_url: string; damage: number; attackedAt: number; }
interface Contributor { user_id: string; username: string; photo_url?: string; total: number; color: string; }

const HEATMAP_COLORS = [
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--primary))",
  "hsl(var(--ton-blue))",
  "hsl(var(--secondary))",
];

const COMBO_WINDOW_MS = 10000;

const WarPage = () => {
  const { user, setUser } = useApp();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [inBattle, setInBattle] = useState(false);
  const [character, setCharacter] = useState<Character | null>(null);
  const [isAttacking, setIsAttacking] = useState(false);
  const [damageText, setDamageText] = useState<{ damage: number; ton: number; crit?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [freeAttacks, setFreeAttacks] = useState(2);
  const [attackFeed, setAttackFeed] = useState<AttackFeed[]>([]);
  const [inventory, setInventory] = useState<BattleInventoryItem[]>([]);
  const [lastAttacker, setLastAttacker] = useState<LastAttacker | null>(null);
  const [contributors, setContributors] = useState<Map<string, Contributor>>(new Map());
  const [combo, setCombo] = useState(0);
  const [weakSpot, setWeakSpot] = useState<{ x: number; y: number } | null>(null);
  const [, setTick] = useState(0);
  const [hitFx, setHitFx] = useState<HitSignal | null>(null);
  const lastComboAt = useRef(0);
  const weakSpotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const formatTimeAgo = (ts: number) => {
    const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    return `${Math.floor(min / 60)}h ago`;
  };

  const comboMultiplier = useMemo(() => {
    if (combo < 2) return 1;
    if (combo < 5) return 1.5;
    if (combo < 10) return 2;
    return 3;
  }, [combo]);

  const loadActiveCharacter = useCallback(async () => {
    const { data } = await supabase.from("characters").select("*").eq("is_active", true).limit(1);
    if (data && data.length > 0) setCharacter(data[0] as Character);
    else setCharacter(null);
    setLoading(false);
  }, []);

  const loadFreeAttacks = useCallback(async () => {
    if (!user.profileId) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { count } = await supabase.from("attacks").select("*", { count: "exact", head: true })
      .eq("user_id", user.profileId).eq("attack_type", "free").gte("created_at", today.toISOString());
    setFreeAttacks(Math.max(0, 3 - (count || 0)));
  }, [user.profileId]);

  const loadInventory = useCallback(async () => {
    const items = await getBattleInventoryForTelegram(user.telegramUser.id);
    setInventory(items || []);
  }, [user.telegramUser.id]);

  const loadContributors = useCallback(async (charId: string) => {
    const { data } = await supabase.from("attacks")
      .select("user_id, damage")
      .eq("character_id", charId);
    if (!data) return;
    const totals = new Map<string, number>();
    for (const a of data) totals.set(a.user_id, (totals.get(a.user_id) || 0) + a.damage);
    const userIds = [...totals.keys()];
    if (userIds.length === 0) { setContributors(new Map()); return; }
    const profiles = await fetchPublicProfiles(userIds);
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const map = new Map<string, Contributor>();
    sorted.forEach(([uid, total], i) => {
      const p = profiles?.find(pr => pr.id === uid);
      map.set(uid, {
        user_id: uid,
        username: p?.username || p?.first_name || "Unknown",
        photo_url: p?.photo_url || undefined,
        total,
        color: HEATMAP_COLORS[i] || "hsl(var(--muted))",
      });
    });
    setContributors(map);
  }, []);

  useEffect(() => {
    void Promise.all([loadActiveCharacter(), loadFreeAttacks(), loadInventory()]);
  }, [loadActiveCharacter, loadFreeAttacks, loadInventory]);

  useEffect(() => {
    if (character?.id) void loadContributors(character.id);
  }, [character?.id, loadContributors]);

  // Weak spot spawner — every 8-15s when in battle
  useEffect(() => {
    if (!inBattle || !character || character.current_hp <= 0) return;
    const spawn = () => {
      setWeakSpot({ x: 30 + Math.random() * 40, y: 25 + Math.random() * 50 });
      sfx.weakSpot();
      weakSpotTimer.current = setTimeout(() => setWeakSpot(null), 3000);
    };
    const next = 8000 + Math.random() * 7000;
    const t = setTimeout(spawn, next);
    return () => {
      clearTimeout(t);
      if (weakSpotTimer.current) clearTimeout(weakSpotTimer.current);
    };
  }, [inBattle, character?.id, character?.current_hp, weakSpot]);

  // Combo decay
  useEffect(() => {
    if (combo === 0) return;
    const t = setTimeout(() => {
      if (Date.now() - lastComboAt.current >= COMBO_WINDOW_MS) setCombo(0);
    }, COMBO_WINDOW_MS + 100);
    return () => clearTimeout(t);
  }, [combo]);

  // Realtime: characters
  useEffect(() => {
    const channel = supabase.channel('war-characters-global')
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "characters" }, (payload) => {
        const updated = payload.new as Character;
        if (updated.is_active && (!character || character.id !== updated.id)) {
          setCharacter(updated); setContributors(new Map()); return;
        }
        if (character && updated.id === character.id) {
          setCharacter((prev) => prev ? { ...prev, ...updated } : prev);
          if (updated.current_hp <= 0) {
            sfx.bossDeath();
            incrementMetric("kills", 1);
            toast({ title: "Boss Defeated!", description: `${updated.name} destroyed. Next boss incoming...` });
            setTimeout(() => void loadActiveCharacter(), 2000);
          }
        }
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [character?.id, toast, loadActiveCharacter, character]);

  // Realtime: attack feed
  useEffect(() => {
    if (!character) return;
    const channel = supabase.channel(`war-attacks-${character.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "attacks",
        filter: `character_id=eq.${character.id}`,
      }, async (payload) => {
        const attack = payload.new as { id: string; user_id: string; damage: number; metadata: { ton_reward?: number } };
        const profile = await fetchPublicProfiles([attack.user_id]);
        const p = profile?.[0];
        const tonReward = attack.metadata?.ton_reward || 0;
        const username = p?.username || p?.first_name || "Unknown";
        const photo = p?.photo_url || "";

        setLastAttacker((prev) => {
          if (prev && prev.userId === attack.user_id) return { ...prev, damage: attack.damage, attackedAt: Date.now() };
          return { userId: attack.user_id, username, photo_url: photo, damage: attack.damage, attackedAt: Date.now() };
        });

        // Update contributors live
        setContributors((prev) => {
          const map = new Map(prev);
          const existing = map.get(attack.user_id);
          map.set(attack.user_id, {
            user_id: attack.user_id, username,
            photo_url: photo || undefined,
            total: (existing?.total || 0) + attack.damage,
            color: existing?.color || HEATMAP_COLORS[map.size % HEATMAP_COLORS.length],
          });
          return map;
        });

        if (attack.user_id === user.profileId) return;
        setAttackFeed((prev) => [{
          id: attack.id, username, photo_url: photo, damage: attack.damage, tonReward, timestamp: Date.now(),
        }, ...prev].slice(0, 5));
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [character?.id, user.profileId, character]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAttackFeed((prev) => prev.filter((f) => Date.now() - f.timestamp < 5000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleWeakSpotHit = () => {
    setWeakSpot(null);
    incrementMetric("weak_spots", 1);
    sfx.crit();
    void runAttack("free", undefined, true);
  };

  const runAttack = async (
    attackType: "free" | "attack" | "power" | "boost" | "spell",
    packageKey?: string,
    weakSpotBonus = false,
  ) => {
    if (isAttacking || !character || character.current_hp <= 0) return;
    setIsAttacking(true);
    sfx.hit();

    try {
      const result = await performAttackForTelegram({ telegramId: user.telegramUser.id, attackType, packageKey });
      if (!result.success) {
        toast({ title: result.error || "Attack failed", variant: "destructive" });
        return;
      }

      // Apply combo + weak spot multiplier visually (server damage is base)
      const now = Date.now();
      const inWindow = now - lastComboAt.current <= COMBO_WINDOW_MS;
      const newCombo = inWindow ? combo + 1 : 1;
      lastComboAt.current = now;
      setCombo(newCombo);
      if (newCombo >= 2) sfx.combo(Math.min(newCombo, 5));

      const baseDmg = result.damage;
      const totalMult = (weakSpotBonus ? 3 : 1);
      const displayDmg = Math.round(baseDmg * totalMult);
      const tonReward = ((result as { tonReward?: number }).tonReward || 0);

      setDamageText({ damage: displayDmg, ton: tonReward, crit: weakSpotBonus });
      setHitFx({
        id: now,
        damage: displayDmg,
        crit: weakSpotBonus,
        x: weakSpotBonus && weakSpot ? weakSpot.x / 100 : undefined,
        y: weakSpotBonus && weakSpot ? weakSpot.y / 100 : undefined,
      });
      setCharacter((prev) => prev ? { ...prev, ...result.character } : prev);
      setFreeAttacks(result.freeAttacksRemaining);
      setInventory(result.inventory || []);

      // Daily quests progress
      incrementMetric("attacks", 1);
      incrementMetric("damage", baseDmg);

      const balances = (result as { balances?: { ton: number; siri: number; usdt: number } }).balances;
      if (balances) {
        setUser((prev) => ({ ...prev, tonBalance: balances.ton, siriBalance: balances.siri, usdtBalance: balances.usdt }));
      }

      if (tonReward > 0) toast({ title: `+${tonReward} Gram`, description: `Dealt ${displayDmg} damage${weakSpotBonus ? " (3x WEAK SPOT!)" : ""}` });

      if (result.character.current_hp <= 0) {
        sfx.bossDeath();
        toast({ title: "Boss Defeated!", description: `Killing blow! 40% of pool is yours.` });
      }
    } catch {
      toast({ title: "Attack failed", variant: "destructive" });
    } finally {
      setTimeout(() => { setIsAttacking(false); setDamageText(null); }, 600);
    }
  };

  const handleQuestClaim = (rewardTon: number) => {
    setUser((prev) => ({ ...prev, tonBalance: prev.tonBalance + rewardTon }));
    toast({ title: `Quest Reward!`, description: `+${rewardTon} Gram added to balance.` });
  };

  const premiumInventory = inventory.filter((item) => item.quantity > 0);
  const contributorList = useMemo(() => [...contributors.values()].sort((a, b) => b.total - a.total), [contributors]);


  if (loading) {
    return <div className="min-h-screen bg-gradient-dark flex items-center justify-center"><div className="text-muted-foreground font-display animate-pulse">Loading...</div></div>;
  }


  if (!character) {
    return (
      <div className="min-h-screen bg-gradient-dark pb-24 px-4 pt-6 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-display">Loading next boss...</p>
        <Button onClick={() => { setLoading(true); void loadActiveCharacter(); }} className="rounded-2xl font-display">Refresh</Button>
      </div>
    );
  }

  const hpPercent = character.current_hp / character.max_hp * 100;
  const getMonsterImage = (url: string) => monsterImages[url] || monster1;

  if (!inBattle) {
    return (
      <div className="min-h-screen pb-28 flex flex-col">
        <SpotlightHero title="Battle">
        <div className="px-5 pt-8 flex flex-col flex-1">


        <motion.div
          className="text-center mb-5"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Boss Encounter</p>
          <h1 className="text-2xl font-display font-bold text-gradient-primary mt-1">{character.name}</h1>
        </motion.div>

        <motion.div
          className="rounded-3xl glass glass-panel p-5 flex-1 flex flex-col"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="relative flex-1 flex items-center justify-center mb-4 min-h-[200px]">
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-40 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative w-full h-[36vh]">
              <BossStage
                image={getMonsterImage(character.image_url)}
                name={character.name}
                hpPercent={hpPercent}
                hit={null}
              />
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="uppercase tracking-widest text-destructive font-display">HP</span>
              <span className="text-muted-foreground">{character.current_hp.toLocaleString()} / {character.max_hp.toLocaleString()}</span>
            </div>
            <Progress value={hpPercent} className="h-2 bg-muted [&>div]:bg-destructive rounded-full" />
            <DamageHeatmap contributors={contributorList} maxHp={character.max_hp} />
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={TON_ICON} alt="Gram" className="w-6 h-6 rounded-full"  loading="lazy" decoding="async" />
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Reward Pool</p>
                <p className="text-lg font-display font-bold text-primary leading-tight">{(character.ton_pool || 0).toFixed(2)} Gram</p>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground font-display uppercase tracking-widest">Live</span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setInBattle(true)}
              className="flex-1 h-12 rounded-2xl font-display text-sm glow-primary"
              size="lg"
            >
              Join Battle
            </Button>
            <DailyQuestsPanel onClaim={handleQuestClaim} />
          </div>
        </motion.div>
        </div>
        </SpotlightHero>
      </div>);
  }

  return (
    <div className="min-h-screen bg-gradient-dark pb-24 px-4 pt-6 flex flex-col" style={{ height: "100dvh" }}>
      <div className="flex items-center justify-between mb-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setInBattle(false)} className="text-muted-foreground text-xs px-2">Back</Button>
        <div className="glass rounded-xl px-3 py-1 flex items-center gap-1"><img src={TON_ICON} alt="Gram" className="w-4 h-4 rounded-full"  loading="lazy" decoding="async" /><span className="text-xs text-ton-blue font-display">{(character.ton_pool || 0).toFixed(2)}</span></div>
        <DailyQuestsPanel onClaim={handleQuestClaim} />
      </div>

      <div className="relative flex-1 flex flex-col justify-center min-h-0 mb-2">
        <AnimatePresence mode="wait">
          {lastAttacker && (
            <motion.div
              key={lastAttacker.userId + lastAttacker.attackedAt}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.9 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-10 glass rounded-full pl-1 pr-3 py-1 flex items-center gap-2 border border-primary/40 shadow-lg"
            >
              {lastAttacker.photo_url ? (
                <img src={lastAttacker.photo_url} alt="" className="w-6 h-6 rounded-full object-cover"  loading="lazy" decoding="async" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[10px] text-primary font-bold">
                  {lastAttacker.username[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-display text-primary">
                  {lastAttacker.username} <span className="text-destructive">-{lastAttacker.damage}</span>
                </span>
                <span className="text-[9px] text-muted-foreground">{formatTimeAgo(lastAttacker.attackedAt)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <LastHitTimer hpPercent={hpPercent} />
        <ComboMeter combo={combo} multiplier={comboMultiplier} />

        <div
          className="relative w-full flex-1 min-h-0 cursor-pointer select-none"
          style={{ maxHeight: "80%" }}
          onPointerDown={() => { if (freeAttacks > 0) void runAttack("free"); }}
        >
          <BossStage
            image={getMonsterImage(character.image_url)}
            name={character.name}
            hpPercent={hpPercent}
            hit={hitFx}
          />
        </div>

        {weakSpot && <WeakSpot x={weakSpot.x} y={weakSpot.y} onHit={handleWeakSpotHit} />}

        <AnimatePresence>
          {damageText !== null && (
            <motion.div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-center pointer-events-none" initial={{ opacity: 1, y: 0, scale: 1 }} animate={{ opacity: 0, y: -60, scale: damageText.crit ? 2 : 1.5 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
              <div className={`text-3xl font-display font-bold ${damageText.crit ? "text-accent" : "text-destructive"}`}>-{damageText.damage}{damageText.crit ? "!" : ""}</div>
              {damageText.ton > 0 && <div className="text-sm font-display text-ton-blue">+{damageText.ton} Gram</div>}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-2 left-0 right-0 space-y-1 px-2">
          <AnimatePresence>
            {attackFeed.map((feed) => (
              <motion.div key={feed.id} className="glass rounded-lg px-3 py-1.5 text-xs flex items-center gap-2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                {feed.photo_url ? <img src={feed.photo_url} alt="" className="w-5 h-5 rounded-full"  loading="lazy" decoding="async" /> : <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[8px] text-primary font-bold">{feed.username[0]}</div>}
                <span className="text-primary font-display">{feed.username}</span>
                <span className="text-destructive font-bold">-{feed.damage}</span>
                {feed.tonReward > 0 && <span className="text-ton-blue font-display">+{feed.tonReward} Gram</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="mb-2 px-2 shrink-0">
        <div className="flex justify-between text-xs mb-1"><span className="text-destructive font-display">{character.name}</span><span className="text-muted-foreground">{character.current_hp} / {character.max_hp}</span></div>
        <Progress value={hpPercent} className={`h-3 bg-muted [&>div]:bg-destructive ${isAttacking ? "animate-hp-damage" : ""}`} />
        <DamageHeatmap contributors={contributorList} maxHp={character.max_hp} />
      </div>

      {premiumInventory.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {premiumInventory.map((item) => (
            <Button key={item.id} variant="outline" className="shrink-0 rounded-xl text-xs" onClick={() => void runAttack(item.category as "attack" | "power" | "boost" | "spell", item.package_key)}>
              {item.package_name} ({item.quantity})
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 shrink-0 pb-1">
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button onClick={() => void runAttack("free")} disabled={isAttacking || character.current_hp <= 0 || freeAttacks <= 0} className="w-full h-11 rounded-2xl font-display text-sm bg-destructive hover:bg-destructive/90">Attack ({freeAttacks})</Button>
        </motion.div>
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button onClick={() => navigate("/attack-shop")} className="w-full h-11 rounded-2xl font-display text-sm">Shop</Button>
        </motion.div>
      </div>
    </div>);
};

export default WarPage;
