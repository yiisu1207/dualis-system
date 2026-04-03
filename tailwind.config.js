/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'dualis-bg': '#f4f6fb',
        'dualis-surface': '#ffffff',
        'dualis-surface-2': '#eef1f8',
        'dualis-surface-3': '#e2e7f3',
        'dualis-accent': '#4f6ef7',
        'dualis-accent-2': '#7c3aed',
        'dualis-accent-3': '#06b6d4',
        'dualis-gold': '#d97706',
        'dualis-green': '#059669',
        'dualis-red': '#dc2626',
        'dualis-text': '#111827',
        'dualis-text-2': '#4b5563',
        'dualis-text-3': '#9ca3af',
        primary: '#4f6ef7',
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        instrument: ['Instrument Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-top': {
          '0%': { transform: 'translateY(-30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-bottom': {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'slide-in-left': 'slide-in-left 0.25s ease-out',
        'slide-in-top': 'slide-in-top 0.25s ease-out',
        'slide-in-bottom': 'slide-in-bottom 0.25s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}