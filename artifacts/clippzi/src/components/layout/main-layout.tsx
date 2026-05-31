import { Link, useLocation } from "wouter";
import { Home, Compass, Radio, PlusSquare, ShoppingBag, Bell, User, ShieldAlert, LogIn, LogOut, MessageCircle, Coins, Plus, LifeBuoy, Settings } from "lucide-react";
import { AnimatedLogo } from "./animated-logo";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useGetUser } from "@workspace/api-client-react";
import { CoinStore } from "@/components/coins/coin-store";
import { useCoinBalance } from "@/hooks/use-coin-balance";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { WhosLiveButton } from "@/components/live/whos-live-button";

// A circular "my account" avatar that links straight to the signed-in user's
// own profile, where they can edit their photo, banner, and bio. It prefers the
// photo the user uploaded (app user avatarUrl), then their Replit profile photo,
// then their initials.
function ProfileBubble({
  userId,
  fallbackName,
  fallbackImage,
  className = "w-9 h-9",
}: {
  userId: number;
  fallbackName?: string | null;
  fallbackImage?: string | null;
  className?: string;
}) {
  const { data: appUser } = useGetUser(userId);
  const avatar = appUser?.avatarUrl || fallbackImage || null;
  const name = appUser?.displayName || fallbackName || "?";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  // Renders only the avatar visual — callers wrap it in a <Link> so we never
  // nest anchors (which breaks click/focus/accessibility).
  return (
    <div
      className={`${className} rounded-full overflow-hidden bg-muted flex items-center justify-center text-sm font-bold text-foreground cursor-pointer ring-2 ring-primary active:scale-95 transition`}
      data-testid="button-profile-bubble"
      title="My profile"
    >
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isAuthenticated, isAdmin, userId, user, login, logout, isLoading } = useCurrentUser();
  const { toast } = useToast();
  const { balance: coinBalance } = useCoinBalance();
  const [coinStoreOpen, setCoinStoreOpen] = useState(false);
  const isImmersive = /^\/live\/[^/]+$/.test(location);

  // The treasure chest lets anyone top up coins from any page. Signed-out users
  // are sent to log in first, since buying coins needs an account.
  const openCoinStore = () => {
    if (!isAuthenticated) { login(); return; }
    setCoinStoreOpen(true);
  };

  // One-time Community Guidelines welcome for newly signed-in users.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    const key = `clippzi:guidelines-seen:${userId}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    toast({
      title: "Welcome to Clippzi 👋",
      description:
        "Keep it kind! Posts, comments, and live chat are auto-moderated by AI. Content that breaks our Community Guidelines (bullying, harassment, drugs, hate, nudity, or violence) may be blocked or removed.",
      duration: 9000,
    });
  }, [isAuthenticated, userId, toast]);

  const baseItems = [
    { href: "/", icon: Home, label: "For You" },
    { href: "/explore", icon: Compass, label: "Explore" },
    { href: "/live", icon: Radio, label: "Live" },
    { href: "/upload", icon: PlusSquare, label: "Create" },
    { href: "/shop", icon: ShoppingBag, label: "Shop" },
    { href: "/notifications", icon: Bell, label: "Updates" },
  ];
  const profileHref = userId ? `/profile/${userId}` : "/";
  const navItems = [
    ...baseItems,
    { href: "/messages", icon: MessageCircle, label: "Messages" },
    { href: profileHref, icon: User, label: "Profile" },
    { href: "/support", icon: LifeBuoy, label: "Help" },
    ...(isAdmin ? [{ href: "/moderation", icon: ShieldAlert, label: "Mod" }] : []),
  ];

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      <aside className="hidden md:flex flex-col w-[240px] border-r border-border bg-card p-4 space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 cursor-pointer">
            <AnimatedLogo />
          </Link>
          <WhosLiveButton variant="circle" testId="button-whos-live-desktop" />
        </div>

        <nav className="flex flex-col space-y-2 flex-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className={`w-6 h-6 ${isActive ? "text-primary" : ""}`} />
                  <span className="text-lg">{item.label}</span>
                </div>
              </Link>
            );
          })}
          <SettingsMenu>
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200 cursor-pointer w-full text-left"
              data-testid="button-settings"
            >
              <Settings className="w-6 h-6" />
              <span className="text-lg">Settings</span>
            </button>
          </SettingsMenu>
        </nav>

        <button
          onClick={openCoinStore}
          className="flex items-center gap-3 w-full rounded-lg bg-gradient-to-r from-amber-500/15 to-amber-600/10 border border-amber-400/40 px-3 py-2.5 hover:from-amber-500/25 hover:to-amber-600/20 active:scale-[0.98] transition"
          data-testid="button-treasure-chest"
          title="Get coins"
        >
          <img src={`${import.meta.env.BASE_URL}gifts/treasure-chest.png`} alt="" className="w-8 h-8 object-contain shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-bold text-amber-400 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> {isAuthenticated ? coinBalance.toLocaleString() : "Get Coins"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">Buy coins to send gifts</div>
          </div>
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-black shrink-0"><Plus className="w-4 h-4" /></span>
        </button>

        <div className="border-t border-border pt-4">
          {isLoading ? (
            <div className="h-9" />
          ) : isAuthenticated ? (
            <div className="space-y-2">
              {userId ? (
                <Link href={profileHref}>
                  <div className="flex items-center gap-2 cursor-pointer rounded-lg p-1 hover:bg-muted transition-colors" data-testid="link-profile-bubble">
                    <ProfileBubble userId={userId} fallbackName={user?.firstName} fallbackImage={user?.profileImageUrl} />
                    <div className="text-xs text-muted-foreground truncate flex-1" data-testid="text-current-user">
                      {user?.email || user?.firstName || "View profile"}
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="text-xs text-muted-foreground truncate" data-testid="text-current-user">
                  {user?.email || user?.firstName || "Signed in"}
                </div>
              )}
              <Button onClick={logout} variant="outline" size="sm" className="w-full" data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </Button>
            </div>
          ) : (
            <Button onClick={login} className="w-full" data-testid="button-login">
              <LogIn className="w-4 h-4 mr-2" /> Log in
            </Button>
          )}
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col">
        {!isImmersive && (
          <header className="md:hidden flex items-center justify-between px-4 pb-3 border-b border-border bg-background z-50 absolute top-0 w-full" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
            <Link href="/">
              <div className="cursor-pointer"><AnimatedLogo /></div>
            </Link>
            <div className="flex gap-4 items-center">
              <button onClick={openCoinStore} data-testid="button-treasure-chest-mobile" aria-label="Get coins" className="active:scale-95 transition">
                <img src={`${import.meta.env.BASE_URL}gifts/treasure-chest.png`} alt="" className="w-7 h-7 object-contain drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
              </button>
              <Link href="/messages"><MessageCircle className="w-6 h-6 text-foreground cursor-pointer" /></Link>
              <Link href="/notifications"><Bell className="w-6 h-6 text-foreground cursor-pointer" /></Link>
              <SettingsMenu>
                <button data-testid="button-settings-mobile" aria-label="Settings" className="active:scale-95 transition">
                  <Settings className="w-6 h-6 text-foreground cursor-pointer" />
                </button>
              </SettingsMenu>
              <WhosLiveButton variant="circle" testId="button-whos-live-mobile" />
              {!isLoading && (
                isAuthenticated && userId ? (
                  <Link href={profileHref} data-testid="link-profile-bubble-mobile">
                    <ProfileBubble userId={userId} fallbackName={user?.firstName} fallbackImage={user?.profileImageUrl} className="w-8 h-8" />
                  </Link>
                ) : isAuthenticated ? (
                  <button onClick={logout} className="text-sm text-muted-foreground" data-testid="button-logout-mobile">Logout</button>
                ) : (
                  <button onClick={login} className="text-sm font-semibold text-primary" data-testid="button-login-mobile">Login</button>
                )
              )}
            </div>
          </header>
        )}

        <div className={`flex-1 overflow-y-auto h-full w-full scroll-smooth ${isImmersive ? "" : "pb-[60px] md:pb-0 pt-[calc(70px+env(safe-area-inset-top))] md:pt-0"}`}>
          {children}
        </div>
      </main>

      <nav className={`${isImmersive ? "hidden" : "md:hidden"} absolute bottom-0 w-full h-[60px] border-t border-border bg-background flex items-center justify-around px-2 z-50`}>
        {navItems.slice(0, 5).map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div className="flex flex-col items-center justify-center p-2 cursor-pointer">
                <Icon className={`w-6 h-6 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              </div>
            </Link>
          );
        })}
      </nav>

      <CoinStore open={coinStoreOpen} onOpenChange={setCoinStoreOpen} balance={coinBalance} />
    </div>
  );
}
