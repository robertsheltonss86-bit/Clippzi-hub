/**
 * Clippzi mobile design tokens — synced from the web artifact's index.css
 * (HSL converted to hex). Clippzi uses a single dark "neon" identity, so the
 * same palette is used for both light and dark device appearances.
 */

const palette = {
  // Legacy aliases (kept for backward compatibility)
  text: "#ffffff",
  tint: "#00eeff",

  // Core surfaces
  background: "#0a0a0b",
  foreground: "#ffffff",

  // Cards / elevated surfaces
  card: "#0f0f12",
  cardForeground: "#ffffff",

  // Primary — neon cyan
  primary: "#00eeff",
  primaryForeground: "#0a0a0b",

  // Secondary — neon red/pink
  secondary: "#ff003c",
  secondaryForeground: "#ffffff",

  // Muted / subdued
  muted: "#1b1b22",
  mutedForeground: "#a1a1aa",

  // Accent — neon green
  accent: "#00ff00",
  accentForeground: "#0a0a0b",

  // Destructive
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",

  // Borders and inputs
  border: "#22222b",
  input: "#2e2e38",
};

const colors = {
  light: palette,
  dark: palette,
  radius: 8,
};

export default colors;
