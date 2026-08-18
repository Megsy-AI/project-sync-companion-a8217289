import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

const HLS_SRC = "https://stream.mux.com/tLkHO1qZoaaQOUeVWo8hEBeGQfySP02EPS02BmnNFyXys.m3u8";

const NAV_LINKS = ["PROJECTS", "BLOG", "ABOUT", "RESUME"];

const CodeNestHero = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: { destroy: () => void } | null = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = HLS_SRC;
      void video.play().catch(() => undefined);
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const instance = new Hls({ enableWorker: false });
        instance.loadSource(HLS_SRC);
        instance.attachMedia(video);
        instance.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined));
        hls = instance;
      });
    }

    return () => hls?.destroy();
  }, []);

  return (
    <section className="codenest relative min-h-screen w-full overflow-hidden bg-[#070b0a]">
      {/* Background video */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-60"
      />

      {/* Gradient overlays */}
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{ background: "linear-gradient(90deg, #070b0a 0%, rgba(7,11,10,0.6) 40%, transparent 100%)" }}
      />
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{ background: "linear-gradient(0deg, #070b0a 0%, rgba(7,11,10,0.4) 35%, transparent 75%)" }}
      />

      {/* Vertical grid lines */}
      <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
        {["25%", "50%", "75%"].map((left) => (
          <span key={left} className="absolute top-0 h-full w-px bg-white/10" style={{ left }} />
        ))}
      </div>

      {/* Central glow */}
      <svg
        className="pointer-events-none absolute left-1/2 top-[12%] h-[420px] w-[900px] -translate-x-1/2"
        viewBox="0 0 900 420"
        aria-hidden="true"
      >
        <defs>
          <filter id="cn-glow">
            <feGaussianBlur stdDeviation="25" />
          </filter>
        </defs>
        <ellipse cx="450" cy="210" rx="380" ry="90" fill="#0f4b3c" filter="url(#cn-glow)" opacity="0.75" />
        <ellipse cx="450" cy="210" rx="220" ry="45" fill="#5ed29c" filter="url(#cn-glow)" opacity="0.28" />
      </svg>

      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-6 md:px-12">
        <span className="text-lg font-extrabold uppercase tracking-[0.2em] text-white">CodeNest</span>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link}
              href="#"
              className="text-[16px] text-white/80 transition-colors hover:text-[#5ed29c]"
            >
              {link}
            </a>
          ))}
        </nav>
        <button
          type="button"
          aria-label="Open menu"
          className="text-white md:hidden"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={24} />
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#070b0a] px-6 py-6 md:hidden">
          <div className="flex items-center justify-between">
            <span className="text-lg font-extrabold uppercase tracking-[0.2em] text-white">CodeNest</span>
            <button type="button" aria-label="Close menu" className="text-white" onClick={() => setMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
          <nav className="mt-16 flex flex-col gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link}
                href="#"
                onClick={() => setMenuOpen(false)}
                className="text-2xl font-semibold text-white transition-colors hover:text-[#5ed29c]"
              >
                {link}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className="relative z-20 flex min-h-screen flex-col justify-center px-6 pb-24 pt-32 md:px-12">
        {/* Liquid glass card */}
        <div className="cn-liquid-card mb-2 h-[200px] w-[200px] -translate-y-[50px] rounded-[24px] p-5">
          <div className="flex h-full flex-col justify-between">
            <span className="text-[14px] text-white/70">[ 2025 ]</span>
            <p className="text-[18px] leading-snug text-white">
              Taught by <span className="cn-serif italic">Industry</span> Professionals
            </p>
            <p className="text-[11px] leading-relaxed text-white/60">
              Learn directly from engineers shipping production software every day.
            </p>
          </div>
        </div>

        <p className="cn-jakarta text-[11px] font-bold uppercase tracking-[0.18em] text-[#5ed29c]">
          Career-Ready Curriculum
        </p>
        <h1 className="mt-4 max-w-3xl text-[40px] font-extrabold uppercase leading-[1.02] tracking-tight text-white md:text-[72px]">
          Launch your coding career<span className="text-[#5ed29c]">.</span>
        </h1>
        <p className="mt-5 max-w-[512px] text-[14px] leading-relaxed text-white/70">
          Master in-demand coding skills with project-based lessons, mentor feedback, and a curriculum built around
          what teams actually hire for.
        </p>
        <div className="mt-8">
          <a
            href="#tasks"
            className="inline-flex items-center gap-2 rounded-full bg-[#5ed29c] px-7 py-3 text-[13px] font-bold uppercase tracking-wide text-[#070b0a] transition-transform active:scale-95"
          >
            Get Started
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
};

export default CodeNestHero;
