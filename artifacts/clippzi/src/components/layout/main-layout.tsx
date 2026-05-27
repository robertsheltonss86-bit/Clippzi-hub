import { Link, useLocation } from "wouter";
import { Home, Compass, Radio, PlusSquare, ShoppingBag, Bell, User, ShieldAlert, LogIn, LogOut } from "lucide-react";
import { AnimatedLogo } from "./animated-logo";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isAuthenticated, isAdmin, userId, user, login, logout, isLoading } = useCurrentUser();
  const isImmersive = /^\/live\/[^/]+$/.test(location);

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
              <div className="text-xs text-muted-foreground truncate" data-testid="text-current-user">
                {user?.email || user?.firstName || "Signed in"}
              </div>
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
          <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background z-50 absolute top-0 w-full">
            <Link href="/">
              <div className="cursor-pointer"><AnimatedLogo /></div>
            </Link>
            <div className="flex gap-4 items-center">
              {!isLoading && (isAuthenticated ? (
                <button onClick={logout} className="text-sm text-muted-foreground" data-testid="button-logout-mobile">Logout</button>
              ) : (
                <button onClick={login} className="text-sm font-semibold text-primary" data-testid="button-login-mobile">Login</button>
              ))}
              <Link href="/notifications"><Bell className="w-6 h-6 text-foreground cursor-pointer" /></Link>
            </div>
          </header>
        )}

        <div className={`flex-1 overflow-y-auto h-full w-full scroll-smooth ${isImmersive ? "" : "pb-[60px] md:pb-0 pt-[70px] md:pt-0"}`}>
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
