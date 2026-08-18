import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { resolveAppOrigin } from "./scripts/app-origin.mjs";

// https://vitejs.dev/config/
const APP_ORIGIN = resolveAppOrigin();

export default defineConfig(({ mode }) => ({
  define: {
    __NOVA_BUILD_ORIGIN__: JSON.stringify(APP_ORIGIN),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    // Hooks must always resolve through the same React module instance. Vite can
    // otherwise create a second pre-bundled copy for Radix/TON dependencies,
    // leaving ReactCurrentDispatcher null at runtime.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "es2020",
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    minify: "esbuild",
    rollupOptions: {
      output: {
        // Keep Rollup's dependency graph intact. Separating React from packages
        // that initialize contexts at module load creates a circular production
        // chunk and crashes the app before #root can render.
        manualChunks: undefined,
      },
    },
  },

  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
    legalComments: "none",
  },
  optimizeDeps: {
    // Increment only after dependency-cache incidents. This value participates
    // in Vite's optimizer hash, forcing long-lived Telegram/Lovable WebViews to
    // discard immutable pre-bundles from an interrupted optimization pass.
    esbuildOptions: {
      define: {
        __NOVA_DEP_CACHE_VERSION__: '"2026-08-16-1"',
      },
    },
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react-router-dom",
      "@radix-ui/react-tooltip",
      "@tonconnect/ui-react",
    ],
  },
}));
