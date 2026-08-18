// Resolves the public origin a deployment is actually served from.
// Vercel changes the deployment hostname on every build, so the TON Connect
// manifest must be generated from the environment instead of a hard-coded URL.
export function resolveAppOrigin(env = process.env) {
  const candidates = [
    env.PUBLIC_APP_ORIGIN,
    env.VITE_PUBLIC_APP_ORIGIN,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_URL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const value = raw.startsWith("http") ? raw : `https://${raw}`;
    try {
      return new URL(value).origin;
    } catch {
      // try the next candidate
    }
  }

  return "https://spark-companion-link-33a5cbb564649.vercel.app";
}
