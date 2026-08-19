// Serves a TON Connect manifest whose `url` matches the origin the mini app is
// actually served from. Wallets refuse to connect when the manifest origin does
// not match the dapp origin, which broke connecting/paying on every host other
// than nova.megsyai.com.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ORIGIN = "https://www.megsy.online";
const ICON_URL = "https://www.megsy.online/images/nova-logo.png";

const ALLOWED_HOST_SUFFIXES = [
  ".lovable.app",
  ".lovableproject.com",
  "megsyai.com",
  "megsy.online",
  ".vercel.app",
  ".netlify.app",
];

function safeOrigin(raw: string | null): string {
  if (!raw) return DEFAULT_ORIGIN;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return DEFAULT_ORIGIN;
    const host = parsed.hostname;
    const ok = ALLOWED_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, "") || host.endsWith(s));
    return ok ? parsed.origin : DEFAULT_ORIGIN;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const origin = safeOrigin(url.searchParams.get("origin"));

  const manifest = {
    url: origin,
    name: "Nova Coin",
    iconUrl: ICON_URL,
    termsOfUseUrl: origin,
    privacyPolicyUrl: origin,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
