import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

export type PlanId = "free" | "starter" | "pro" | "ultra";

export const PLAN_LIMITS: Record<PlanId, { images: number | null; videos: number | null; price: number }> = {
  free: { images: 3, videos: 0, price: 0 },
  starter: { images: null, videos: null, price: 10 },
  pro: { images: null, videos: null, price: 10 },
  ultra: { images: null, videos: null, price: 10 },
};

export interface SubscriptionView {
  plan: PlanId;
  status: "active" | "expired" | "none";
  expires_at: string | null;
  images_used: number;
  videos_used: number;
  images_limit: number | null;
  videos_limit: number | null;
}

export const FREE_VIEW: SubscriptionView = {
  plan: "free",
  status: "none",
  expires_at: null,
  images_used: 0,
  videos_used: 0,
  images_limit: PLAN_LIMITS.free.images,
  videos_limit: PLAN_LIMITS.free.videos,
};

export const loadSubscription = async (
  db: ReturnType<typeof admin>,
  profileId: string,
): Promise<SubscriptionView> => {
  const { data } = await db
    .from("ai_subscriptions")
    .select("plan, status, expires_at, images_used, videos_used")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!data) return { ...FREE_VIEW };

  const expired = data.expires_at ? new Date(data.expires_at).getTime() < Date.now() : true;
  const active = data.status === "active" && !expired;
  const plan = (active ? data.plan : "free") as PlanId;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  return {
    plan,
    status: active ? "active" : "expired",
    expires_at: data.expires_at,
    images_used: data.images_used ?? 0,
    videos_used: data.videos_used ?? 0,
    images_limit: limits.images,
    videos_limit: limits.videos,
  };
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull an active Alibaba (DashScope) key for a category: qwen | image | video. */
export const alibabaKey = async (
  db: ReturnType<typeof admin>,
  category: "qwen" | "image" | "video",
): Promise<string> => {
  const { data } = await db
    .from("alibaba_keys")
    .select("api_key")
    .eq("category", category)
    .eq("status", "active")
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  const key = data?.api_key ?? Deno.env.get("ALIBABA_API_KEY") ?? "";
  if (!key) throw new Error(`No active Alibaba key for ${category}`);
  return key;
};

export const DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com";
