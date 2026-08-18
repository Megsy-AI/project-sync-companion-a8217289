import { motion } from "framer-motion";

interface Props {
  x: number; // 0-100 %
  y: number; // 0-100 %
  onHit: () => void;
}

export const WeakSpot = ({ x, y, onHit }: Props) => (
  <motion.button
    type="button"
    onClick={(e) => { e.stopPropagation(); onHit(); }}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: [0, 1.2, 1], opacity: 1 }}
    exit={{ scale: 0, opacity: 0 }}
    transition={{ duration: 0.3 }}
    className="absolute w-12 h-12 -translate-x-1/2 -translate-y-1/2 rounded-full z-20"
    style={{ left: `${x}%`, top: `${y}%` }}
  >
    <span className="absolute inset-0 rounded-full bg-destructive/40 animate-ping" />
    <span className="absolute inset-2 rounded-full bg-destructive border-2 border-accent shadow-[0_0_20px_hsl(var(--destructive))]" />
    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-accent-foreground">3x</span>
  </motion.button>
);