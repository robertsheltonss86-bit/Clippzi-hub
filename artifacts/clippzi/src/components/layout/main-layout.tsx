import { Link, useLocation } from "wouter";
import { Home, Compass, Radio, PlusSquare, ShoppingBag, Bell, User, ShieldAlert } from "lucide-react";
import { AnimatedLogo } from "./animated-logo";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "For You" },
    { href: "/explore", icon: Compass, label: "Explore" },
    { href: "/live", icon: Radio, label: "Live" },
    { href: "/upload", icon: PlusSquare, label: "Create" },
    { href: "/shop", icon: ShoppingBag, label: "Shop" },
    { href: "/notifications", icon: Bell, label: "Updates" },
    { href: "/profile/1", icon: User, label: "Profile" }, // Hardcoded 1 for demo
    { href: "/moderation", icon: ShieldAlert, label: "Mod" },
  ];

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden text-foreground">
      {/* Desktop Sidebar */}
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
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isActive ? "text-primary" : ""}`} />
                  <span className="text-lg">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background z-50 absolute top-0 w-full">
          <Link href="/">
            <div className="cursor-pointer">
              <AnimatedLogo />
            </div>
          </Link>
          <div className="flex gap-4">
             <Link href="/notifications">
               <Bell className="w-6 h-6 text-foreground cursor-pointer" />
             </Link>
          </div>
        </header>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto h-full w-full pb-[60px] md:pb-0 pt-[70px] md:pt-0 scroll-smooth">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden absolute bottom-0 w-full h-[60px] border-t border-border bg-background flex items-center justify-around px-2 z-50">
        {navItems.slice(0, 5).map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div className="flex flex-col items-center justify-center p-2 cursor-pointer">
                <Icon
                  className={`w-6 h-6 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
