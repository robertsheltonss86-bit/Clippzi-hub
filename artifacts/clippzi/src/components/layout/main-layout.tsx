import { Link, useLocation } from "wouter";
import { Home, Compass, Radio, PlusSquare, ShoppingBag, Bell, User, ShieldAlert, LogIn, LogOut } from "lucide-react";
import { AnimatedLogo } from "./animated-logo";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useGetUser } from "@workspace/api-client-react";

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
  const isImmersive = /^\/live\/[^/]+$/.test(location);

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
    { href: profileHref, icon: User, label: "Profile" },
    ...(isAdmin ? [{ href: "/moderation", icon: ShieldAlert, label: "Mod" }] : []),
  ];

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      <aside className="hidden md:flex flex-col w-[240px] border-r border-border bg-card p-4 space-y-8">
        <Link href="/" className="flex items-center gap-3 cursor-pointer">
          <AnimatedLogo />
        </Link>

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
        </nav>

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
              <Link href="/notifications"><Bell className="w-6 h-6 text-foreground cursor-pointer" /></Link>
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
    </div>
  );
}
