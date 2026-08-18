import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const PageTransition = ({ children }: { children: ReactNode }) => {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="min-h-screen bg-transparent will-change-[opacity,transform]"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.994 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.998 }}
      transition={{ duration: reduce ? 0.15 : 0.26, ease }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
