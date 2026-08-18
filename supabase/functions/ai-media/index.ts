import {
  admin,
  alibabaKey,
  corsHeaders,
  DASHSCOPE_BASE,
  json,
  loadSubscription,
  sleep,
} from "./shared.ts";

const PREMIUM_MODELS = new Set(["hd", "cinematic", "video-hd", "video-cinematic"]);

const MODEL_MAP: Record<string, string> = {
  standard: "wan2.2-t2i-flash",
  hd: "wan2.2-t2i-plus",
  cinematic: "wanx2.1-t2i-plus",
  "video-lite": "wan2.2-t2v-plus",
  "video-hd": "wan2.2-t2v-plus",
  "video-cinematic": "wanx2.1-t2v-plus",
};

const extractUrl = (data: unknown): string | null => {
  const d = data as any;
  return (
    d?.output?.results?.[0]?.url ??
    d?.output?.video_url ??
    d?.output?.results?.[0]?.video_url ??
    d?.data?.[0]?.url ??
    null
  );
};

const pollTask = async (key: string, taskId: string) => {
  for (let i = 0; i < 120; i++) {
    await sleep(2500);
    const res = await fetch(`${DASHSCOPE_BASE}/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.message || `Alibaba error ${res.status}`);

    const status = (data as any)?.output?.task_status;
    const url = extractUrl(data);
    if (status === "SUCCEEDED" && url) return url;
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error((data as any)?.output?.message || "Generation failed");
    }
  }
  throw new Error("Generation timed out");
};

const runAlibaba = async (key: string, kind: "image" | "video", model: string, prompt: string) => {
  const endpoint =
    kind === "image"
      ? "/api/v1/services/aigc/text2image/image-synthesis"
      : "/api/v1/services/aigc/video-generation/video-synthesis";

  const res = await fetch(`${DASHSCOPE_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model,
      input: { prompt },
      parameters:
        kind === "image" ? { n: 1, size: "1024*1024" } : { size: "832*1088", duration: 5 },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.message || (data as any)?.code || `Alibaba error ${res.status}`);
  }

  const direct = extractUrl(data);
  if (direct) return direct;

  const taskId = (data as any)?.output?.task_id;
  if (!taskId) throw new Error("Alibaba did not return a task id");
  return await pollTask(key, taskId);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const kind: "image" | "video" = body.kind === "video" ? "video" : "image";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const modelId = typeof body.model === "string" ? body.model : "standard";
    const profileId = typeof body.profileId === "string" ? body.profileId : null;

    if (!prompt) return json({ error: "Prompt is required" }, 400);
    if (prompt.length > 1500) return json({ error: "Prompt is too long" }, 400);
    if (!MODEL_MAP[modelId]) return json({ error: "Unknown model" }, 400);
    if (!profileId) return json({ error: "Missing profile" }, 400);

    const db = admin();
    const sub = await loadSubscription(db, profileId);

    if (PREMIUM_MODELS.has(modelId) && sub.plan === "free") {
      return json({ error: "This model needs the $10 Unlimited plan." }, 402);
    }

    const used = kind === "image" ? sub.images_used : sub.videos_used;
    const limit = kind === "image" ? sub.images_limit : sub.videos_limit;
    if (limit !== null && used >= limit) {
      return json({ error: `You reached your free ${kind} limit. Upgrade to Unlimited.` }, 402);
    }

    const key = await alibabaKey(db, kind === "image" ? "image" : "video");
    const url = await runAlibaba(key, kind, MODEL_MAP[modelId], prompt);

    await db.from("ai_generations").insert({
      profile_id: profileId,
      kind,
      model: modelId,
      prompt,
      url,
    });

    await db.from("ai_subscriptions").upsert(
      {
        profile_id: profileId,
        images_used: sub.images_used + (kind === "image" ? 1 : 0),
        videos_used: sub.videos_used + (kind === "video" ? 1 : 0),
      },
      { onConflict: "profile_id" },
    );

    return json({ url, kind, model: modelId, created_at: new Date().toISOString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
