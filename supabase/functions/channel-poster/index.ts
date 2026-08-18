import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CHANNEL_ID = -1002616088306;
const BOT_USERNAME = "Noveaibot";
const APP_URL = "https://t.me/Noveaibot/App";

const topics = [
  { title: "Mine Gram & USDT every 8 hours", angle: "passive mining rewards" },
  { title: "Battle monsters, earn Gram", angle: "PvE boss battles with real Gram prize pool" },
  { title: "Invite friends, earn 50% forever", angle: "lifetime referral commission" },
  { title: "Buy servers, multiply your mining", angle: "server NFTs that boost mining" },
  { title: "Daily tasks = daily rewards", angle: "free SIRI, Gram, USDT from tasks" },
  { title: "Climb the leaderboard", angle: "compete for top damage rewards" },
];

async function generateText(apiKey: string, topic: { title: string; angle: string }) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You write short, punchy Telegram channel posts in English for a crypto play-to-earn app called Dogs. Style: clean, organized, 4-7 lines, use line breaks, NO emojis, NO hashtags. End with a clear call to action to open the bot.",
        },
        {
          role: "user",
          content: `Write a Telegram post about: ${topic.title}. Angle: ${topic.angle}. The bot username is @${BOT_USERNAME}. Keep under 500 characters. End with: Open @${BOT_USERNAME} to start.`,
        },
      ],
    }),
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? `${topic.title}\n\nOpen @${BOT_USERNAME} to start.`;
}

async function generateImage(apiKey: string, topic: { title: string; angle: string }): Promise<Uint8Array | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: `Vibrant, cinematic crypto-gaming poster illustration. Theme: ${topic.title}. ${topic.angle}. Dark navy background with warm amber and gold glow, futuristic dog mascot character, clean composition, no text, no logos, 16:9.`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });
    const data = await res.json();
    const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url?.startsWith("data:")) return null;
    const b64 = url.split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (_) {
    return null;
  }
}

async function sendPhoto(token: string, caption: string, image: Uint8Array) {
  const form = new FormData();
  form.append("chat_id", String(CHANNEL_ID));
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append(
    "reply_markup",
    JSON.stringify({ inline_keyboard: [[{ text: "Open the bot", url: APP_URL }]] }),
  );
  form.append("photo", new Blob([image], { type: "image/png" }), "post.png");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
  return await res.json();
}

async function sendMessage(token: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "Open the bot", url: APP_URL }]] },
    }),
  });
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN_HELLO") || Deno.env.get("TELEGRAM_BOT_TOKEN");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!TELEGRAM_BOT_TOKEN || !LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing TELEGRAM_BOT_TOKEN_HELLO (or TELEGRAM_BOT_TOKEN) and LOVABLE_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const topic = topics[Math.floor(Math.random() * topics.length)];
  const caption = await generateText(LOVABLE_API_KEY, topic);
  const image = await generateImage(LOVABLE_API_KEY, topic);

  const result = image
    ? await sendPhoto(TELEGRAM_BOT_TOKEN, caption, image)
    : await sendMessage(TELEGRAM_BOT_TOKEN, caption);

  return new Response(JSON.stringify({ ok: true, hadImage: !!image, telegram: result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});