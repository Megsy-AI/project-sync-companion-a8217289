import "./lib/buffer-polyfill";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installProtection } from "@/lib/protect";
import { pruneCache } from "@/lib/cache";
import { pruneImages } from "@/lib/image-cache";
import { applyPerfMode } from "@/lib/perf";

installProtection();
applyPerfMode();

// Periodic cache hygiene so localStorage never fills up and data stays fresh.
setInterval(() => {
  pruneCache(0.2);
  pruneImages(0.2);
}, 30 * 60 * 1000);

createRoot(document.getElementById("root")!).render(<App />);
