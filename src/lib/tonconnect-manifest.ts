const PUBLIC_MANIFEST_ENDPOINT =
  "https://ltgampdtawuefwwayncx.supabase.co/functions/v1/tonconnect-manifest";

// Origin baked in at build time (see vite.config.ts). The static manifest in
// dist/ is generated for exactly this origin.
declare const __NOVA_BUILD_ORIGIN__: string;

function buildOrigin(): string {
  try {
    return typeof __NOVA_BUILD_ORIGIN__ === "string" ? __NOVA_BUILD_ORIGIN__ : "";
  } catch {
    return "";
  }
}

/**
 * Wallets refuse a manifest whose `url` does not match the origin that opened
 * the dApp. Deployment hostnames change on every Vercel build, so:
 * - if the running origin matches the origin the static manifest was built
 *   for, serve it same-origin (fastest, most compatible);
 * - otherwise fall back to the public Edge Function, which mirrors the live
 *   origin into the manifest so any preview/deploy URL keeps working.
 */
export function resolveTonManifestUrl(): string {
  if (typeof window !== "undefined") {
    const { origin, protocol } = window.location;

    if (protocol === "https:") {
      if (origin === buildOrigin()) {
        return `${origin}/tonconnect-manifest.json`;
      }
      return `${PUBLIC_MANIFEST_ENDPOINT}?origin=${encodeURIComponent(origin)}`;
    }
  }

  return buildOrigin()
    ? `${buildOrigin()}/tonconnect-manifest.json`
    : `${PUBLIC_MANIFEST_ENDPOINT}`;
}
