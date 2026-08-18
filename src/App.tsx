import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { resolveTonManifestUrl } from "@/lib/tonconnect-manifest";
import { AppProvider } from "@/context/AppContext";
import BottomNav from "@/components/BottomNav";
import PrizeModal from "@/components/PrizeModal";
import StarryBackground from "@/components/StarryBackground";
import { useEffect, useLayoutEffect } from "react";
import {
  MiningPage,
  WarPage,
  TasksPage,
  ServersPage,
  WalletPage,
  StakingPage,
  GamesPage,
  AdminPage,
  AttackShopPage,
  NotFound,
  prefetchIdleRoutes,
} from "@/routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Telegram back button handler
const TelegramBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    if (location.pathname !== "/") {
      tg.BackButton?.show();
      const handler = () => navigate(-1);
      tg.BackButton?.onClick(handler);
      return () => {
        tg.BackButton?.offClick(handler);
        tg.BackButton?.hide();
      };
    } else {
      tg.BackButton?.hide();
    }
  }, [location.pathname, navigate]);

  return null;
};

const ResetScrollOnNavigation = () => {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const reset = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      const scrollingElement = document.scrollingElement;
      if (scrollingElement) scrollingElement.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    reset();
    const frame = window.requestAnimationFrame(reset);
    const timer = window.setTimeout(reset, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
};

const AnimatedRoutes = () => {
  useEffect(() => {
    prefetchIdleRoutes(["/", "/tasks", "/servers", "/wallet", "/staking"]);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<MiningPage />} />
      <Route path="/war" element={<WarPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/servers" element={<ServersPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/101" element={<AdminPage />} />
      <Route path="/staking" element={<StakingPage />} />
      <Route path="/ai" element={<GamesPage />} />
      <Route path="/games" element={<GamesPage />} />
      <Route path="/attack-shop" element={<AttackShopPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <TonConnectUIProvider
    manifestUrl={resolveTonManifestUrl()}
    restoreConnection={true}
    actionsConfiguration={{
      // Let TON Connect return to the Telegram view that opened the wallet.
      // A hard-coded Mini App URL makes Tonkeeper show "Unknown error" when
      // the bot/short-name differs between deployments.
      returnStrategy: "back",
    }}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner position="top-center" />
        <Toaster />

        <AppProvider>
          <BrowserRouter>
            <StarryBackground />
            <TelegramBackButton />
            <ResetScrollOnNavigation />
            <PrizeModal />
            <div className="max-w-lg mx-auto relative z-10">
              <AnimatedRoutes />
              <BottomNav />
            </div>
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </TonConnectUIProvider>
);

export default App;
