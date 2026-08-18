export interface TelegramUserInfo {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  isReal: boolean;
}

const DEMO_USER: TelegramUserInfo = {
  id: 123456789,
  first_name: "Player",
  last_name: "",
  username: "siri_player",
  photo_url: undefined,
  isReal: false,
};

const CACHE_KEY = "nova_tg_user";

const normalize = (raw: any): TelegramUserInfo | null => {
  const id = Number(raw?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    first_name: raw.first_name || "Player",
    last_name: raw.last_name || "",
    username: raw.username || "",
    photo_url: raw.photo_url || undefined,
    isReal: true,
  };
};

/** Parse the `user` field out of a raw initData query string. */
const parseInitData = (initData?: string | null): TelegramUserInfo | null => {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) return null;
    return normalize(JSON.parse(userJson));
  } catch {
    return null;
  }
};

/** Telegram passes `tgWebAppData` in the URL hash/query on some clients. */
const fromLocation = (): TelegramUserInfo | null => {
  try {
    const sources = [window.location.hash.replace(/^#/, ""), window.location.search.replace(/^\?/, "")];
    for (const src of sources) {
      if (!src) continue;
      const params = new URLSearchParams(src);
      const data = params.get("tgWebAppData");
      const parsed = parseInitData(data);
      if (parsed) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
};

const readCache = (): TelegramUserInfo | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeCache = (user: TelegramUserInfo) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
};

export const isInsideTelegram = (): boolean => {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.initData || tg?.initDataUnsafe?.user) return true;
  if (/Telegram/i.test(navigator.userAgent)) return true;
  return /tgWebApp/i.test(window.location.hash + window.location.search);
};

/** Reads the real Telegram user from any available source. */
export const readTelegramUser = (): TelegramUserInfo | null => {
  const tg = (window as any).Telegram?.WebApp;
  return (
    normalize(tg?.initDataUnsafe?.user) ??
    parseInitData(tg?.initData) ??
    fromLocation() ??
    null
  );
};

/**
 * Waits (briefly) for the Telegram WebApp SDK to expose the user, since the
 * script can finish initializing after React mounts. Falls back to the cached
 * real user, then to the demo user for browser previews.
 */
export const resolveTelegramUser = async (timeoutMs = 3000): Promise<TelegramUserInfo> => {
  const deadline = Date.now() + timeoutMs;
  const shouldWait = isInsideTelegram();

  do {
    const user = readTelegramUser();
    if (user) {
      writeCache(user);
      return user;
    }
    if (!shouldWait) break;
    await new Promise((r) => setTimeout(r, 100));
  } while (Date.now() < deadline);

  return readCache() ?? DEMO_USER;
};

export const getTelegramUserSync = (): TelegramUserInfo =>
  readTelegramUser() ?? readCache() ?? DEMO_USER;

const REF_CACHE_KEY = "nova_ref_code";

/** Reads the invite code passed via ?startapp=CODE / ?start=CODE (Telegram start_param). */
export const getReferralStartParam = (): string | null => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const fromSdk = tg?.initDataUnsafe?.start_param;
    let code: string | null = fromSdk ? String(fromSdk) : null;

    if (!code) {
      const sources = [window.location.hash.replace(/^#/, ""), window.location.search.replace(/^\?/, "")];
      for (const src of sources) {
        if (!src) continue;
        const params = new URLSearchParams(src);
        const direct = params.get("startapp") || params.get("tgWebAppStartParam") || params.get("ref");
        if (direct) { code = direct; break; }
        const data = params.get("tgWebAppData");
        if (data) {
          const inner = new URLSearchParams(data).get("start_param");
          if (inner) { code = inner; break; }
        }
      }
    }

    if (code) {
      localStorage.setItem(REF_CACHE_KEY, code);
      return code;
    }
    return localStorage.getItem(REF_CACHE_KEY);
  } catch {
    return null;
  }
};

export const clearReferralStartParam = () => {
  try { localStorage.removeItem(REF_CACHE_KEY); } catch { /* ignore */ }
};
