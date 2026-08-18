import { forwardRef } from "react";

type Props = { className?: string };

/** Telegram Stars (XTR) glyph — the golden faceted star used by Telegram. */
const TelegramStar = forwardRef<SVGSVGElement, Props>(({ className }, ref) => (
  <svg ref={ref} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="tg-star-a" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFD75E" />
        <stop offset="55%" stopColor="#FFB114" />
        <stop offset="100%" stopColor="#F08C00" />
      </linearGradient>
    </defs>
    <path
      fill="url(#tg-star-a)"
      d="M12 1.9c.46 0 .88.26 1.09.67l2.6 5.27 5.82.85c.45.06.83.38.97.81.14.44.02.91-.3 1.23l-4.21 4.1.99 5.79c.08.45-.11.9-.48 1.17-.37.27-.86.3-1.27.09L12 19.15l-5.21 2.73c-.4.21-.89.18-1.26-.09a1.18 1.18 0 0 1-.48-1.17l.99-5.79-4.21-4.1a1.18 1.18 0 0 1-.3-1.23c.14-.43.52-.75.97-.81l5.82-.85 2.6-5.27c.2-.41.62-.67 1.08-.67Z"
    />
    <path
      fill="#FFF0B8"
      opacity=".55"
      d="M12 1.9c.46 0 .88.26 1.09.67l2.6 5.27-3.6 1.1-3.61-1.1 2.6-5.27c.2-.41.62-.67 1.08-.67Z"
    />
  </svg>
));

TelegramStar.displayName = "TelegramStar";

export default TelegramStar;
