import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface GiftAnimationPayload {
  key: number;
  name: string;
  emoji?: string | null;
  iconUrl?: string | null;
  rarity: string;
  senderName?: string;
}

const RARITY_THEME: Record<string, { ring: string; glow: string; particles: string[] }> = {
  legendary: { ring: "from-amber-300 via-yellow-500 to-orange-600", glow: "rgba(251,191,36,0.9)", particles: ["#fbbf24", "#f59e0b", "#fde047", "#fff"] },
  epic: { ring: "from-fuchsia-400 via-purple-500 to-indigo-600", glow: "rgba(192,132,252,0.9)", particles: ["#c084fc", "#a855f7", "#e879f9", "#fff"] },
  rare: { ring: "from-sky-300 via-blue-500 to-cyan-500", glow: "rgba(56,189,248,0.85)", particles: ["#38bdf8", "#0ea5e9", "#67e8f9", "#fff"] },
  common: { ring: "from-emerald-300 via-green-500 to-teal-500", glow: "rgba(52,211,153,0.8)", particles: ["#34d399", "#10b981", "#6ee7b7", "#fff"] },
};

function theme(rarity: string) {
  return RARITY_THEME[rarity] ?? RARITY_THEME.common;
}

export function GiftAnimationOverlay({
  gift,
  onDone,
}: {
  gift: GiftAnimationPayload | null;
  onDone: () => void;
}) {
  // Self-contained: keep our own copy of the active gift so the visual plays for
  // its full duration regardless of when the parent clears its state.
  const [active, setActive] = useState<GiftAnimationPayload | null>(null);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Ingest: copy incoming gift into internal state. Latest gift replaces any
  // in-flight one (replace policy).
  useEffect(() => {
    if (gift) setActive(gift);
  }, [gift?.key]);

  // Dismiss timer owned by `active` so the parent clearing its prop cannot
  // cancel playback. Plays for the full duration regardless of parent state.
  useEffect(() => {
    if (!active) return;
    const big = active.rarity === "legendary" || active.rarity === "epic";
    const duration = big ? 3600 : 2000;
    const t = setTimeout(() => {
      setActive(null);
      onDoneRef.current();
    }, duration);
    return () => clearTimeout(t);
  }, [active?.key]);

  const isBig = active ? active.rarity === "legendary" || active.rarity === "epic" : false;
  const t = theme(active?.rarity ?? "common");

  const particles = useMemo(() => {
    if (!active) return [];
    const count = isBig ? 28 : 12;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (360 / count) * i + Math.random() * 12,
      distance: (isBig ? 220 : 120) + Math.random() * 120,
      size: 6 + Math.random() * (isBig ? 14 : 8),
      color: t.particles[i % t.particles.length],
      delay: Math.random() * 0.15,
    }));
  }, [active, isBig, t.particles]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.key}
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="gift-animation-overlay"
        >
          {isBig && (
            <motion.div
              className="absolute inset-0"
              style={{ background: `radial-gradient(circle at center, ${t.glow} 0%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.85) 100%)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 3.6, times: [0, 0.15, 0.7, 1] }}
            />
          )}

          {/* expanding glow ring */}
          <motion.div
            className={`absolute rounded-full bg-gradient-to-br ${t.ring}`}
            style={{ width: 160, height: 160, filter: "blur(8px)" }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: isBig ? 9 : 4, opacity: 0 }}
            transition={{ duration: isBig ? 1.6 : 1.1, ease: "easeOut" }}
          />

          {/* particles */}
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{ width: p.size, height: p.size, background: p.color, boxShadow: `0 0 10px ${p.color}` }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
                y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
                opacity: 0,
                scale: 0.3,
              }}
              transition={{ duration: isBig ? 1.8 : 1.1, delay: p.delay, ease: "easeOut" }}
            />
          ))}

          {/* gift icon */}
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ scale: 0, rotate: -25, opacity: 0 }}
            animate={
              isBig
                ? { scale: [0, 1.3, 1, 1.08, 1], rotate: [-25, 0, 0, 0, 0], opacity: [0, 1, 1, 1, 1] }
                : { scale: [0, 1.2, 1], rotate: [-15, 0, 0], opacity: [0, 1, 1] }
            }
            transition={{ duration: isBig ? 1.2 : 0.7, ease: "easeOut" }}
          >
            <div
              className={`flex items-center justify-center rounded-full bg-gradient-to-br ${t.ring} p-1 ${isBig ? "w-44 h-44" : "w-28 h-28"}`}
              style={{ boxShadow: `0 0 40px ${t.glow}` }}
            >
              <div className="w-full h-full rounded-full bg-black/70 flex items-center justify-center overflow-hidden">
                {active.iconUrl ? (
                  <img src={active.iconUrl} alt={active.name} className={`object-contain ${isBig ? "w-32 h-32" : "w-20 h-20"}`} />
                ) : (
                  <span className={isBig ? "text-7xl" : "text-5xl"}>{active.emoji ?? "🎁"}</span>
                )}
              </div>
            </div>
            <motion.div
              className="mt-4 text-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <div
                className={`font-extrabold uppercase tracking-wide bg-gradient-to-r ${t.ring} bg-clip-text text-transparent ${isBig ? "text-3xl" : "text-xl"}`}
                style={{ filter: `drop-shadow(0 0 10px ${t.glow})` }}
              >
                {active.name}
              </div>
              {active.senderName && (
                <div className="text-white/90 text-sm mt-1 font-medium drop-shadow">from {active.senderName}</div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
