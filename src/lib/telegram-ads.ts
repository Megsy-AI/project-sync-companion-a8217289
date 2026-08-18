// Rewarded ads for a Telegram Mini App.
// Primary: Adsgram (documented promise API, reliable no-fill signal).
// Fallback: RichAds tg-ob.js (triggerInterstitialMixed is the only real trigger
// in the live SDK bundle; its no-fill resolves false / "Ads not found").
// Nothing is loaded until the user taps "Watch" — no auto banners, no push ads.

const RICHADS_SDK = "https://richinfo.co/richpartners/telegram/js/tg-ob.js";
const ADSGRAM_SDK = "https://sad.adsgram.ai/js/sad.min.js";

const env = import.meta.env as Record<string, string | undefined>;
const win = () => window as any;

const RICHADS_PUB_ID = env.VITE_RICHADS_PUB_ID || win().RICHADS_PUB_ID || "998796";
const RICHADS_APP_ID = env.VITE_RICHADS_APP_ID || win().RICHADS_APP_ID || "8586";
const ADSGRAM_BLOCK_ID = env.VITE_ADSGRAM_BLOCK_ID || win().ADSGRAM_BLOCK_ID || "43448";
/** Forces Adsgram to serve a guaranteed test creative (stats-free). */
const ADSGRAM_DEBUG = env.VITE_ADSGRAM_DEBUG === "true";

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

let adsgramController: any = null;

const getAdsgram = async (): Promise<any> => {
  if (adsgramController) return adsgramController;
  if (!ADSGRAM_BLOCK_ID) return null;

  const loaded = await withTimeout(loadScript(ADSGRAM_SDK), 8000, "adsgram sdk").catch(
    () => false,
  );
  if (!loaded || typeof win().Adsgram?.init !== "function") return null;

  try {
    // init() is memoised per blockId by the SDK itself.
    adsgramController = win().Adsgram.init({
      blockId: String(ADSGRAM_BLOCK_ID),
      debug: ADSGRAM_DEBUG,
      debugConsole: false,
    });
  } catch {
    adsgramController = null;
  }
  return adsgramController;
};

const showAdsgram = async (): Promise<boolean> => {
  const ctrl = await getAdsgram();
  if (!ctrl) return false;
  try {
    // Resolves only when the viewer watched the rewarded ad to the end.
    const res = await withTimeout(Promise.resolve(ctrl.show()), 180000, "adsgram show");
    if (res && res.done === false) {
      lastAdError = "adsgram: ad not completed";
      return false;
    }
    return true;
  } catch (e: any) {
    lastAdError = `adsgram: ${e?.description || e?.message || "no fill"}`;
    return false;
  }
};

/* --------------------------------------------------------------- richads */

let richController: any = null;
let richInitialised = false;

const getRichController = async (): Promise<any> => {
  if (richController && richInitialised) return richController;

  const loaded = await withTimeout(loadScript(RICHADS_SDK), 8000, "richads sdk").catch(
    () => false,
  );
  if (!loaded) {
    lastAdError = "richads: SDK failed to load";
    return null;
  }

  const Ctor = win().TelegramAdsController;
  if (typeof Ctor !== "function") {
    lastAdError = "richads: SDK unavailable (blocked by CSP or ad blocker)";
    return null;
  }

  if (!(await waitForTelegramUser())) {
    lastAdError = "Ads only work inside Telegram";
    return null;
  }

  if (!richController) richController = new Ctor();

  try {
    // initialize() is memoised per pubId+appId and resolves once config loads.
    await withTimeout(
      Promise.resolve(
        richController.initialize({
          pubId: String(RICHADS_PUB_ID),
          appId: String(RICHADS_APP_ID),
          debug: false,
        }),
      ),
      15000,
      "richads init",
    );
    richInitialised = true;
  } catch (e: any) {
    richInitialised = false;
    richController = null; // drop the half-initialised instance
    lastAdError = `richads init: ${e?.message ?? "failed"}`;
    return null;
  }

  return richController;
};

/** Only these exist in the live tg-ob.js bundle, highest paying first. */
const RICH_METHODS = ["triggerInterstitialMixed", "triggerNativeNotification"] as const;

const showRichAds = async (): Promise<boolean> => {
  const controller = await getRichController();
  if (!controller) return false;

  // activeWidgetTypesMap is filled server-side with the formats enabled for
  // this app; when present we can skip triggers that will silently no-fill.
  const enabled = new Set<string>();
  const typeMap = controller.activeWidgetTypesMap;
  if (typeMap && typeof typeMap.keys === "function") {
    for (const type of typeMap.keys()) enabled.add(String(type).toUpperCase());
  }

  const allowed = (method: string) => {
    if (!enabled.size) return true;
    if (method === "triggerInterstitialMixed") {
      return [...enabled].some((t) => t.includes("INTERSTITIAL") || t.includes("VIDEO"));
    }
    return [...enabled].some((t) => t.includes("PUSH") || t.includes("NATIVE"));
  };

  for (const method of RICH_METHODS) {
    const fn = controller[method];
    if (typeof fn !== "function" || !allowed(method)) continue;
    // Interstitials can legitimately run for a full video; native pushes are
    // instant, so a long wait there only means the trigger never settles.
    const budget = method === "triggerInterstitialMixed" ? 90000 : 15000;
    try {
      const out = fn.call(controller);
      const res =
        out && typeof out.then === "function"
          ? await withTimeout(out, budget, `richads ${method}`)
          : out;

      // The SDK reports no-fill as `false` / "Ads not found".
      if (res === false) {
        lastAdError = `richads ${method}: Ads not found`;
        continue;
      }
      return true;
    } catch (e: any) {
      lastAdError = `richads ${method}: ${e?.message ?? "no fill"}`;
    }
  }

  if (!lastAdError) {
    lastAdError = enabled.size
      ? "No ad fill for the enabled RichAds formats"
      : "No ad format is enabled for this Mini App";
  }
  return false;
};

/* ------------------------------------------------------------------ public */

/**
 * Shows exactly one rewarded ad, only from a user gesture ("Watch" button).
 * Adsgram first (clean reward semantics), RichAds as fallback.
 * Every step is time-boxed so the button never stays stuck on "Loading...".
 */
export const showAd = async (): Promise<boolean> => {
  lastAdError = "";

  if (!isInsideTelegram()) {
    lastAdError = "Ads only work inside Telegram";
    return false;
  }

  if (await showAdsgram()) return true;
  const adsgramError = lastAdError;

  if (await showRichAds()) return true;

  if (adsgramError && lastAdError && adsgramError !== lastAdError) {
    lastAdError = `${adsgramError} | ${lastAdError}`;
  }
  return lastAdError ? false : ((lastAdError = "No ad available right now"), false);
};
