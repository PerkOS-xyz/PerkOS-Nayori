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
          300: "#A8A39B",
          500: "#75716A",
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
    },
  },
  plugins: [],
};

export default tailwindConfig;
