// 50 distinct color themes — each defined by its primary HSL hue + saturation tuning.
// The active theme rotates twice per day (every 12 hours) based on UTC date.
export interface Theme {
  name: string;
  hue: number;
  sat: number; // primary saturation
  accentHue: number; // accent (slight shift from primary)
}

export const THEMES: Theme[] = [
  { name: "Rose",          hue: 340, sat: 75, accentHue: 350 },
  { name: "Crimson",       hue: 350, sat: 78, accentHue: 0   },
  { name: "Ruby",          hue: 355, sat: 80, accentHue: 10  },
  { name: "Coral",         hue: 12,  sat: 82, accentHue: 22  },
  { name: "Sunset",        hue: 18,  sat: 85, accentHue: 30  },
  { name: "Tangerine",     hue: 25,  sat: 88, accentHue: 35  },
  { name: "Amber",         hue: 35,  sat: 90, accentHue: 45  },
  { name: "Honey",         hue: 42,  sat: 88, accentHue: 50  },
  { name: "Gold",          hue: 48,  sat: 85, accentHue: 55  },
  { name: "Lemon",         hue: 55,  sat: 80, accentHue: 62  },
  { name: "Lime",          hue: 75,  sat: 70, accentHue: 85  },
  { name: "Olive",         hue: 85,  sat: 55, accentHue: 95  },
  { name: "Spring",        hue: 95,  sat: 65, accentHue: 110 },
  { name: "Mint",          hue: 150, sat: 60, accentHue: 160 },
  { name: "Emerald",       hue: 155, sat: 70, accentHue: 165 },
  { name: "Forest",        hue: 145, sat: 55, accentHue: 155 },
  { name: "Jade",          hue: 165, sat: 65, accentHue: 175 },
  { name: "Teal",          hue: 175, sat: 70, accentHue: 185 },
  { name: "Aqua",          hue: 185, sat: 75, accentHue: 195 },
  { name: "Cyan",          hue: 190, sat: 78, accentHue: 200 },
  { name: "Sky",           hue: 200, sat: 80, accentHue: 210 },
  { name: "Azure",         hue: 210, sat: 78, accentHue: 220 },
  { name: "Sapphire",      hue: 220, sat: 75, accentHue: 230 },
  { name: "Cobalt",        hue: 225, sat: 72, accentHue: 235 },
  { name: "Royal",         hue: 235, sat: 70, accentHue: 245 },
  { name: "Indigo",        hue: 245, sat: 68, accentHue: 255 },
  { name: "Iris",          hue: 255, sat: 70, accentHue: 265 },
  { name: "Lavender",      hue: 265, sat: 65, accentHue: 275 },
  { name: "Violet",        hue: 275, sat: 70, accentHue: 285 },
  { name: "Purple",        hue: 280, sat: 72, accentHue: 290 },
  { name: "Plum",          hue: 290, sat: 70, accentHue: 300 },
  { name: "Magenta",       hue: 300, sat: 75, accentHue: 310 },
  { name: "Orchid",        hue: 310, sat: 72, accentHue: 320 },
  { name: "Fuchsia",       hue: 320, sat: 78, accentHue: 330 },
  { name: "Pink",          hue: 330, sat: 80, accentHue: 340 },
  { name: "Bubblegum",     hue: 335, sat: 82, accentHue: 345 },
  { name: "Peach",         hue: 20,  sat: 78, accentHue: 28  },
  { name: "Apricot",       hue: 28,  sat: 80, accentHue: 38  },
  { name: "Marigold",      hue: 40,  sat: 85, accentHue: 48  },
  { name: "Mustard",       hue: 50,  sat: 75, accentHue: 58  },
  { name: "Chartreuse",    hue: 70,  sat: 75, accentHue: 80  },
  { name: "Seafoam",       hue: 160, sat: 60, accentHue: 170 },
  { name: "Turquoise",     hue: 178, sat: 72, accentHue: 188 },
  { name: "Glacier",       hue: 195, sat: 70, accentHue: 205 },
  { name: "Steel",         hue: 215, sat: 60, accentHue: 225 },
  { name: "Midnight",      hue: 230, sat: 65, accentHue: 240 },
  { name: "Twilight",      hue: 250, sat: 65, accentHue: 260 },
  { name: "Mauve",         hue: 295, sat: 60, accentHue: 305 },
  { name: "Berry",         hue: 315, sat: 72, accentHue: 325 },
  { name: "Flamingo",      hue: 345, sat: 80, accentHue: 355 },
];

/**
 * Returns the active theme based on UTC time.
 * Rotates twice per day: a new theme at 00:00 UTC and at 12:00 UTC.
 * The slot index marches forward continuously so themes cycle through all 50.
 */
export const getActiveTheme = (now: Date = new Date()): Theme => {
  // Slot = (days since epoch) * 2 + (1 if PM)
  const msPerDay = 86_400_000;
  const dayIndex = Math.floor(now.getTime() / msPerDay);
  const halfDay = now.getUTCHours() >= 12 ? 1 : 0;
  const slot = dayIndex * 2 + halfDay;
  const idx = ((slot % THEMES.length) + THEMES.length) % THEMES.length;
  return THEMES[idx];
};

/**
 * Applies the theme's HSL values to CSS custom properties on :root.
 * Only color tokens that depend on the primary hue are overridden — neutrals stay.
 */
export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  const h = theme.hue;
  const s = theme.sat;
  const a = theme.accentHue;

  const set = (name: string, value: string) => root.style.setProperty(name, value);

  set("--background",            `${h} 60% 98%`);
  set("--foreground",            `${h} 25% 15%`);
  set("--card",                  `0 0% 100%`);
  set("--card-foreground",       `${h} 25% 15%`);
  set("--popover",               `0 0% 100%`);
  set("--popover-foreground",    `${h} 25% 15%`);
  set("--primary",               `${h} ${s}% 60%`);
  set("--primary-foreground",    `0 0% 100%`);
  set("--secondary",             `${h} 50% 92%`);
  set("--secondary-foreground",  `${h} 30% 25%`);
  set("--muted",                 `${h} 30% 95%`);
  set("--muted-foreground",      `${h} 15% 45%`);
  set("--accent",                `${a} ${s}% 65%`);
  set("--accent-foreground",     `0 0% 100%`);
  set("--border",                `${h} 30% 90%`);
  set("--input",                 `${h} 30% 92%`);
  set("--ring",                  `${h} ${s}% 60%`);
  set("--ton-blue",              `${h} ${s}% 55%`);
  set("--neon-green",            `${a} ${Math.max(s - 5, 50)}% 50%`);
  set("--gold",                  `${a} ${s}% 70%`);
  set("--sidebar-background",    `${h} 50% 97%`);
  set("--sidebar-foreground",    `${h} 25% 15%`);
  set("--sidebar-primary",       `${h} ${s}% 60%`);
  set("--sidebar-accent",        `${h} 30% 95%`);
  set("--sidebar-accent-foreground", `${h} 25% 15%`);
  set("--sidebar-border",        `${h} 30% 90%`);
  set("--sidebar-ring",          `${h} ${s}% 60%`);

  document.documentElement.style.backgroundColor = `hsl(${h} 60% 98%)`;
  document.body.style.backgroundColor = `hsl(${h} 60% 98%)`;
};

/**
 * Returns the milliseconds until the next 12-hour rotation boundary (UTC).
 */
export const msUntilNextRotation = (now: Date = new Date()): number => {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  if (now.getUTCHours() < 12) {
    next.setUTCHours(12);
  } else {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(0);
  }
  return next.getTime() - now.getTime();
};
