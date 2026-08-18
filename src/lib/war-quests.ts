// Daily War Quests — local progress tracking (resets at UTC midnight)
const KEY = "war_daily_quests_v1";

export interface DailyQuest {
  id: string;
  title: string;
  target: number;
  rewardTon: number;
  metric: "attacks" | "kills" | "damage" | "weak_spots";
}

export const DAILY_QUESTS: DailyQuest[] = [
  { id: "atk50", title: "Land 50 Attacks", target: 50, rewardTon: 0.05, metric: "attacks" },
  { id: "kill3", title: "Kill 3 Bosses", target: 3, rewardTon: 0.15, metric: "kills" },
  { id: "dmg500", title: "Deal 500 Damage", target: 500, rewardTon: 0.08, metric: "damage" },
  { id: "weak5", title: "Hit 5 Weak Spots", target: 5, rewardTon: 0.1, metric: "weak_spots" },
];

interface QuestState {
  date: string; // YYYY-MM-DD UTC
  progress: Record<string, number>;
  claimed: Record<string, boolean>;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

const empty = (): QuestState => ({ date: todayKey(), progress: {}, claimed: {} });

export const loadQuests = (): QuestState => {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as QuestState;
    if (parsed.date !== todayKey()) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
};

export const saveQuests = (s: QuestState) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
};

export const incrementMetric = (metric: DailyQuest["metric"], by = 1) => {
  const s = loadQuests();
  for (const q of DAILY_QUESTS) {
    if (q.metric !== metric) continue;
    s.progress[q.id] = Math.min(q.target, (s.progress[q.id] || 0) + by);
  }
  saveQuests(s);
  return s;
};

export const claimQuest = (id: string) => {
  const s = loadQuests();
  s.claimed[id] = true;
  saveQuests(s);
  return s;
};