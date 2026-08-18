import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  fetchOwnProfile,
  findOrCreateProfile,
  startMiningForTelegram,
  syncMiningForTelegram,
  attachReferralForTelegram,
  type TelegramUserPayload,
} from "@/lib/game-api";
import { getTelegramUserSync, resolveTelegramUser, getReferralStartParam, clearReferralStartParam } from "@/lib/telegram-user";


interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface UserData {
  telegramUser: TelegramUser;
  profileId: string | null;
  siriBalance: number;
  tonBalance: number;
  usdtBalance: number;
  rewardBalance: number;
  rewardExpiresAt: string | null;
  isMining: boolean;
  miningEndTime: number | null;
  referralCode: string;
  level: number;
}

interface AppContextType {
  user: UserData;
  setUser: React.Dispatch<React.SetStateAction<UserData>>;
  startMining: () => void;
  getMiningTimeLeft: () => string;
  getMiningProgress: () => number;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const defaultUser: UserData = {
  telegramUser: {
    id: 123456789,
    first_name: "Player",
    last_name: "",
    username: "siri_player",
    photo_url: undefined,
  },
  profileId: null,
  siriBalance: 0,
  tonBalance: 0,
  usdtBalance: 0,
  rewardBalance: 0,
  rewardExpiresAt: null,
  isMining: false,
  miningEndTime: null,
  referralCode: "",
  level: 1,
};

const MINING_DURATION = 8 * 60 * 60 * 1000;
const AppContext = createContext<AppContextType | undefined>(undefined);

const getTelegramUser = (): TelegramUserPayload => {
  const u = getTelegramUserSync();
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name || "",
    username: u.username || "",
    photo_url: u.photo_url,
  };
};


export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserData>(() => ({
    ...defaultUser,
    telegramUser: getTelegramUser(),
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();
    try { tg.requestFullscreen?.(); } catch {}
    try { tg.disableVerticalSwipes?.(); } catch {}
    try { tg.setBackgroundColor?.("#ffffff"); } catch {}
    try { tg.setHeaderColor?.("#ffffff"); } catch {}

    // Keep the app content clear of Telegram's own header / status bar.
    const applyInsets = () => {
      const top = Math.max(
        Number(tg.contentSafeAreaInset?.top ?? 0),
        Number(tg.safeAreaInset?.top ?? 0),
        tg.isFullscreen ? 56 : 0,
      );
      document.documentElement.style.setProperty("--tg-safe-area-top", `${top}px`);
    };
    applyInsets();
    try { tg.onEvent?.("safeAreaChanged", applyInsets); } catch {}
    try { tg.onEvent?.("contentSafeAreaChanged", applyInsets); } catch {}
    try { tg.onEvent?.("fullscreenChanged", applyInsets); } catch {}
    return () => {
      try { tg.offEvent?.("safeAreaChanged", applyInsets); } catch {}
      try { tg.offEvent?.("contentSafeAreaChanged", applyInsets); } catch {}
      try { tg.offEvent?.("fullscreenChanged", applyInsets); } catch {}
    };
  }, []);


  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
    ]);

  const refreshProfile = useCallback(async () => {
    try {
      const resolved = await resolveTelegramUser();
      const telegramUser: TelegramUserPayload = {
        id: resolved.id,
        first_name: resolved.first_name,
        last_name: resolved.last_name || "",
        username: resolved.username || "",
        photo_url: resolved.photo_url,
      };

      const profile = await withTimeout(findOrCreateProfile(telegramUser), 10000);

      // Link the inviter (from ?startapp=CODE) once, before loading balances.
      const refCode = getReferralStartParam();
      if (refCode && !profile.referred_by) {
        try {
          const res = await withTimeout(attachReferralForTelegram(telegramUser.id, refCode), 8000);
          if (res?.success || res?.reason === "already_referred" || res?.reason === "invalid_code") {
            clearReferralStartParam();
          }
        } catch (e) {
          console.warn("Referral attach failed:", e);
        }
      }

      
      let miningState: any = { isMining: false, endsAt: null, balances: null };
      try {
        miningState = await withTimeout(syncMiningForTelegram(telegramUser.id), 8000);
      } catch (e) {
        console.warn("Mining sync failed, using defaults:", e);
      }

      let freshProfile: any = null;
      try {
        freshProfile = await withTimeout(fetchOwnProfile(telegramUser.id), 8000);
      } catch (e) {
        console.warn("Fresh profile fetch failed:", e);
      }

      const balances = miningState.balances ?? {
        siri: Number(freshProfile?.siri_balance ?? profile.siri_balance ?? 0),
        ton: Number(freshProfile?.ton_balance ?? profile.ton_balance ?? 0),
        usdt: Number(freshProfile?.usdt_balance ?? profile.usdt_balance ?? 0),
      };

      setUser((prev) => ({
        ...prev,
        telegramUser,
        profileId: profile.id,
        siriBalance: balances.siri,
        tonBalance: balances.ton,
        usdtBalance: balances.usdt,
        rewardBalance: Number(freshProfile?.reward_balance ?? profile.reward_balance ?? 0),
        rewardExpiresAt: freshProfile?.reward_expires_at ?? (profile as any)?.reward_expires_at ?? null,
        referralCode: freshProfile?.referral_code || profile.referral_code || "",
        isMining: miningState.isMining,
        miningEndTime: miningState.endsAt ? new Date(miningState.endsAt).getTime() : null,
      }));
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const startMining = useCallback(() => {
    void (async () => {
      try {
        const result = await startMiningForTelegram(user.telegramUser.id);
        if (!result.success) return;

        setUser((prev) => ({
          ...prev,
          isMining: true,
          miningEndTime: result.endsAt ? new Date(result.endsAt).getTime() : Date.now() + MINING_DURATION,
        }));
      } catch (error) {
        console.error("Mining start error:", error);
      }
    })();
  }, [user.telegramUser.id]);

  const getMiningTimeLeft = useCallback(() => {
    if (!user.miningEndTime) return "00:00:00";
    const diff = user.miningEndTime - Date.now();
    if (diff <= 0) return "00:00:00";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }, [user.miningEndTime]);

  const getMiningProgress = useCallback(() => {
    if (!user.miningEndTime) return 0;
    const elapsed = MINING_DURATION - (user.miningEndTime - Date.now());
    return Math.min(100, Math.max(0, (elapsed / MINING_DURATION) * 100));
  }, [user.miningEndTime]);

  useEffect(() => {
    if (!user.isMining || !user.miningEndTime) return;

    const interval = setInterval(() => {
      if (Date.now() >= user.miningEndTime) {
        void refreshProfile();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [refreshProfile, user.isMining, user.miningEndTime]);

  return (
    <AppContext.Provider value={{ user, setUser, startMining, getMiningTimeLeft, getMiningProgress, loading, refreshProfile }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
