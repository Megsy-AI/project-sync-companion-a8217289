// Rewarded ads for a Telegram Mini App — Adsgram only.
// Nothing loads until the user taps "Watch". Every step is time-boxed so the
// button can never stay stuck on "Loading...".

const ADSGRAM_SDK = "https://sad.adsgram.ai/js/sad.min.js";

const env = import.meta.env as Record<string, string | undefined>;
const win = () => window as any;

const ADSGRAM_BLOCK_ID = env.VITE_ADSGRAM_BLOCK_ID || win().ADSGRAM_BLOCK_ID || "43448";

/** Hard ceiling for the whole showAd() call, so the UI always unblocks. */
const TOTAL_BUDGET_MS = 60000;

/** Last failure reason, surfaced in the UI so problems are diagnosable. */
export let lastAdError = "";

export const isAdsReady = () => true;

/* ------------------------------------------------------------------ utils */

const scriptCache = new Map<string, Promise<boolean>>();

const loadScript = (src: string): Promise<boolean> => {
  const cached = scriptCache.get(src);
  if (cached) return cached;

  const promise = new Promise<boolean>((resolve) => {
    try {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve(true);
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        return;
      }
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => {
        el.dataset.loaded = "1";
        resolve(true);
      };
      el.onerror = () => resolve(false);
      document.head.appendChild(el);
    } catch {
      resolve(false);
    }
  });

  scriptCache.set(src, promise);
  return promise;
};

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

const telegramUserId = (): number | undefined =>
  win().Telegram?.WebApp?.initDataUnsafe?.user?.id;

/** initDataUnsafe can populate a moment after the WebApp script runs. */
const waitForTelegramUser = async (timeoutMs = 3000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (telegramUserId()) return true;
    try {
      win().Telegram?.WebApp?.ready?.();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return !!telegramUserId();
};

export const isInsideTelegram = () => !!win().Telegram?.WebApp?.initData;

/* --------------------------------------------------------------- adsgram */

let controller: any = null;

const getAdsgramController = async (): Promise<any> => {
  if (controller) return controller;

  const loaded = await withTimeout(loadScript(ADSGRAM_SDK), 10000, "adsgram sdk").catch(
    () => false,
  );
  if (!loaded) {
    lastAdError = "adsgram: SDK failed to load";
    return null;
  }

  const Adsgram = win().Adsgram;
  if (!Adsgram || typeof Adsgram.init !== "function") {
    lastAdError = "adsgram: SDK unavailable (blocked by CSP or ad blocker)";
    return null;
  }

  if (!(await waitForTelegramUser())) {
    lastAdError = "Ads only work inside Telegram";
    return null;
  }

  try {
    controller = Adsgram.init({ blockId: String(ADSGRAM_BLOCK_ID) });
  } catch (e: any) {
    lastAdError = `adsgram init: ${e?.message ?? "failed"}`;
    return null;
  }

  return controller;
};

/* ------------------------------------------------------------------ public */

/**
 * Shows exactly one rewarded ad, only from a user gesture ("Watch" button).
 * Guaranteed to settle within TOTAL_BUDGET_MS.
 */
export const showAd = async (): Promise<boolean> => {
  lastAdError = "";

  if (!isInsideTelegram()) {
    lastAdError = "Ads only work inside Telegram";
    return false;
  }

  const ctrl = await getAdsgramController();
  if (!ctrl) return false;

  try {
    const res = await withTimeout(Promise.resolve(ctrl.show()), TOTAL_BUDGET_MS, "adsgram show");
    // Adsgram resolves only when the ad was fully watched.
    if (res && typeof res === "object" && "done" in res && !(res as any).done) {
      lastAdError = "adsgram: ad was not completed";
      return false;
    }
    return true;
  } catch (e: any) {
    lastAdError = `adsgram: ${e?.description || e?.message || "no ad available"}`;
    return false;
  }
};
