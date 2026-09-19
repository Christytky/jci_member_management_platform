/**
 * JCI design tokens. PRD section 13.
 *
 * Colours come from here only. Never write a hex literal in a page --
 * that rule is in .cursorrules and it is what keeps the app looking like
 * one system rather than five people's preferences.
 */

/** Official JCI brand palette, for interface chrome only (PRD 13.1). */
export const brand = {
  blue: "#0097D7",
  black: "#130F2D",
  white: "#FFFFFF",
  navy: "#1F4789",
  teal: "#57BCBC",
  yellow: "#EFC40F",
} as const;

/**
 * Chart series colours (PRD 13.2).
 *
 * Deliberately NOT the raw brand hexes. The brand palette was designed for
 * print and interface: used directly as chart series, navy is too dark and
 * yellow too light to share a lightness band, teal reads as grey, and
 * blue-against-teal is indistinguishable to a colour-blind viewer. These
 * are the same JCI hues stepped to pass contrast, chroma and colour-vision
 * separation across every pair.
 */
export const series = {
  joined: "#1590CA",
  inducted: "#D2AE1C",
  senior: "#0551C1",
  departed: "#D33B36",
} as const;

/** Reserved for health bands and alert severity. Never reuse as a series. */
export const status = {
  healthy: "#149676",
  watch: "#EF8619",
  risk: "#B71824",
} as const;

export const healthBand = {
  Healthy: { color: status.healthy, label: "Healthy", bg: "#E7F5F0", icon: "●" },
  Watch: { color: status.watch, label: "Watch", bg: "#FDF0E2", icon: "◐" },
  "At risk": { color: status.risk, label: "At risk", bg: "#FCE9EA", icon: "▲" },
  "N/A": { color: "#8A8AA3", label: "N/A", bg: "#F2F6F9", icon: "–" },
} as const;

export const severity = {
  "At risk": { color: status.risk, bg: "#FCE9EA", label: "At risk" },
  Action: { color: brand.navy, bg: "#E8EEF8", label: "Action" },
  Watch: { color: status.watch, bg: "#FDF0E2", label: "Watch" },
} as const;

export const movementSeries = [
  { key: "joined", label: "Joined as PM", color: series.joined },
  { key: "inducted", label: "Inducted", color: series.inducted },
  { key: "senior", label: "Transferred to Senior", color: series.senior },
  { key: "departed", label: "Departed", color: series.departed },
] as const;

export type HealthBand = keyof typeof healthBand;
export type Severity = keyof typeof severity;
