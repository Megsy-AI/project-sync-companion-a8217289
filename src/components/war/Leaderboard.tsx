interface Entry { user_id: string; username: string; photo_url?: string; total: number; }
interface Props { entries: Entry[]; tonPool: number; }

export const Leaderboard = ({ entries, tonPool }: Props) => {
  if (entries.length === 0) return null;
  const totalDmg = entries.reduce((s, e) => s + e.total, 0);
  const top = entries.slice(0, 5);

  return (
    <div className="glass rounded-2xl p-2 mb-2">
      <div className="text-[10px] font-display text-muted-foreground uppercase mb-1 px-1">Top Attackers</div>
      <div className="space-y-1">
        {top.map((e, i) => {
          const share = totalDmg > 0 ? (e.total / totalDmg) * (tonPool * 0.6) : 0;
          return (
            <div key={e.user_id} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-accent font-bold">{i + 1}</span>
              {e.photo_url ? (
                <img src={e.photo_url} alt="" className="w-5 h-5 rounded-full object-cover"  loading="lazy" decoding="async" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[8px] text-primary font-bold">
                  {e.username[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-foreground truncate flex-1 font-display">{e.username}</span>
              <span className="text-destructive font-display">{e.total}</span>
              <span className="text-ton-blue font-display text-[10px]">~{share.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};