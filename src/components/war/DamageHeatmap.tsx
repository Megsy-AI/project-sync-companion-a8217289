interface Contributor { user_id: string; total: number; color: string; }
interface Props { contributors: Contributor[]; maxHp: number; }

export const DamageHeatmap = ({ contributors, maxHp }: Props) => {
  if (contributors.length === 0) return null;
  const totalDmg = contributors.reduce((s, c) => s + c.total, 0);
  if (totalDmg === 0) return null;

  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden mt-1 bg-muted/40">
      {contributors.slice(0, 5).map((c) => {
        const pct = (c.total / maxHp) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={c.user_id}
            className="h-full transition-all"
            style={{ width: `${pct}%`, background: c.color }}
            title={`${c.total} damage`}
          />
        );
      })}
    </div>
  );
};