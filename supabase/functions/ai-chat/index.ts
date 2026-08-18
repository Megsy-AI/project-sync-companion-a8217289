import { admin, alibabaKey, corsHeaders, DASHSCOPE_BASE, json, loadSubscription } from "./shared.ts";

const CHAT_MODEL = "qwen-plus";
const CODE_MODEL = "qwen3-coder-plus";

const SYSTEM: Record<string, string> = {
  chat: "You are a helpful, concise assistant inside a crypto mining mini app. Answer clearly.",
  code: "You are an expert software engineer. Return working code with short explanations. Use markdown code blocks.",
};

const callQwen = async (
  key: string,
  model: string,
  messages: { role: string; content: string }[],
) => {
  const res = await fetch(`${DASHSCOPE_BASE}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.message || `Alibaba error ${res.status}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty response from model");
  return text;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "code" ? "code" : "chat";
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const profileId = typeof body.profileId === "string" ? body.profileId : null;

    const last = incoming.filter((m: { role: string }) => m.role === "user").at(-1);
    const question = typeof last?.content === "string" ? last.content.trim() : "";
    if (!question) return json({ error: "Prompt is required" }, 400);
    if (question.length > 4000) return json({ error: "Prompt is too long" }, 400);

    const db = admin();

    if (profileId) {
      const sub = await loadSubscription(db, profileId);
      if (sub.plan === "free" && incoming.length > 20) {
        return json({ error: "Free chat limit reached. Subscribe to continue." }, 402);
      }
    }

    const key = await alibabaKey(db, "qwen");

    const history = incoming
      .slice(-10)
      .filter((m: { role: string; content: unknown }) => typeof m.content === "string")
      .map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

    const model = mode === "code" ? CODE_MODEL : CHAT_MODEL;
    const reply = await callQwen(key, model, [{ role: "system", content: SYSTEM[mode] }, ...history]);

    return json({ reply, model });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
