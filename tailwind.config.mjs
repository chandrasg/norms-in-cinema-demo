/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        // MAPGEN brand — pulled from the icon (gold/yellow figure on dark navy)
        ink: {
          950: "#0e1530",   // deepest navy — page background
          900: "#13183a",   // main navy — surfaces
          800: "#1e2552",   // raised surface
          700: "#2a3170",
          600: "#3a4392",
        },
        gold: {
          400: "#f5c84b",   // primary accent — MAPGEN icon yellow
          500: "#e6b339",
          600: "#c2932b",
          300: "#fbe07a",
        },
        // Cultural diptych — used to encode Bollywood vs Hollywood without
        // turning into a literal red/blue political flag clash
        bolly: {
          DEFAULT: "#e85d4d",  // warm coral (a non-jingo "India" hue)
          dark: "#a8392c",
        },
        holly: {
          DEFAULT: "#5b8def",  // cool blue
          dark: "#3a5fb2",
        },
      },
      fontFamily: {
        // Editorial serif for headlines, restrained sans for body
        display: ['"Source Serif 4"', '"Source Serif Pro"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Kiosk-readable scale — lower bound 16px, upper bound massive
        'kiosk-xl': ['clamp(2.5rem, 4vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'kiosk-lg': ['clamp(2rem, 3vw, 3.5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'kiosk-md': ['clamp(1.4rem, 2vw, 2rem)', { lineHeight: '1.25' }],
      },
      boxShadow: {
        'gold-glow': '0 0 0 1px rgba(245, 200, 75, 0.2), 0 8px 30px -10px rgba(245, 200, 75, 0.4)',
      },
    },
  },
  plugins: [],
};
