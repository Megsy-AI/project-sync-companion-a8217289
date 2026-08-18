import { motion } from "framer-motion";

interface Props { hpPercent: number; }

export const LastHitTimer = ({ hpPercent }: Props) => {
  if (hpPercent > 5 || hpPercent <= 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-16 left-1/2 -translate-x-1/2 z-10 glass rounded-full px-3 py-1 border-2 border-accent shadow-[0_0_20px_hsl(var(--accent))]"
    >
      <span className="text-xs font-display font-bold text-accent animate-pulse">
        LAST HIT BOUNTY x2 Gram
      </span>
    </motion.div>
  );
};