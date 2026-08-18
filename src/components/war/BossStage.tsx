import { useEffect, useRef } from "react";

export interface HitSignal { id: number; damage: number; crit: boolean; x?: number; y?: number }

interface Props {
  image: string;
  name: string;
  hpPercent: number;
  hit: HitSignal | null;
  className?: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; hue: number; kind: "spark" | "smoke" | "ring";
}

interface FloatText { x: number; y: number; vy: number; life: number; text: string; crit: boolean }

/**
 * Canvas-driven boss stage: living sprite (breathing, sway, rage), impact sparks,
 * shockwave rings, smoke, screen shake and floating damage — instead of a static image.
 */
export const BossStage = ({ image, name, hpPercent, hit, className }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const floats = useRef<FloatText[]>([]);
  const shake = useRef(0);
  const flash = useRef(0);
  const hpRef = useRef(hpPercent);
  const lastHitId = useRef(0);
  const raf = useRef<number>(0);

  hpRef.current = hpPercent;

  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => { imgRef.current = img; };
    return () => { imgRef.current = null; };
  }, [image]);

  // spawn impact burst
  useEffect(() => {
    if (!hit || hit.id === lastHitId.current) return;
    lastHitId.current = hit.id;
    const c = canvasRef.current;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    const px = hit.x != null ? hit.x * w : w * (0.38 + Math.random() * 0.24);
    const py = hit.y != null ? hit.y * h : h * (0.34 + Math.random() * 0.24);
    const count = hit.crit ? 46 : 26;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (hit.crit ? 3.5 : 2.2) + Math.random() * (hit.crit ? 6 : 4);
      particles.current.push({
        x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        life: 1, maxLife: 0.5 + Math.random() * 0.5, size: 1.5 + Math.random() * 2.5,
        hue: hit.crit ? 42 : 356, kind: "spark",
      });
    }
    for (let i = 0; i < 7; i++) {
      particles.current.push({
        x: px, y: py, vx: (Math.random() - 0.5) * 1.4, vy: -0.6 - Math.random(),
        life: 1, maxLife: 0.9 + Math.random() * 0.6, size: 12 + Math.random() * 18,
        hue: 0, kind: "smoke",
      });
    }
    particles.current.push({ x: px, y: py, vx: 0, vy: 0, life: 1, maxLife: 0.45, size: 6, hue: hit.crit ? 42 : 0, kind: "ring" });
    floats.current.push({ x: px, y: py, vy: -1.5, life: 1, text: `-${hit.damage}`, crit: hit.crit });
    shake.current = Math.min(1, shake.current + (hit.crit ? 1 : 0.55));
    flash.current = 1;
  }, [hit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let t = 0, prev = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now; t += dt;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const rage = 1 - Math.max(0, Math.min(1, hpRef.current / 100));
      shake.current = Math.max(0, shake.current - dt * 3.2);
      flash.current = Math.max(0, flash.current - dt * 5);

      const sx = (Math.random() - 0.5) * 18 * shake.current;
      const sy = (Math.random() - 0.5) * 18 * shake.current;

      // aura
      const aura = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, Math.max(w, h) * 0.55);
      aura.addColorStop(0, `hsla(${356 - rage * 20}, 85%, 55%, ${0.10 + rage * 0.18 + flash.current * 0.12})`);
      aura.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);

      // boss sprite
      const img = imgRef.current;
      if (img) {
        const breathe = 1 + Math.sin(t * (1.6 + rage * 1.6)) * (0.012 + rage * 0.012);
        const bob = Math.sin(t * (1.2 + rage)) * 6;
        const tilt = Math.sin(t * 0.7) * 0.02 + shake.current * (Math.random() - 0.5) * 0.06;
        const ratio = img.width / img.height;
        let dh = h * 0.82, dw = dh * ratio;
        if (dw > w * 0.92) { dw = w * 0.92; dh = dw / ratio; }
        ctx.save();
        ctx.translate(w / 2 + sx, h * 0.52 + bob + sy);
        ctx.rotate(tilt);
        ctx.scale(breathe, breathe);
        ctx.shadowColor = `hsla(${356 - rage * 20},90%,50%,${0.35 + rage * 0.35})`;
        ctx.shadowBlur = 30 + rage * 40;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        if (flash.current > 0.02) {
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillStyle = `rgba(255,255,255,${flash.current * 0.65})`;
          ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.restore();

        // ground shadow
        ctx.save();
        ctx.translate(w / 2 + sx * 0.4, h * 0.93);
        ctx.scale(1, 0.22);
        ctx.beginPath();
        ctx.arc(0, 0, dw * 0.33, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fill();
        ctx.restore();
      }

      // particles
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.life -= dt / p.maxLife;
        if (p.life <= 0) { particles.current.splice(i, 1); continue; }
        p.x += p.vx; p.y += p.vy;
        if (p.kind === "spark") {
          p.vy += 0.16; p.vx *= 0.985;
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = `hsla(${p.hue}, 100%, ${60 + p.life * 25}%, ${p.life})`;
          ctx.beginPath();
          ctx.arc(p.x + sx, p.y + sy, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        } else if (p.kind === "smoke") {
          ctx.fillStyle = `rgba(30,25,30,${p.life * 0.25})`;
          ctx.beginPath();
          ctx.arc(p.x + sx, p.y + sy, p.size * (1.6 - p.life), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = `hsla(${p.hue},100%,65%,${p.life * 0.8})`;
          ctx.lineWidth = 3 * p.life;
          ctx.beginPath();
          ctx.arc(p.x + sx, p.y + sy, (1 - p.life) * 90 + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // floating damage
      ctx.textAlign = "center";
      for (let i = floats.current.length - 1; i >= 0; i--) {
        const f = floats.current[i];
        f.life -= dt / 0.9;
        if (f.life <= 0) { floats.current.splice(i, 1); continue; }
        f.y += f.vy; f.vy *= 0.985;
        const size = (f.crit ? 34 : 24) * (0.7 + f.life * 0.45);
        ctx.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(0,0,0,${f.life * 0.8})`;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.crit ? `hsla(42,100%,62%,${f.life})` : `hsla(356,90%,64%,${f.life})`;
        ctx.fillText(f.text, f.x, f.y);
      }

      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf.current); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-label={name}
      className={className ?? "w-full h-full"}
    />
  );
};

export default BossStage;
