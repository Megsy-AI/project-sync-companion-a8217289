// Lightweight Web Audio synthesizer for war SFX (no asset files)
let ctx: AudioContext | null = null;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

const tone = (
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.15,
  freqEnd?: number,
) => {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), c.currentTime + duration);
  }
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
};

export const sfx = {
  hit: () => tone(220, 0.12, "square", 0.12, 110),
  crit: () => {
    tone(880, 0.18, "sawtooth", 0.18, 220);
    setTimeout(() => tone(440, 0.15, "triangle", 0.12), 80);
  },
  combo: (level: number) => tone(440 + level * 110, 0.1, "triangle", 0.12),
  weakSpot: () => {
    tone(1320, 0.08, "square", 0.18);
    setTimeout(() => tone(1760, 0.12, "square", 0.15), 70);
  },
  bossDeath: () => {
    tone(160, 0.5, "sawtooth", 0.2, 40);
    setTimeout(() => tone(80, 0.6, "sine", 0.15, 30), 200);
  },
  bountyClaim: () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.15, "triangle", 0.16), i * 80));
  },
  golden: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, 0.2, "sine", 0.18), i * 100),
    );
  },
  warning: () => tone(660, 0.2, "square", 0.18, 440),
};