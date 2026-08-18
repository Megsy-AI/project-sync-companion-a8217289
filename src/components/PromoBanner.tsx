import { useNavigate } from "react-router-dom";

export type PromoVariant = "server" | "war" | "shop" | "referral" | "support";

interface PromoBannerProps {
  variant: PromoVariant;
  className?: string;
}

const VARIANTS: Record<PromoVariant, {
  tag: string;
  title: string;
  desc: string;
  cta: string;
  to: string;
  gradient: string;
  border: string;
}> = {
  server: {
    tag: "Mining Boost",
    title: "Buy a Server, Earn Gram Daily",
    desc: "Servers boost your mining rate and unlock higher USDT and Gram rewards.",
    cta: "Browse Servers",
    to: "/servers",
    gradient: "linear-gradient(135deg, hsl(200 80% 50% / 0.18), hsl(160 70% 45% / 0.18))",
    border: "hsl(200 80% 55% / 0.35)",
  },
  war: {
    tag: "Battle Rewards",
    title: "Defeat Bosses, Win the Gram Pool",
    desc: "Killing blow takes 40 percent of the prize pool. Top attackers split the rest.",
    cta: "Enter War",
    to: "/war",
    gradient: "linear-gradient(135deg, hsl(0 75% 55% / 0.18), hsl(30 85% 55% / 0.18))",
    border: "hsl(0 75% 60% / 0.35)",
  },
  shop: {
    tag: "Power Up",
    title: "Unlock Legendary Attacks",
    desc: "Spells and power packs deal massive damage and increase your Gram earnings.",
    cta: "Open Attack Shop",
    to: "/attack-shop",
    gradient: "linear-gradient(135deg, hsl(280 75% 55% / 0.18), hsl(320 70% 55% / 0.18))",
    border: "hsl(280 75% 60% / 0.35)",
  },
  referral: {
    tag: "Earn Together",
    title: "50 Percent Referral Commission",
    desc: "Invite friends and earn Gram from every server and battle item they buy.",
    cta: "View Tasks",
    to: "/tasks",
    gradient: "linear-gradient(135deg, hsl(45 90% 55% / 0.18), hsl(20 85% 55% / 0.18))",
    border: "hsl(45 90% 60% / 0.35)",
  },
  support: {
    tag: "Need Help",
    title: "Talk to Our Support Team",
    desc: "Reach out on Telegram for any question about withdrawals or rewards.",
    cta: "Contact @A_AA1C",
    to: "https://t.me/A_AA1C",
    gradient: "linear-gradient(135deg, hsl(220 70% 55% / 0.18), hsl(260 65% 55% / 0.18))",
    border: "hsl(220 70% 60% / 0.35)",
  },
};

const PromoBanner = ({ variant, className = "" }: PromoBannerProps) => {
  const navigate = useNavigate();
  const v = VARIANTS[variant];

  const handleClick = () => {
    if (v.to.startsWith("http")) {
      window.open(v.to, "_blank", "noopener,noreferrer");
    } else {
      navigate(v.to);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-2xl p-4 backdrop-blur-xl transition-all active:scale-[0.98] ${className}`}
      style={{
        background: v.gradient,
        border: `1px solid ${v.border}`,
      }}
    >
      <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-foreground/60 mb-2">
        {v.tag}
      </p>
      <h3 className="text-[16px] font-bold text-foreground leading-tight mb-1">
        {v.title}
      </h3>
      <p className="text-[12px] text-foreground/70 leading-relaxed mb-3">
        {v.desc}
      </p>
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
        {v.cta}
        <span aria-hidden>→</span>
      </span>
    </button>
  );
};

export default PromoBanner;
