export function AnimatedLogo() {
  return (
    <div className="relative flex items-center justify-center group overflow-hidden">
      {/* Glow effect behind */}
      <div className="absolute inset-0 bg-gradient-to-tr from-primary via-secondary to-accent opacity-30 blur-md rounded-full animate-pulse"></div>
      
      {/* The Flame Icon via SVG */}
      <svg 
        width="40" 
        height="40" 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10"
      >
        <path 
          d="M12 2C12 2 8 6.5 8 11.5C8 16.5 12 20 12 20C12 20 16 16.5 16 11.5C16 6.5 12 2 12 2Z" 
          fill="url(#fire-gradient)" 
          className="animate-[pulse_2s_ease-in-out_infinite]"
        />
        <path 
          d="M12 20C12 20 10 17.5 10 14.5C10 12.5 12 10 12 10C12 10 14 12.5 14 14.5C14 17.5 12 20 12 20Z" 
          fill="#000000" 
        />
        <defs>
          <linearGradient id="fire-gradient" x1="12" y1="2" x2="12" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-primary)" />
            <stop offset="0.5" stopColor="var(--color-accent)" />
            <stop offset="1" stopColor="var(--color-secondary)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="ml-2 font-black text-2xl tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent hidden lg:block">
        CLIPPZI
      </span>
    </div>
  );
}