import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  isTelegramAdmin, adminGetDashboard, adminUpsertTask, adminToggleTask,
  adminDeleteTask, adminCreateCharacter, adminActivateCharacter,
  adminCreateServer, adminToggleBan, adminBroadcastNotification,
  type AdminDashboard,
} from "@/lib/game-api";
import { Star, Pin } from "lucide-react";

const AdminPage = () => {
  const { user } = useApp();
  const { toast } = useToast();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [newTask, setNewTask] = useState({ title: "", reward_amount: 50, reward_type: "siri", task_type: "social", link: "" });
  const [newChar, setNewChar] = useState({ name: "", image_url: "monster-1", max_hp: 100 });
  const [newServer, setNewServer] = useState({ name: "", priceTon: 5, rarity: "common", miningBoost: 10, attackBoost: 10, tonMiningRate: 0.15, usdtMiningRate: 1.5 });
  const [broadcast, setBroadcast] = useState({ title: "", message: "" });
  const [rewardLoading, setRewardLoading] = useState(false);
  const [welcomeImageUrl, setWelcomeImageUrl] = useState("");

  const telegramId = user.telegramUser.id;

  useEffect(() => {
    void (async () => {
      try {
        const ok = await isTelegramAdmin(telegramId);
        setAllowed(ok);
        if (ok) await loadDashboard();
      } finally {
        setChecking(false);
      }
    })();
  }, [telegramId]);

  const loadDashboard = async () => {
    const data = await adminGetDashboard(telegramId);
    if (data.success) setDashboard(data);
  };

  const handleAddTask = async () => {
    if (!newTask.title) return;
    await adminUpsertTask(telegramId, newTask);
    toast({ title: "Task Added" });
    setNewTask({ title: "", reward_amount: 50, reward_type: "siri", task_type: "social", link: "" });
    await loadDashboard();
  };

  const handleToggleTask = async (id: string, isActive: boolean) => {
    await adminToggleTask(telegramId, id, !isActive);
    await loadDashboard();
  };

  const handleDeleteTask = async (id: string) => {
    await adminDeleteTask(telegramId, id);
    toast({ title: "Task Deleted" });
    await loadDashboard();
  };

  const handlePinTask = async (taskId: string, currentlyPinned: boolean) => {
    const { error } = await (supabase as any).rpc("admin_pin_task_for_telegram", {
      _telegram_id: telegramId,
      _task_id: taskId,
      _is_pinned: !currentlyPinned,
    });
    if (!error) {
      toast({ title: currentlyPinned ? "Unpinned" : "Pinned to top" });
      await loadDashboard();
    }
  };

  const handleAddCharacter = async () => {
    if (!newChar.name) return;
    await adminCreateCharacter(telegramId, newChar.name, newChar.image_url, newChar.max_hp);
    toast({ title: "Boss Added" });
    setNewChar({ name: "", image_url: "monster-1", max_hp: 100 });
    await loadDashboard();
  };

  const handleActivateCharacter = async (id: string) => {
    await adminActivateCharacter(telegramId, id);
    toast({ title: "Boss Activated & HP Reset" });
    await loadDashboard();
  };

  const handleAddServer = async () => {
    if (!newServer.name) return;
    await adminCreateServer(telegramId, { ...newServer, imageUrl: newServer.name.toLowerCase().replace(/\s+/g, "-") });
    toast({ title: "Server Added" });
    setNewServer({ name: "", priceTon: 5, rarity: "common", miningBoost: 10, attackBoost: 10, tonMiningRate: 0.15, usdtMiningRate: 1.5 });
    await loadDashboard();
  };

  const handleBan = async (profileId: string, currentBan: boolean) => {
    await adminToggleBan(telegramId, profileId, !currentBan);
    toast({ title: currentBan ? "Unbanned" : "Banned" });
    await loadDashboard();
  };

  const handleBroadcast = async () => {
    if (!broadcast.title || !broadcast.message) return;
    const result = await adminBroadcastNotification(telegramId, broadcast.title, broadcast.message);
    toast({ title: "Broadcast Queued", description: `${result.queued} notifications queued` });
    setBroadcast({ title: "", message: "" });
    await loadDashboard();
  };

  const handleActivateReward = async () => {
    if (rewardLoading) return;
    setRewardLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_activate_reward_for_telegram", {
        _telegram_id: telegramId,
        _reward_amount: 1500,
      });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }

      toast({ title: "Reward Activated!", description: `$1,500 added to ${data?.updated || 'all'} users (48h timer started)` });
      await loadDashboard();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setRewardLoading(false);
    }
  };

  const handleSetWelcomeImage = async () => {
    if (!welcomeImageUrl.trim()) return;
    const { data, error } = await (supabase as any).rpc("admin_set_welcome_image_for_telegram", {
      _telegram_id: telegramId,
      _url: welcomeImageUrl.trim(),
    });
    if (!error && data?.success) {
      toast({ title: "Welcome image updated!" });
      setWelcomeImageUrl("");
    } else {
      toast({ title: "Error", description: error?.message || data?.error || "Failed", variant: "destructive" });
    }
  };

  if (checking) return <div className="min-h-screen bg-gradient-dark flex items-center justify-center"><p className="text-muted-foreground font-display animate-pulse">Checking...</p></div>;
  if (!allowed) return <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4"><p className="text-destructive font-display text-center">Access Denied</p></div>;
  if (!dashboard) return <div className="min-h-screen bg-gradient-dark flex items-center justify-center"><p className="text-muted-foreground font-display animate-pulse">Loading...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-dark pb-24 px-4 pt-6">
      <h1 className="text-xl font-display font-bold text-center text-gradient-primary mb-4">Admin Panel</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Users", value: dashboard.stats.total_users, color: "text-primary" },
          { label: "Gram Vol.", value: dashboard.stats.total_ton_volume, color: "text-ton-blue" },
          { label: "Attacks", value: dashboard.stats.total_attacks, color: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-3 text-center">
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-display ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="w-full bg-muted/50 rounded-2xl h-10 mb-4 grid grid-cols-8">
          {["users", "tasks", "bosses", "servers", "notify", "txns", "reward", "bot"].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="rounded-xl font-display text-[7px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground capitalize">{tab}</TabsTrigger>
          ))}
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {dashboard.users.map((u: any) => (
              <div key={u.id} className="glass rounded-xl p-3 text-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-foreground font-semibold">{u.first_name} {u.last_name}</span>
                    {u.username && <span className="text-muted-foreground ml-1">@{u.username}</span>}
                  </div>
                  <Button size="sm" variant={u.is_banned ? "default" : "destructive"} onClick={() => handleBan(u.id, u.is_banned)} className="text-[9px] rounded-lg h-6 px-2">
                    {u.is_banned ? "Unban" : "Ban"}
                  </Button>
                </div>
                <div className="flex gap-3 mt-1 text-muted-foreground flex-wrap">
                  <span>NOVA: {Number(u.siri_balance).toFixed(0)}</span>
                  <span>Gram: {Number(u.ton_balance).toFixed(2)}</span>
                  <span>USDT: {Number(u.usdt_balance).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <div className="glass rounded-2xl p-4 mb-4 space-y-2">
            <p className="text-xs font-display text-primary mb-1">Add New Task</p>
            <Input placeholder="Title" value={newTask.title} onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))} className="rounded-xl text-xs" />
            <Input placeholder="Link (optional)" value={newTask.link} onChange={(e) => setNewTask((p) => ({ ...p, link: e.target.value }))} className="rounded-xl text-xs" />
            <div className="flex gap-2">
              <Input type="number" placeholder="Reward" value={newTask.reward_amount} onChange={(e) => setNewTask((p) => ({ ...p, reward_amount: Number(e.target.value) }))} className="rounded-xl text-xs" />
              <select value={newTask.reward_type} onChange={(e) => setNewTask((p) => ({ ...p, reward_type: e.target.value }))} className="bg-muted rounded-xl px-2 text-xs text-foreground">
                <option value="siri">NOVA</option><option value="ton">Gram</option><option value="usdt">USDT</option>
              </select>
              <select value={newTask.task_type} onChange={(e) => setNewTask((p) => ({ ...p, task_type: e.target.value }))} className="bg-muted rounded-xl px-2 text-xs text-foreground">
                <option value="social">Social</option><option value="daily">Daily</option><option value="special">Special</option>
              </select>
            </div>
            <Button onClick={handleAddTask} className="w-full rounded-xl font-display text-xs">Add Task</Button>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {dashboard.tasks.map((t: any) => {
              const isPinned = t.is_pinned === true;
              return (
                <div key={t.id} className={`glass rounded-xl p-3 text-xs flex justify-between items-center gap-2 ${isPinned ? "border border-primary/30" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      {isPinned && <Star className="w-3 h-3 text-primary fill-primary shrink-0" />}
                      <p className="text-foreground font-semibold truncate">{t.title}</p>
                    </div>
                    <p className="text-muted-foreground">+{t.reward_amount} {t.reward_type} · {t.task_type}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant={isPinned ? "default" : "outline"} onClick={() => handlePinTask(t.id, isPinned)} className="text-[9px] rounded-lg h-6 px-2" title="Pin to top">
                      <Pin className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant={t.is_active ? "destructive" : "default"} onClick={() => handleToggleTask(t.id, t.is_active)} className="text-[9px] rounded-lg h-6 px-2">{t.is_active ? "Off" : "On"}</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteTask(t.id)} className="text-[9px] rounded-lg h-6 px-2">Del</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Bosses Tab */}
        <TabsContent value="bosses">
          <div className="glass rounded-2xl p-4 mb-4 space-y-2">
            <p className="text-xs font-display text-primary mb-1">Add New Boss</p>
            <Input placeholder="Name" value={newChar.name} onChange={(e) => setNewChar((p) => ({ ...p, name: e.target.value }))} className="rounded-xl text-xs" />
            <div className="flex gap-2">
              <select value={newChar.image_url} onChange={(e) => setNewChar((p) => ({ ...p, image_url: e.target.value }))} className="bg-muted rounded-xl px-2 text-xs text-foreground flex-1">
                <option value="monster-1">Monster 1</option><option value="monster-2">Monster 2</option><option value="monster-3">Monster 3</option>
              </select>
              <Input type="number" placeholder="HP" value={newChar.max_hp} onChange={(e) => setNewChar((p) => ({ ...p, max_hp: Number(e.target.value) }))} className="rounded-xl text-xs" />
            </div>
            <Button onClick={handleAddCharacter} className="w-full rounded-xl font-display text-xs">Add Boss</Button>
          </div>
          <div className="space-y-2">
            {dashboard.characters.map((c: any) => (
              <div key={c.id} className="glass rounded-xl p-3 text-xs flex justify-between items-center">
                <div>
                  <p className="text-foreground font-semibold">{c.name}</p>
                  <p className="text-muted-foreground">HP: {c.current_hp}/{c.max_hp} · Pool: {Number(c.ton_pool).toFixed(2)} Gram</p>
                </div>
                <Button size="sm" variant={c.is_active ? "outline" : "default"} onClick={() => handleActivateCharacter(c.id)} className="text-[9px] rounded-lg h-6 px-2">{c.is_active ? "Active" : "Activate"}</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Servers Tab */}
        <TabsContent value="servers">
          <div className="glass rounded-2xl p-4 mb-4 space-y-2">
            <p className="text-xs font-display text-primary mb-1">Add New Server</p>
            <Input placeholder="Name" value={newServer.name} onChange={(e) => setNewServer((p) => ({ ...p, name: e.target.value }))} className="rounded-xl text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Price Gram" value={newServer.priceTon} onChange={(e) => setNewServer((p) => ({ ...p, priceTon: Number(e.target.value) }))} className="rounded-xl text-xs" />
              <select value={newServer.rarity} onChange={(e) => setNewServer((p) => ({ ...p, rarity: e.target.value }))} className="bg-muted rounded-xl px-2 text-xs text-foreground">
                <option value="common">Common</option><option value="rare">Rare</option><option value="epic">Epic</option><option value="legendary">Legendary</option>
              </select>
              <Input type="number" placeholder="Mining %" value={newServer.miningBoost} onChange={(e) => setNewServer((p) => ({ ...p, miningBoost: Number(e.target.value) }))} className="rounded-xl text-xs" />
              <Input type="number" placeholder="Attack %" value={newServer.attackBoost} onChange={(e) => setNewServer((p) => ({ ...p, attackBoost: Number(e.target.value) }))} className="rounded-xl text-xs" />
              <Input type="number" step="0.01" placeholder="Gram/day" value={newServer.tonMiningRate} onChange={(e) => setNewServer((p) => ({ ...p, tonMiningRate: Number(e.target.value) }))} className="rounded-xl text-xs" />
              <Input type="number" step="0.01" placeholder="USDT/day" value={newServer.usdtMiningRate} onChange={(e) => setNewServer((p) => ({ ...p, usdtMiningRate: Number(e.target.value) }))} className="rounded-xl text-xs" />
            </div>
            <Button onClick={handleAddServer} className="w-full rounded-xl font-display text-xs">Add Server</Button>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {dashboard.servers.map((s: any) => (
              <div key={s.id} className="glass rounded-xl p-3 text-xs">
                <div className="flex justify-between"><span className="text-foreground font-semibold">{s.name}</span><span className="text-ton-blue font-display">{Number(s.price_ton)} Gram</span></div>
                <p className="text-muted-foreground mt-1">{s.rarity} · Mining +{s.mining_boost}% · Atk +{s.attack_boost}% · Gram +{Number(s.ton_mining_rate).toFixed(2)} · USDT +{Number(s.usdt_mining_rate).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notify">
          <div className="glass rounded-2xl p-4 mb-4 space-y-2">
            <p className="text-xs font-display text-primary mb-1">Broadcast to All Users</p>
            <Input placeholder="Title" value={broadcast.title} onChange={(e) => setBroadcast((p) => ({ ...p, title: e.target.value }))} className="rounded-xl text-xs" />
            <Input placeholder="Message" value={broadcast.message} onChange={(e) => setBroadcast((p) => ({ ...p, message: e.target.value }))} className="rounded-xl text-xs" />
            <Button onClick={handleBroadcast} className="w-full rounded-xl font-display text-xs">Send Broadcast</Button>
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {dashboard.notifications.map((n: any) => (
              <div key={n.id} className="glass rounded-xl p-3 text-xs">
                <div className="flex justify-between"><span className="text-foreground font-semibold">{n.title}</span><span className={`font-display ${n.status === "sent" ? "text-neon-green" : n.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{n.status}</span></div>
                <p className="text-muted-foreground truncate">{n.message}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="txns">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {dashboard.transactions.map((tx: any) => (
              <div key={tx.id} className="glass rounded-xl p-3 text-xs">
                <div className="flex justify-between"><span className="text-foreground font-semibold">{tx.type}</span><span className="text-ton-blue">{Number(tx.amount).toFixed(2)} {tx.currency.toUpperCase()}</span></div>
                <p className="text-muted-foreground">{tx.status} · {new Date(tx.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Reward Activation Tab */}
        <TabsContent value="reward">
          <div className="glass rounded-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-neon-green/20 flex items-center justify-center mx-auto">
              <span className="text-3xl font-bold text-neon-green">$</span>
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-foreground">$1,500 Reward System</h3>
              <p className="text-xs text-muted-foreground mt-2">
                Activate the $1,500 locked reward for all users. Expires after 48 hours automatically.
              </p>
            </div>
            <div className="text-left glass rounded-xl p-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                <span className="text-primary font-bold">Step 1:</span> Pay 2 Gram activation fee (fixed)
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className="text-primary font-bold">Step 2:</span> Purchase a server (NFT)
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className="text-primary font-bold">Step 3:</span> Kill a monster in battle
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className="text-primary font-bold">Step 4:</span> Buy 50 attacks
              </p>
              <p className="text-[10px] text-destructive/70 mt-2 italic">
                All conditions are hidden. Users discover them one by one. Auto-expires in 48h.
              </p>
            </div>
            <Button 
              onClick={handleActivateReward} 
              disabled={rewardLoading}
              className="w-full h-12 rounded-xl font-display text-sm glow-primary"
            >
              {rewardLoading ? "Activating..." : "Activate $1,500 for All Users"}
            </Button>
          </div>
        </TabsContent>

        {/* Bot Settings Tab */}
        <TabsContent value="bot">
          <div className="glass rounded-2xl p-4 space-y-4">
            <p className="text-xs font-display text-primary mb-1">Welcome Message Image</p>
            <p className="text-[11px] text-muted-foreground">Set the image URL that appears in the /start welcome message</p>
            <Input placeholder="Image URL (e.g. https://...)" value={welcomeImageUrl} onChange={(e) => setWelcomeImageUrl(e.target.value)} className="rounded-xl text-xs" />
            <Button onClick={handleSetWelcomeImage} className="w-full rounded-xl font-display text-xs">Set Welcome Image</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;
