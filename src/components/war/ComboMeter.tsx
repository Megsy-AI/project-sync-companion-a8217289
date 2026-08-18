import { motion, AnimatePresence } from "framer-motion";

interface Props { combo: number; multiplier: number; }

export const ComboMeter = ({ combo, multiplier }: Props) => (
  <AnimatePresence>
    {combo >= 2 && (
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.6 }}
        className="absolute top-12 right-2 z-10 glass rounded-xl px-3 py-1.5 border border-primary/50 shadow-lg"
      >
        <div className="text-[9px] text-muted-foreground font-display uppercase">Combo</div>
        <div className="text-lg font-display font-bold text-primary leading-none">x{multiplier.toFixed(1)}</div>
        <div className="text-[9px] text-accent font-display">{combo} hits</div>
      </motion.div>
    )}
  </AnimatePresence>
);