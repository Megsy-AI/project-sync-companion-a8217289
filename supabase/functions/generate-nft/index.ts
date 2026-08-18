import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "google/gemini-3.1-flash-image";

/** Varied server artwork styles so every generation returns a fresh look. */
const STYLES = [
  "a futuristic holographic server rack guardian",
  "a glowing crystal data-core server with neon energy veins",
  "a sleek chrome cyber server droid with mint-green accents",
  "a floating quantum server monolith surrounded by light particles",
  "a retro-futuristic mining server tower with golden trims",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.headers.get("x-ping")) return json({ pong: true });
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "AI key missing" }, 500);
    }

    const body = await req.json().catch(() => null);
    const telegramId = Number(body?.telegramId);
    const imageDataUrl: string = body?.image ?? "";
    const name: string = (body?.name ?? "").toString().slice(0, 40) || "My Server";
    const txHash: string | null = body?.txHash ?? null;
    const priceTon: number = Number(body?.priceTon) > 0 ? Number(body.priceTon) : 4;

    if (!telegramId || !imageDataUrl.startsWith("data:image/")) {
      return json({ error: "Invalid input" }, 400);
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Turn this person into a premium 3D collectible server character: ${
                  STYLES[Math.floor(Math.random() * STYLES.length)]
                }. Keep the face recognisable, Pixar-like stylized rendering, glossy shading, vivid colors, centered composition, clean solid white background, no text, no watermark.`,
              },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiRes.ok) {
      const details = await aiRes.text();
      console.error("AI gateway failed", aiRes.status, details);
      return json({ error: "Generation failed", status: aiRes.status, details }, aiRes.status);
    }

    const aiJson = await aiRes.json();
    const b64: string | undefined = aiJson?.data?.[0]?.b64_json;
    if (!b64) {
      console.error("No image returned", JSON.stringify(aiJson).slice(0, 500));
      return json({ error: "No image returned" }, 502);
    }

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const path = `${telegramId}/${crypto.randomUUID()}.png`;
    const up = await admin.storage.from("user-nfts").upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
    if (up.error) {
      console.error("upload failed", up.error.message);
      return json({ error: "Upload failed" }, 500);
    }

    const signed = await admin.storage
      .from("user-nfts")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const imageUrl = signed.data?.signedUrl;
    if (!imageUrl) return json({ error: "URL failed" }, 500);

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    const { data: row, error: insErr } = await admin
      .from("user_nfts")
      .insert({
        telegram_id: telegramId,
        profile_id: profile?.id ?? null,
        name,
        image_url: imageUrl,
        storage_path: path,
        tx_hash: txHash,
        price_ton: Number(priceTon) > 0 ? Number(priceTon) : 4,
      })
      .select()
      .single();

    if (insErr) {
      console.error("insert failed", insErr.message);
      return json({ error: "Save failed" }, 500);
    }

    return json({ success: true, nft: row });
  } catch (e) {
    console.error("generate-nft error", e);
    return json({ error: "Unexpected error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
