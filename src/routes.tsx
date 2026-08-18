import MiningPage from "@/pages/MiningPage";
import WarPage from "@/pages/WarPage";
import TasksPage from "@/pages/TasksPage";
import ServersPage from "@/pages/ServersPage";
import WalletPage from "@/pages/WalletPage";
import StakingPage from "@/pages/StakingPage";
import GamesPage from "@/pages/GamesPage";
import AdminPage from "@/pages/AdminPage";
import AttackShopPage from "@/pages/AttackShopPage";
import NotFound from "@/pages/NotFound";

/**
 * Route loaders kept in one place so we can both lazily render them and
 * prefetch their chunk on user intent (hover / touchstart on a nav link).
 */
export function prefetchRoute(_path: string) {
  // Routes are bundled eagerly so Telegram WebView never displays an empty
  // Suspense boundary while fetching a stale or interrupted route chunk.
}

/** Warm the most likely next routes once the app is idle. */
export function prefetchIdleRoutes(paths: string[]) {
  paths.forEach(prefetchRoute);
}

export {
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
};
