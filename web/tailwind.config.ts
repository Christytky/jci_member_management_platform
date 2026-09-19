import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        jci: {
          blue: "#0097D7",
          black: "#130F2D",
          navy: "#1F4789",
          teal: "#57BCBC",
          yellow: "#EFC40F",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          sunken: "#F2F6F9",
          rule: "#E4EAF0",
        },
        ink: {
          DEFAULT: "#130F2D",
          muted: "#5C6480",
          faint: "#8A8AA3",
        },
        ok: "#149676",
        warn: "#EF8619",
        risk: "#B71824",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      fontSize: {
        kpi: ["2.125rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(19,15,45,0.04), 0 1px 3px rgba(19,15,45,0.06)",
        lift: "0 4px 16px rgba(19,15,45,0.08)",
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
    },
  },
  plugins: [],
} satisfies Config;
