import { motion } from "framer-motion";

const POINTS = [
  "Every NFT you buy is minted straight to your TON wallet.",
  "It stays yours — resell or transfer it any time on any TON market.",
  "Owning one keeps boosting your mining while you hold it.",
];

/** Short editorial intro explaining NFT ownership on the collection page. */
const NftExplainer = () => (
  <motion.section
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    className="paper-card mb-5 overflow-hidden p-0"
  >
    <img
      src="/images/nft-cover.png"
      alt="Collection artwork preview"
      className="h-36 w-full object-cover"
      loading="lazy"
      decoding="async"
    />
    <div className="p-5">
      <p className="paper-eyebrow">Real ownership</p>
      <h2 className="mt-1 font-display text-[20px] leading-tight text-foreground">
        Your NFT lands in your wallet
      </h2>
      <ul className="mt-3 space-y-2">
        {POINTS.map((point) => (
          <li key={point} className="flex gap-2.5 text-[12px] leading-relaxed text-muted-foreground">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/70" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  </motion.section>
);

export default NftExplainer;
