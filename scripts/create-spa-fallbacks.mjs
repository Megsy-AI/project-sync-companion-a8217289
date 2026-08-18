import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveAppOrigin } from "./app-origin.mjs";

// Vercel normally applies the SPA rewrite from vercel.json. These static
// entry points also make every public app route independently addressable,
// even when a deployment's rewrite settings are stale or overridden.
const routes = [
  "/war",
  "/tasks",
  "/servers",
  "/wallet",
  "/101",
  "/staking",
  "/attack-shop",
  "/ai",
];

const distDir = resolve("dist");
const appShell = resolve(distDir, "index.html");

// TON Connect requires the manifest URL to match the public dApp origin
// exactly. VERCEL_URL points at an immutable internal deployment hostname,
// which differs from the production alias opened by Telegram/Tonkeeper.
const appOrigin = resolveAppOrigin();
const manifest = {
  url: appOrigin,
  name: "NOVA AI",
  iconUrl: `${appOrigin}/images/nova-logo.png`,
  termsOfUseUrl: appOrigin,
  privacyPolicyUrl: appOrigin,
};

if (!existsSync(appShell)) {
  throw new Error("dist/index.html was not generated");
}

for (const route of routes) {
  const target = resolve(distDir, route.slice(1), "index.html");
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(appShell, target);
}

copyFileSync(appShell, resolve(distDir, "404.html"));
writeFileSync(resolve(distDir, "tonconnect-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created SPA entry points for ${routes.length} routes`);
console.log(`Created TON Connect manifest for ${appOrigin}`);