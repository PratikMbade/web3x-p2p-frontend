import { createRootRoute, createRoute } from "@tanstack/react-router";
import RootLayout from "./routes/__root";
import TradingPage from "./routes/index";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TradingPage,
});

export const routeTree = rootRoute.addChildren([indexRoute]);
