import { fmt } from "@/lib/casino";

interface BetBarProps {
  stake: string;
  onStake: (v: string) => void;
  balance: number;
  busy?: boolean;
  label?: string;
  onPlay: () => void;
  disabled?: boolean;
}

const QUICK = [0.1, 0.5, 1, 5];

const BetBar = ({ stake, onStake, balance, busy, label = "Play", onPlay, disabled }: BetBarProps) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
      <span>Bet amount</span>
      <span>Balance {fmt(balance)} Gram</span>
    </div>

    <div className="flex items-center gap-2">
      <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-4">
        <img src="/images/ton-icon.jpg" alt="" className="h-5 w-5 rounded-full object-cover" />
        <input
          value={stake}
          onChange={(e) => onStake(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder="0.00"
          className="w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <button
        type="button"
        onClick={onPlay}
        disabled={busy || disabled}
        className="btn-ink h-12 shrink-0 px-7 text-[12px] font-semibold uppercase tracking-widest disabled:opacity-50"
      >
        {busy ? "…" : label}
      </button>
    </div>

    <div className="flex gap-2">
      {QUICK.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onStake(String(q))}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[12px] text-muted-foreground"
        >
          {q}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onStake(String(Math.min(100, Math.floor(balance * 100) / 100)))}
        className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[12px] text-muted-foreground"
      >
        Max
      </button>
    </div>
  </div>
);

export default BetBar;
