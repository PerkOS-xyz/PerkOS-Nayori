const tailwindConfig = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Stacks 2024 brand — orange honoring Bitcoin, on warm black
        brand: {
          DEFAULT: "#FF8A1E",
          700: "#C95F00",
          600: "#F2780A",
          500: "#FF8A1E",
          400: "#FFA24D",
          350: "#FFB36C",
          300: "#FFC38A",
        },
        bitcoin: { DEFAULT: "#F7931A", 400: "#FFA940" },
        ink: {
          950: "#070706",
          900: "#0B0A09",
          850: "#121110",
          800: "#1A1715",
          700: "#241F19",
        },
        mist: {
          DEFAULT: "#F3F1EE",
          100: "#F3F1EE",
          200: "#D5D1CA",
          300: "#A8A39B",
          500: "#75716A",
          700: "#4A463F",
        },
      },
      fontFamily: {
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 10px 34px -16px rgba(0,0,0,0.8)",
        glow: "0 0 0 1px rgba(255,138,30,0.30), 0 18px 50px -18px rgba(255,138,30,0.5)",
      },
      maxWidth: { content: "1180px" },

      // --- Landing design system ------------------------------------------
      // Spacing on the Fibonacci sequence (8, 13, 21, 34, 55, 89, 144, 233px).
      // Consecutive steps relate by ~phi, so vertical rhythm breathes naturally.
      spacing: {
        f1: "0.5rem",
        f2: "0.8125rem",
        f3: "1.3125rem",
        f4: "2.125rem",
        f5: "3.4375rem",
        f6: "5.5625rem",
        f7: "9rem",
        f8: "14.5625rem",
      },
      // Modular type scale, Fibonacci in px: 13 / 17 / 21 / 34 / 55 / 89.
      fontSize: {
        micro: ["0.8125rem", { lineHeight: "1.5" }],
        body: ["1.0625rem", { lineHeight: "1.65" }],
        h3: ["1.3125rem", { lineHeight: "1.35", letterSpacing: "-0.018em" }],
        h2: [
          "clamp(1.75rem, 3vw, 2.125rem)",
          { lineHeight: "1.15", letterSpacing: "-0.022em" },
        ],
        display: [
          "clamp(2.25rem, 4.4vw, 3.4375rem)",
          { lineHeight: "1.06", letterSpacing: "-0.028em" },
        ],
        hero: [
          "clamp(2.5rem, 5.2vw, 4.25rem)",
          { lineHeight: "1.02", letterSpacing: "-0.034em" },
        ],
      },
      // One signature easing for the whole product.
      transitionTimingFunction: {
        signature: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default tailwindConfig;
