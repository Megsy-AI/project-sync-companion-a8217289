import { supabase } from "@/integrations/supabase/client";

export type AiMode = "chat" | "code" | "image" | "video";

export type AiPlanId = "pro";

export interface AiPlan {
  id: AiPlanId;
  name: string;
  priceUsd: number;
  tagline: string;
  highlight?: boolean;
  perks: string[];
}

export const AI_PLANS: AiPlan[] = [
  {
    id: "pro",
    name: "Unlimited",
    priceUsd: 10,
    tagline: "Everything, with no limits",
    highlight: true,
    perks: [
      "Unlimited images",
      "Unlimited videos",
      "Unlimited chat & code",
      "All premium models",
      "Priority queue",
    ],
  },
];

export interface AiSubscription {
  plan: AiPlanId | "free";
  status: "active" | "expired" | "none";
  expires_at: string | null;
  images_used: number;
  videos_used: number;
  images_limit: number | null;
  videos_limit: number | null;
}


export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MediaResult {
  url: string;
  kind: "image" | "video";
  model: string;
  created_at: string;
}

const invoke = async <T,>(fn: string, body: unknown): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  return data as T;
};

export const sendAiChat = (payload: {
  profileId: string | null;
  mode: "chat" | "code";
  messages: ChatMessage[];
}) => invoke<{ reply: string; model: string }>("ai-chat", payload);

export const generateAiMedia = (payload: {
  profileId: string | null;
  kind: "image" | "video";
  prompt: string;
  model: string;
}) => invoke<MediaResult>("ai-media", payload);

export const getAiSubscription = (profileId: string | null) =>
  invoke<AiSubscription>("ai-subscription", { profileId, action: "status" });

export const subscribeAiPlan = (payload: { profileId: string | null; plan: AiPlanId }) =>
  invoke<AiSubscription>("ai-subscription", { ...payload, action: "subscribe" });
