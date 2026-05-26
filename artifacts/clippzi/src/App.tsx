import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { MainLayout } from "./components/layout/main-layout";

import Home from "@/pages/home";
import Explore from "@/pages/explore";
import LiveBrowser from "@/pages/live-browser";
import LiveStream from "@/pages/live-stream";
import Upload from "@/pages/upload";
import Shop from "@/pages/shop";
import ProductDetail from "@/pages/product-detail";
import Orders from "@/pages/orders";
import Profile from "@/pages/profile";
import Earnings from "@/pages/earnings";
import Notifications from "@/pages/notifications";
import Moderation from "@/pages/moderation";

const queryClient = new QueryClient();

function Router() {
  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/live" component={LiveBrowser} />
        <Route path="/live/:id" component={LiveStream} />
        <Route path="/upload" component={Upload} />
        <Route path="/shop" component={Shop} />
        <Route path="/shop/orders" component={Orders} />
        <Route path="/shop/:id" component={ProductDetail} />
        <Route path="/profile/:id" component={Profile} />
        <Route path="/profile/:id/earnings" component={Earnings} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/moderation" component={Moderation} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
