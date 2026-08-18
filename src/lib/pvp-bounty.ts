// PvP Bounty — local registry (visual UI only, persists per device)
const KEY = "pvp_bounties_v1";

export interface Bounty {
  id: string;
  targetUserId: string;
  targetName: string;
  targetPhoto?: string;
  amountTon: number;
  placedBy: string;
  placedAt: number;
  claimed: boolean;
}

export const loadBounties = (): Bounty[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};

export const saveBounties = (list: Bounty[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-50))); } catch {}
};

export const addBounty = (b: Omit<Bounty, "id" | "placedAt" | "claimed">): Bounty => {
  const bounty: Bounty = { ...b, id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, placedAt: Date.now(), claimed: false };
  const list = loadBounties();
  list.push(bounty);
  saveBounties(list);
  return bounty;
};

export const claimBounty = (id: string) => {
  const list = loadBounties().map(b => b.id === id ? { ...b, claimed: true } : b);
  saveBounties(list);
};

export const activeBountiesFor = (userId: string) =>
  loadBounties().filter(b => !b.claimed && b.targetUserId === userId);