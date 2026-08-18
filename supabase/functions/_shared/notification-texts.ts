// Combinatorial English notification copy.
// mining: 22 x 20 x 16 = 7040 variants
// ai:     20 x 18 x 16 = 5760 variants
// Total unique texts: 12,800+

export type NotificationTopic = "mining" | "ai";

const MINING_OPENERS = [
  "⛏️ {name}, your rig is sitting idle.",
  "🚀 {name}, your mining session ended.",
  "💎 {name}, free rewards are waiting.",
  "🔥 {name}, don't let your streak die.",
  "🌙 {name}, mine while you sleep.",
  "⚡ {name}, your miners are cold.",
  "📈 {name}, your earnings curve is flat.",
  "🧊 {name}, the rig froze — nobody is mining.",
  "🎯 {name}, one tap and you're earning again.",
  "🛠️ {name}, maintenance done, rigs ready.",
  "💰 {name}, idle time is lost income.",
  "🌟 {name}, top miners already restarted.",
  "🕹️ {name}, your next 8-hour run is unlocked.",
  "📡 {name}, the network is waiting for you.",
  "🏆 {name}, the leaderboard moves without you.",
  "🔋 {name}, your rig is fully charged.",
  "🌅 {name}, a new mining window just opened.",
  "🧭 {name}, back to the mines?",
  "💫 {name}, your hashrate is at zero.",
  "🎁 {name}, a fresh reward cycle is live.",
  "⏳ {name}, every idle hour costs you $NOVA.",
  "👑 {name}, real miners never stop.",
];

const MINING_BODIES = [
  "Start an 8-hour session and earn $NOVA, Gram and USDT.",
  "Restart mining now and stack rewards while you're away.",
  "Your servers keep paying you — but only while mining runs.",
  "Fire up the rig and collect your next payout automatically.",
  "One session = 8 hours of passive $NOVA.",
  "Upgrade a server first, then mine for a bigger payout.",
  "Miners with better servers earn several times more per cycle.",
  "Your balance grows every minute the session is active.",
  "Claim your cycle before someone else climbs past you.",
  "Mining now means waking up with a bigger balance.",
  "Rewards are distributed per session — don't skip this one.",
  "Tap start and let the rig work for the next 8 hours.",
  "The longer you wait, the more cycles you lose.",
  "Boost your daily Gram and USDT income in one tap.",
  "Your referral bonuses only count while you're mining.",
  "Combine mining with staking for compounding rewards.",
  "New servers are available — more power, more $NOVA.",
  "Consistency pays: mine daily and watch the balance climb.",
  "Free to start, no fees, pure rewards.",
  "Your rig is idle while others are farming rewards.",
];

const MINING_CLOSERS = [
  "Tap below to start mining. ⛏️",
  "Open Nova and hit Start. 🚀",
  "Let's go — one tap is all it takes. 👇",
  "Start your session now. 💎",
  "Back to work, miner. 🔨",
  "Claim your cycle now. 🎯",
  "Don't miss this one. ⏱️",
  "Your rewards are one tap away. ✨",
  "Restart the rig now. ⚡",
  "See you in the mines. 🪙",
  "Fire it up. 🔥",
  "Start now, thank yourself later. 🙌",
  "Keep the streak alive. 📅",
  "Go earn something. 💸",
  "Your rig is waiting. 🖥️",
  "Tap Start Mining. ✅",
];

const AI_OPENERS = [
  "🤖 {name}, Nova AI is ready for you.",
  "🧠 {name}, ask Nova anything today.",
  "🎨 {name}, turn your idea into an image.",
  "🎬 {name}, make a video from a single line of text.",
  "✨ {name}, your AI assistant is online.",
  "💡 {name}, stuck on something? Nova can help.",
  "📎 {name}, upload a photo and let Nova read it.",
  "🚀 {name}, Nova AI just got faster.",
  "🖼️ {name}, describe it and Nova draws it.",
  "🗣️ {name}, chat with Nova in any language.",
  "⚡ {name}, instant answers, zero waiting.",
  "🌌 {name}, create something unreal today.",
  "📝 {name}, need a caption, plan or script?",
  "🔍 {name}, Nova can explain anything simply.",
  "🎧 {name}, your creative studio lives in the app.",
  "🧩 {name}, one page: chat, images and video.",
  "🏁 {name}, your free AI messages reset.",
  "🌠 {name}, imagination in, artwork out.",
  "📚 {name}, learn faster with Nova AI.",
  "💬 {name}, Nova is waiting for your first message.",
];

const AI_BODIES = [
  "Chat, generate images and create videos in one place.",
  "Ask questions, get clear answers in seconds.",
  "Describe any scene and get a high-quality image instantly.",
  "Turn a short prompt into a full video clip.",
  "Attach images or files and ask Nova about them.",
  "Write posts, ideas and scripts in one tap.",
  "Nova Pro unlocks the full experience for 30 days for just 8 TON.",
  "Pay with TON or Telegram Stars — confirmation is automatic.",
  "Pro members get priority speed and higher limits.",
  "Use Nova to plan your mining and staking strategy.",
  "Ask in Arabic or English — Nova understands both.",
  "Generate a profile picture that actually looks like you.",
  "Summarize long text into a few clean lines.",
  "Debug ideas, brainstorm names, draft messages.",
  "The best prompts get the best art — try a detailed one.",
  "Free messages refresh regularly, so use them.",
  "Create content for your channel without leaving Telegram.",
  "Everything runs inside the app — no extra tools needed.",
];

const AI_CLOSERS = [
  "Open the AI tab now. 🤖",
  "Try it — first prompt is on us. ✨",
  "Tap below and start creating. 🎨",
  "Go make something today. 🚀",
  "Your ideas deserve better. 💡",
  "Say hi to Nova. 👋",
  "One prompt away. ⚡",
  "Upgrade to Pro anytime. ⭐",
  "Let's create. 🎬",
  "Open Nova AI. 📱",
  "Ask your first question. ❓",
  "Get inspired now. 🌟",
  "See what Nova can do. 👀",
  "Start free right now. 🆓",
  "Bring your idea to life. 🧬",
  "Tap to chat with Nova. 💬",
];

const POOLS: Record<NotificationTopic, { openers: string[]; bodies: string[]; closers: string[] }> = {
  mining: { openers: MINING_OPENERS, bodies: MINING_BODIES, closers: MINING_CLOSERS },
  ai: { openers: AI_OPENERS, bodies: AI_BODIES, closers: AI_CLOSERS },
};

export const variantCount = (topic: NotificationTopic): number => {
  const p = POOLS[topic];
  return p.openers.length * p.bodies.length * p.closers.length;
};

export const totalVariants = (): number => variantCount("mining") + variantCount("ai");

/** Removes emoji / pictographs and tidies the leftover spacing. */
const stripEmoji = (s: string): string =>
  s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{200D}]/gu,
      "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");

/** Deterministic-free random pick of a unique combination. */
export const buildNotification = (topic: NotificationTopic, name: string): string => {
  const p = POOLS[topic];
  const opener = p.openers[Math.floor(Math.random() * p.openers.length)];
  const body = p.bodies[Math.floor(Math.random() * p.bodies.length)];
  const closer = p.closers[Math.floor(Math.random() * p.closers.length)];
  const safeName = (name || "Miner").replace(/[<>&]/g, "").slice(0, 32);
  const text = stripEmoji(`${opener}\n\n${body}\n\n${closer}`).replace(/\{name\}/g, safeName);
  // Everything is bold, no emoji.
  return text
    .split("\n\n")
    .map((part) => `<b>${part}</b>`)
    .join("\n\n");
};
