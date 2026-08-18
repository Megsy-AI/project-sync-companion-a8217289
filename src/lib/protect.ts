/**
 * Client-side hardening. This raises the cost of casually copying the UI or
 * poking at the app, it is NOT a security boundary — all real rules live in
 * Supabase RLS and edge functions.
 */

export function installProtection() {
  if (import.meta.env.DEV) return;

  const block = (e: Event) => {
    e.preventDefault();
    return false;
  };

  document.addEventListener("contextmenu", block);
  document.addEventListener("dragstart", block);
  document.addEventListener("copy", (e) => {
    const target = e.target as HTMLElement | null;
    const editable = target?.closest("input, textarea, [contenteditable='true']");
    if (!editable) block(e);
  });

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    const devtools =
      k === "f12" ||
      (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(k)) ||
      (e.metaKey && e.altKey && ["i", "j", "c"].includes(k)) ||
      ((e.ctrlKey || e.metaKey) && ["u", "s"].includes(k));
    if (devtools) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Prevent long-press image saving / text selection on mobile
  const style = document.createElement("style");
  style.textContent = `img{-webkit-touch-callout:none;-webkit-user-drag:none;user-select:none}`;
  document.head.appendChild(style);
}

/** Detects that the app is running outside the intended origin (clone check). */
export function assertOrigin(allowed: string[]) {
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}
