import logoUrl from "@/assets/logo.png";

export function AnimatedLogo() {
  return (
    <div className="relative flex items-center justify-center group">
      <div className="absolute inset-0 bg-gradient-to-tr from-primary via-secondary to-accent opacity-40 blur-lg rounded-full animate-pulse" />
      <img
        src={logoUrl}
        alt="Clippzi"
        className="relative z-10 w-10 h-10 object-cover rounded-md"
      />
      <span className="ml-2 font-black text-2xl tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent hidden lg:block">
        CLIPPZI
      </span>
    </div>
  );
}
