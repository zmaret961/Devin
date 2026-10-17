/** @type {import('tailwindcss').Config} */
export default {
  content: [new URL('./web/index.html', import.meta.url).pathname, new URL('./web/src', import.meta.url).pathname + '/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(-4px)' }, to: { opacity: '1', transform: 'none' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(139,92,246,.55)' }, '100%': { boxShadow: '0 0 0 10px rgba(139,92,246,0)' } },
      },
      animation: { 'fade-in': 'fade-in .35s ease-out', 'pulse-ring': 'pulseRing 1.6s ease-out infinite' },
    },
  },
  plugins: [],
};
