import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { payWithStars, STARS_PRICES } from "@/lib/stars";
import { PaymentError, sendTonPayment } from "@/lib/ton";
import { usePaymentDiscount } from "@/hooks/use-payment-discount";
import { verifyTonOnChain } from "@/lib/game-api";
import TelegramStar from "@/components/TelegramStar";
import { setNavRevealed, useNavRevealed } from "@/hooks/use-nav-reveal";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Role = "user" | "assistant";
type Kind = "text" | "image" | "video";
type Msg = {
  id: string;
  role: Role;
  content: string;
  kind: Kind;
  url?: string;
  pending?: boolean;
  error?: boolean;
  attachments?: Attachment[];
};
type Mode = "chat" | "images" | "videos";
type Attachment = {
  id: string;
  name: string;
  kind: "image" | "file";
  dataUrl?: string;
  text?: string;
};

const PLAN_PRICE = 8;
/** Pro plan price in Gram (TON), billed directly to the connected wallet. */
const PLAN_PRICE_TON = 8;

const MODES: { id: Mode; label: string; icon: typeof MessageCircle; placeholder: string }[] = [
  { id: "chat", label: "Chat", icon: MessageCircle, placeholder: "Ask Nova anything…" },
  { id: "images", label: "Images", icon: ImageIcon, placeholder: "Describe the image to create…" },
  { id: "videos", label: "Videos", icon: Video, placeholder: "Describe the video to create…" },
];

const BASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CHAT_URL = `${BASE_URL}/functions/v1/chat-alibaba`;
const MEDIA_URL = `${BASE_URL}/functions/v1/ai-deapi`;

const ease = [0.22, 1, 0.36, 1] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Soft shimmering placeholder shown while media is being generated. */
const MediaSkeleton = ({ kind }: { kind: "image" | "video" }) => (
  <div
    className={cn(
      "relative w-full overflow-hidden rounded-[1.4rem] border border-border/60 bg-muted/60",
      kind === "image" ? "aspect-square" : "aspect-video",
    )}
  >
    <motion.div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(100deg, transparent 20%, hsl(var(--primary) / 0.14) 45%, hsl(var(--accent) / 0.12) 55%, transparent 80%)",
      }}
      animate={{ x: ["-60%", "160%"] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
    />
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <span className="text-[12px] text-muted-foreground">
        Creating your {kind}… this can take a moment
      </span>
    </div>
  </div>
);

const TypingDots = () => (
  <div className="flex items-center gap-1.5 py-1">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="h-1.5 w-1.5 rounded-full bg-primary"
        animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
      />
    ))}
  </div>
);

export default function AiPage() {
  const { user, refreshProfile } = useApp();
  const navRevealed = useNavRevealed();
  const [tonConnectUI] = useTonConnectUI();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [busy, setBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const { discount, priceFor, refresh: refreshDiscount, requestSmartOffer, thinking: offerThinking } = usePaymentDiscount();
  const proPrice = priceFor(PLAN_PRICE_TON);
  const [activeUntil, setActiveUntil] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const attachRef = useRef<HTMLDivElement>(null);

  // Close the + menu when tapping anywhere outside of it.
  useEffect(() => {
    if (!attachOpen) return;
    const close = (e: Event) => {
      if (!attachRef.current?.contains(e.target as Node)) setAttachOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [attachOpen]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 8MB`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const readable =
        file.type.startsWith("text/") ||
        /\.(txt|md|csv|json|ts|tsx|js|jsx|html|css)$/i.test(file.name);
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        name: file.name,
        kind: isImage ? "image" : "file",
      };
      if (isImage) {
        attachment.dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.readAsDataURL(file);
        });
      } else if (readable) {
        attachment.text = (await file.text()).slice(0, 12000);
      }
      next.push(attachment);
    }
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 4));
    setAttachOpen(false);
  }, []);

  const activeMode = useMemo(() => MODES.find((m) => m.id === mode)!, [mode]);
  const empty = messages.length === 0;
  const profileId = (user as { profileId?: string | null })?.profileId ?? null;
  const isPro = !!activeUntil && new Date(activeUntil).getTime() > Date.now();

  const loadSubscription = useCallback(async () => {
    if (!profileId) return;
    const { data } = await (supabase as any).rpc("ai_get_subscription", {
      _profile_id: profileId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    setActiveUntil(row?.status === "active" ? row?.expires_at ?? null : null);
  }, [profileId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  // Keep the bottom nav visible when entering the AI page; the user hides it manually.
  useEffect(() => {
    setNavRevealed(true);
    return () => setNavRevealed(false);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const patch = (id: string, next: Partial<Msg>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));

  /** Buys Pro by paying Gram (TON) straight from the connected wallet — no USDT deposit needed. */
  const subscribeWithTon = async () => {
    if (!profileId) {
      toast.error("Profile not ready yet");
      return;
    }
    setBuying(true);
    try {
      const tx = await sendTonPayment(tonConnectUI, {
        amountTon: PLAN_PRICE_TON, // discount is applied server-side on the intent
        telegramId: user.telegramUser.id,
        action: "ai_pro",
      });
      toast("Verifying your payment on-chain…");
      const verification = await verifyTonOnChain(tx.intentId, tx.boc, tonConnectUI.account?.address);
      if (!verification.verified) {
        toast.error("Payment not found on-chain yet. Try again in a moment.");
        return;
      }
      const { data, error } = await (supabase as any).rpc("ai_activate_plan_with_intent", {
        _profile_id: profileId,
        _telegram_id: user.telegramUser.id,
        _plan: "unlimited",
        _intent_id: tx.intentId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setActiveUntil(row?.expires_at ?? null);
      setPlanOpen(false);
      toast.success("Pro activated — unlimited for 30 days");
      void refreshDiscount();
      void refreshProfile?.();
    } catch (e: any) {
      if (e instanceof PaymentError) {
        toast.error(e.message);
      } else {
        toast.error("Could not activate the plan");
      }
    } finally {
      setBuying(false);
    }
  };

  const runChat = async (history: Msg[], replyId: string) => {
    return await runChatInner(history, replyId);
  };

  const subscribeWithStars = async () => {
    setBuying(true);
    try {
      const status = await payWithStars("ai_pro", profileId, user?.telegramUser?.id);
      if (status === "paid") {
        toast.success("Pro activated — unlimited for 30 days");
        setPlanOpen(false);
        await loadSubscription();
        void refreshProfile?.();
      } else if (status === "cancelled") {
        toast("Payment cancelled");
      } else {
        toast("Complete the payment in Telegram to activate Pro");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start the Stars payment");
    } finally {
      setBuying(false);
    }
  };

  const runChatInner = async (history: Msg[], replyId: string) => {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({
        messages: history
          .filter((m) => m.kind === "text")
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            acc += delta;
            patch(replyId, { content: acc, pending: false });
          }
        } catch {
          /* keep-alive frames */
        }
      }
    }
    if (!acc) throw new Error("empty");
  };

  const runMedia = async (kind: "image" | "video", prompt: string, replyId: string) => {
    const res = await fetch(MEDIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ kind, prompt, profileId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    patch(replyId, { url: data.url, pending: false, content: "" });
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;

    const context = attachments
      .map((a) =>
        a.text
          ? `\n\n[Attached file: ${a.name}]\n${a.text}`
          : `\n\n[Attached ${a.kind}: ${a.name}]`,
      )
      .join("");
    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      kind: "text",
      attachments: attachments.length ? attachments : undefined,
    };
    const kind: Kind = mode === "images" ? "image" : mode === "videos" ? "video" : "text";
    const replyId = crypto.randomUUID();
    const history = [...messages, { ...userMsg, content: `${text}${context}` }];

    setMessages([
      ...messages,
      userMsg,
      { id: replyId, role: "assistant", content: "", kind, pending: true },
    ]);
    setInput("");
    setAttachments([]);
    setBusy(true);

    try {
      if (kind === "text") await runChat(history, replyId);
      else await runMedia(kind, text, replyId);
    } catch (e: any) {
      patch(replyId, {
        pending: false,
        error: true,
        kind: "text",
        content:
          String(e?.message) === "empty"
            ? "No response. Please try again."
            : `Couldn't finish that: ${e?.message ?? "unknown error"}`,
      });
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    setAttachments([]);
    taRef.current?.focus();
  };

  return (
    <div className="hero-dark relative flex min-h-[100dvh] flex-col">
      {/* soft mint / pink wash matching the rest of the app */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 20% 0%, hsl(var(--primary) / 0.10), transparent 70%), radial-gradient(ellipse 60% 40% at 90% 12%, hsl(var(--accent) / 0.12), transparent 70%)",
        }}
      />

      <header className="relative z-20 flex items-center justify-between px-5 pt-safe-lg pb-3">
        <button type="button" onClick={reset} className="text-left">
          <span className="hero-title block text-[1.9rem] leading-none">
            Nova <span className="hero-title-italic">AI</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          className={cn(
            "liquid-press flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium",
            isPro
              ? "glass-panel text-foreground"
              : "action-black bg-foreground text-background",
          )}
        >
          {isPro ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          {isPro ? "Pro" : "Upgrade"}
        </button>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-4">
        {empty ? (
          <div className="flex min-h-[42vh] flex-col items-center justify-center px-2 text-center">
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
              className="hero-title text-[2.4rem] leading-[1.05]"
            >
              {greeting()},{" "}
              <span className="hero-title-italic">
                {user?.telegramUser?.first_name || "friend"}
              </span>
            </motion.h2>
            <p className="hero-dim mt-2 max-w-[18rem] text-[14px]">
              Chat, generate images and create videos — all in one place.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-3">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease }}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  {m.role === "user" ? (
                    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
                      {m.attachments?.length ? (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {m.attachments.map((a) =>
                            a.dataUrl ? (
                              <img
                                key={a.id}
                                src={a.dataUrl}
                                alt={a.name}
                                className="h-24 w-24 rounded-2xl border border-border object-cover"
                              />
                            ) : (
                              <span
                                key={a.id}
                                className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 text-[12px] text-foreground"
                              >
                                <FileText className="h-3.5 w-3.5 text-primary" />
                                {a.name}
                              </span>
                            ),
                          )}
                        </div>
                      ) : null}
                      {m.content ? (
                        <div className="whitespace-pre-wrap rounded-[1.3rem] bg-foreground px-4 py-2.5 text-[15px] leading-relaxed text-background">
                          {m.content}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="w-full max-w-[92%]">
                      {m.kind === "text" ? (
                        m.pending ? (
                          <TypingDots />
                        ) : (
                          <p
                            className={cn(
                              "whitespace-pre-wrap text-[15px] leading-relaxed",
                              m.error ? "text-destructive" : "hero-fg",
                            )}
                          >
                            {m.content}
                          </p>
                        )
                      ) : m.pending ? (
                        <MediaSkeleton kind={m.kind as "image" | "video"} />
                      ) : m.url ? (
                        <div className="glass-panel overflow-hidden p-1.5">
                          {m.kind === "image" ? (
                            <img
                              src={m.url}
                              alt="Generated result"
                              loading="lazy"
                              className="w-full rounded-[1.2rem] object-cover"
                            />
                          ) : (
                            <video
                              src={m.url}
                              controls
                              playsInline
                              className="w-full rounded-[1.2rem]"
                            />
                          )}
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 flex items-center justify-center gap-1.5 rounded-full border border-border bg-background/80 py-2 text-[12px] font-medium text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" /> Open full size
                          </a>
                        </div>
                      ) : null}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={endRef} />
          </div>
        )}
      </main>

      <div
        className={cn(
          "sticky bottom-0 z-20 px-3 pt-2 backdrop-blur-xl",
          navRevealed ? "pb-24" : "pb-3",
        )}
      >
        <div className="mx-auto w-full max-w-2xl">
          <AnimatePresence initial={false}>
            {mode === "chat" && (
              <motion.div
                key="chips"
                initial={{ opacity: 0, y: 6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: 6, height: 0 }}
                transition={{ duration: 0.24, ease }}
                className="mb-2 flex justify-center gap-2 overflow-hidden"
              >
                {MODES.filter((m) => m.id !== "chat").map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className="liquid-press flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-4 py-2 text-[13px] font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:bg-secondary"
                    >
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      {m.label}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="glass-panel glass-strong glass-float rounded-[1.6rem] px-3 pb-2.5 pt-2.5">
            <AnimatePresence initial={false}>
              {attachments.length > 0 && (
                <motion.div
                  key="attachments"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease }}
                  className="relative z-10 mb-2 flex flex-wrap gap-2 overflow-hidden"
                >
                  {attachments.map((a) => (
                    <span
                      key={a.id}
                      className="group relative flex items-center gap-1.5 rounded-2xl border border-border bg-background/85 py-1 pl-1.5 pr-2 text-[12px] text-foreground"
                    >
                      {a.dataUrl ? (
                        <img src={a.dataUrl} alt={a.name} className="h-8 w-8 rounded-xl object-cover" />
                      ) : (
                        <FileText className="mx-1 h-4 w-4 text-primary" />
                      )}
                      <span className="max-w-[8rem] truncate">{a.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                        className="grid h-5 w-5 place-items-center rounded-full bg-foreground/10 transition-colors hover:bg-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="relative z-10 flex flex-wrap items-center gap-1.5">
              <AnimatePresence initial={false}>
                {mode !== "chat" && (
                  <motion.span
                    key="active-chip"
                    initial={{ opacity: 0, width: 0, scale: 0.85 }}
                    animate={{ opacity: 1, width: "auto", scale: 1 }}
                    exit={{ opacity: 0, width: 0, scale: 0.85 }}
                    transition={{ duration: 0.22, ease }}
                    className="flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full bg-foreground py-1 pl-2.5 pr-1 text-[12px] font-medium text-background"
                  >
                    <activeMode.icon className="h-3.5 w-3.5" />
                    {activeMode.label}
                    <button
                      type="button"
                      onClick={() => setMode("chat")}
                      aria-label={`Cancel ${activeMode.label} mode`}
                      className="grid h-5 w-5 place-items-center rounded-full bg-background/25 transition-colors hover:bg-background/40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.span>
                )}
              </AnimatePresence>
              <textarea
                ref={taRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={activeMode.placeholder}
                className="min-w-[120px] flex-1 resize-none bg-transparent px-1 py-1 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <div className="relative z-10 mt-1 flex items-center justify-between">
              <div ref={attachRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAttachOpen((v) => !v)}
                  aria-label="Attach photos or files"
                  aria-expanded={attachOpen}
                  className="liquid-press grid h-9 w-9 place-items-center rounded-full border border-border bg-background/85 text-foreground shadow-sm transition-colors hover:bg-secondary"
                >
                  <Plus className={cn("h-4 w-4 transition-transform duration-200", attachOpen && "rotate-45")} />
                </button>
                <AnimatePresence>
                  {attachOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.18, ease }}
                      className="absolute bottom-11 left-0 z-30 w-44 overflow-hidden rounded-2xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur-xl"
                    >
                      <button
                        type="button"
                        onClick={() => { setAttachOpen(false); imageInputRef.current?.click(); }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-secondary"
                      >
                        <ImageIcon className="h-4 w-4 text-primary" />
                        Photos
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAttachOpen(false); fileInputRef.current?.click(); }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-secondary"
                      >
                        <Paperclip className="h-4 w-4 text-primary" />
                        Files
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void readFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void readFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => void send()}
                disabled={(!input.trim() && attachments.length === 0) || busy}
                aria-label="Send"
                className="liquid-press grid h-9 w-9 place-items-center rounded-full bg-foreground text-background shadow-md disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => setNavRevealed(!navRevealed)}
              className="liquid-press flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3.5 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur"
            >
              {navRevealed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
              {navRevealed ? "Hide menu" : "Show menu"}
            </button>
          </div>
        </div>
      </div>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] left-1/2 right-auto top-auto z-[1001] flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[440px] -translate-x-1/2 translate-y-0 items-end justify-center overflow-hidden rounded-[36px] border-0 bg-transparent p-0 shadow-none sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overflow-x-hidden rounded-[36px] bg-[hsl(0_0%_100%/0.72)] px-5 pb-5 pt-7 text-center backdrop-blur-[36px] saturate-[180%] [-ms-overflow-style:none] [scrollbar-width:none] sm:max-h-[calc(100dvh-2rem)] sm:px-6 sm:pb-6 sm:pt-8"
            style={{
              border: "1px solid hsl(160 18% 90%)",
              boxShadow:
                "0 -24px 60px -22px rgba(16,46,38,0.22), inset 0 1px 0 hsl(0 0% 100% / 0.9)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "linear-gradient(160deg, hsl(var(--primary) / 0.28) 0%, hsl(0 0% 100% / 0.72) 45%, hsl(var(--accent) / 0.3) 100%)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-50"
              style={{
                background:
                  "linear-gradient(180deg, hsl(var(--accent) / 0.16) 0%, hsl(var(--primary) / 0.08) 45%, transparent 100%)",
              }}
            />

            <div className="relative z-10">
              <DialogHeader className="space-y-1.5 text-center sm:text-center">
                <DialogTitle className="text-[clamp(20px,5.5vw,26px)] font-display font-medium leading-none text-foreground">
                  Nova AI Pro
                </DialogTitle>
                <DialogDescription className="text-[clamp(11px,3vw,12px)] text-muted-foreground">
                  One plan, everything unlimited for 30 days.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 rounded-[22px] border border-border bg-[hsl(0_0%_100%/0.66)] px-4 py-4 backdrop-blur-md sm:px-5 sm:py-5">
                <p className="text-[clamp(32px,10vw,44px)] font-display font-medium leading-none tracking-tight text-gradient-primary">
                  {discount.discount_pct > 0 && (
                    <span className="mr-2 text-[0.5em] line-through opacity-50">{PLAN_PRICE_TON}</span>
                  )}
                  {proPrice} TON
                </p>
                {discount.discount_pct > 0 && (
                  <p className="mt-1 text-[11px] font-display font-bold text-accent">
                    {discount.first_purchase ? "First purchase" : discount.tier_label} · -{discount.discount_pct}%
                    {discount.ai_bonus_pct > 0 ? ` (incl. +${discount.ai_bonus_pct}% AI offer)` : ""}
                  </p>
                )}
                {discount.ai_bonus_pct > 0 ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{discount.ai_message}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void requestSmartOffer("ai")}
                    disabled={offerThinking}
                    className="liquid-press mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 font-display text-[11px] font-bold text-primary disabled:opacity-60"
                  >
                    {offerThinking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {offerThinking ? "AI is building your offer…" : "Get my AI personal offer"}
                  </button>
                )}
                <p className="mt-1.5 text-[clamp(9px,2.6vw,11px)] uppercase tracking-[0.18em] text-muted-foreground">
                  per month
                </p>
              </div>

              <ul className="mt-2.5 space-y-2 rounded-[22px] border border-border bg-[hsl(0_0%_100%/0.66)] px-4 py-4 text-left text-[14px] backdrop-blur-md sm:mt-3 sm:px-5">
                {["Unlimited chat", "Unlimited images", "Unlimited videos", "Priority speed"].map(
                  (f) => (
                    <li key={f} className="flex items-center gap-2 text-foreground">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ),
                )}
              </ul>

              <p className="mt-3 text-[clamp(10px,2.8vw,11px)] leading-relaxed text-muted-foreground">
                Paid directly from your TON wallet — no deposit needed.
              </p>

              {isPro ? (
                <div className="mt-4 rounded-2xl border border-border bg-[hsl(0_0%_100%/0.66)] py-3 text-center text-[14px] font-medium text-foreground">
                  Active until {new Date(activeUntil!).toLocaleDateString()}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => void subscribeWithTon()}
                    disabled={buying}
                    className="liquid-press glow-primary flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-display text-[14px] font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {buying && <Loader2 className="h-4 w-4 animate-spin" />}
                    Pay {proPrice} TON
                  </button>
                  <button
                    type="button"
                    onClick={() => void subscribeWithStars()}
                    disabled={buying}
                    className="liquid-press flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-[hsl(0_0%_100%/0.72)] font-display text-[14px] font-medium text-foreground disabled:opacity-60"
                  >
                    <TelegramStar className="h-4 w-4" />
                    Pay with {Math.max(1, Math.round(STARS_PRICES.ai_pro * (1 - discount.discount_pct / 100)))} Telegram Stars
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setPlanOpen(false)}
                className="mt-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Later
              </button>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
