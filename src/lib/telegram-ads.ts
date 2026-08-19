// Rewarded ads for a Telegram Mini App — RichAds only (tg-ob.js).
// Nothing loads until the user taps "Watch". Every step is time-boxed so the
// button can never stay stuck on "Loading...".

const RICHADS_SDK = "https://richinfo.co/richpartners/telegram/js/tg-ob.js";

const env = import.meta.env as Record<string, string | undefined>;
const win = () => window as any;

const RICHADS_PUB_ID = env.VITE_RICHADS_PUB_ID || win().RICHADS_PUB_ID || "998796";
/** One RichAds app per enabled format (e.g. Interstitial, Playable). */
const RICHADS_APP_IDS = (env.VITE_RICHADS_APP_IDS || win().RICHADS_APP_IDS || win().RICHADS_APP_ID || "8586")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

/** Hard ceiling for the whole showAd() call, so the UI always unblocks. */
const TOTAL_BUDGET_MS = 45000;

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

/* --------------------------------------------------------------- richads */

/** One initialised controller per appId (the SDK is per pubId+appId). */
const controllers = new Map<string, any>();

const getRichController = async (appId: string): Promise<any> => {
  const cached = controllers.get(appId);
  if (cached) return cached;

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

  const controller = new Ctor();
  try {
    await withTimeout(
      Promise.resolve(
        controller.initialize({
          pubId: String(RICHADS_PUB_ID),
          appId: String(appId),
          debug: false,
        }),
      ),
      12000,
      "richads init",
    );
  } catch (e: any) {
    lastAdError = `richads init ${appId}: ${e?.message ?? "failed"}`;
    return null;
  }

  controllers.set(appId, controller);
  return controller;
};

type RichAdMethod =
  | "triggerInterstitialMixed"
  | "triggerInterstitialVideo"
  | "triggerInterstitialBanner"
  | "triggerNativeNotification";

const methodsForController = (controller: any): RichAdMethod[] => {
  const enabled = new Set<string>();
  const typeMap = controller.activeWidgetTypesMap;
  if (typeMap && typeof typeMap.keys === "function") {
    for (const type of typeMap.keys()) enabled.add(String(type).toUpperCase());
  }

  // The SDK configuration for app 8586 exposes INTERSTITIAL_MIXED_TRIGGER.
  // Prefer exactly the format RichAds enabled instead of trying unrelated
  // formats that can produce a misleading no-fill response.
  if ([...enabled].some((type) => type.includes("INTERSTITIAL_MIXED_TRIGGER"))) {
    return ["triggerInterstitialMixed"];
  }

  const methods: RichAdMethod[] = [];
  if ([...enabled].some((type) => type.includes("VIDEO"))) {
    methods.push("triggerInterstitialVideo");
  }
  if ([...enabled].some((type) => type.includes("BANNER"))) {
    methods.push("triggerInterstitialBanner");
  }
  if ([...enabled].some((type) => type.includes("PUSH") || type.includes("NATIVE"))) {
    methods.push("triggerNativeNotification");
  }

  // Older SDK builds do not expose activeWidgetTypesMap. The documented
  // interstitial methods are safer fallbacks than native notifications.
  return methods.length
    ? methods
    : ["triggerInterstitialVideo", "triggerInterstitialBanner", "triggerInterstitialMixed"];
};

const showFromApp = async (appId: string): Promise<boolean> => {
  const controller = await getRichController(appId);
  if (!controller) return false;

  for (const method of methodsForController(controller)) {
    const fn = controller[method];
    if (typeof fn !== "function") continue;
    const budget = method === "triggerNativeNotification" ? 10000 : 35000;
    try {
      const out = fn.call(controller);
      const res =
        out && typeof out.then === "function"
          ? await withTimeout(out, budget, `richads ${method}`)
          : out;

      // RichAds resolves after the ad lifecycle completes and rejects on
      // no-fill/error. Keep the false guard for older SDK variants.
      if (res === false || (res && typeof res === "object" && "success" in res && !res.success)) {
        lastAdError = `richads ${appId} ${method}: Ads not found`;
        continue;
      }
      return true;
    } catch (e: any) {
      lastAdError = `richads ${appId} ${method}: ${e?.message ?? "no fill"}`;
    }
  }
  return false;
};

const showRichAds = async (): Promise<boolean> => {
  for (const appId of RICHADS_APP_IDS) {
    if (await showFromApp(appId)) return true;
  }
  if (!lastAdError) lastAdError = "No ad available right now";
  return false;
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

  try {
    return await withTimeout(showRichAds(), TOTAL_BUDGET_MS, "ad");
  } catch (e: any) {
    if (!lastAdError) lastAdError = `richads: ${e?.message ?? "timeout"}`;
    return false;
  }
};
