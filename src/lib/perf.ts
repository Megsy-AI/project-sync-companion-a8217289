// Detects low-powered devices (most Telegram in-app WebViews on mid-range
// phones) so we can drop the heaviest visual effects: the looping video
// background and the large backdrop blurs.

export const isLowEndDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) return true;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  return false;
};

let cached: boolean | null = null;
export const lowEndDevice = () => {
  if (cached === null) cached = isLowEndDevice();
  return cached;
};

/** Adds `perf-lite` to <html> on weak devices so CSS can reduce blur cost. */
export const applyPerfMode = () => {
  if (lowEndDevice()) document.documentElement.classList.add("perf-lite");
};
