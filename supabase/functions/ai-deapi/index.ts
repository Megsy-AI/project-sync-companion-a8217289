const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BASE = "https://api.deapi.ai";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const IMAGE_MODEL = "Flux_2_Klein_4B_BF16";
const VIDEO_MODEL = "Ltxv_13B_0_9_8_Distilled_FP8";

const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Accept: "application/json",
});

const pickId = (d: any) =>
  d?.data?.request_id ?? d?.request_id ?? d?.data?.id ?? d?.id ?? null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const key = Deno.env.get("DEAPI_API_KEY") ?? "";
  if (!key) return json({ error: "DEAPI_API_KEY is not configured" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "generate";

    if (action === "models") {
      const res = await fetch(`${BASE}/api/v2/models`, { headers: headers(key) });
      return json(await res.json().catch(() => ({})), res.status);
    }

    const kind: "image" | "video" = body.kind === "video" ? "video" : "image";
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return json({ error: "Prompt is required" }, 400);
    if (prompt.length > 1500) return json({ error: "Prompt is too long" }, 400);

    const seed = Math.floor(Math.random() * 1_000_000);
    const payload =
      kind === "image"
        ? {
            prompt,
            model: body.model || IMAGE_MODEL,
            width: 1024,
            height: 1024,
            guidance: 3.5,
            steps: 4,
            seed,
          }
        : {
            prompt,
            model: body.model || VIDEO_MODEL,
            width: 768,
            height: 512,
            guidance: 3,
            steps: 1,
            frames: 120,
            fps: 30,
            seed,
          };

    const path =
      kind === "image" ? "/api/v2/images/generations" : "/api/v2/videos/generations";

    const start = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(payload),
    });
    const startData = await start.json().catch(() => ({}));
    if (!start.ok) {
      return json(
        { error: (startData as any)?.message || `deAPI error ${start.status}`, details: startData },
        start.status,
      );
    }

    const id = pickId(startData);
    if (!id) return json({ error: "deAPI did not return a request id", details: startData }, 502);

    const maxTries = kind === "image" ? 90 : 200;
    for (let i = 0; i < maxTries; i++) {
      await sleep(2000);
      const res = await fetch(`${BASE}/api/v2/jobs/${id}`, { headers: headers(key) });
      const data: any = await res.json().catch(() => ({}));
      const d = data?.data ?? data;
      const status = d?.status;
      if (status === "done") {
        const url = d?.result_url ?? d?.results_alt_formats?.jpg ?? d?.result ?? null;
        if (!url) return json({ error: "Job finished without a result", details: d }, 502);
        return json({ url, kind, requestId: id });
      }
      if (status === "error") {
        return json({ error: d?.error || d?.message || "Generation failed" }, 502);
      }
    }
    return json({ error: "Generation timed out" }, 504);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
