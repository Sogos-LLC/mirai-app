import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Dark theme colors - purple-tinted dark palette
        dark: {
          50: '#2d2a3e',
          100: '#252236',
          200: '#1f1c2e',
          300: '#1a1726',
          400: '#16131f',
          500: '#13101a',
          600: '#100d16',
          700: '#0d0b12',
          800: '#0a080e',
          900: '#07060a',
          // Surface colors for cards, inputs, etc
          surface: '#1e1b2e',
          'surface-elevated': '#252236',
          border: '#3d3a50',
          'border-subtle': '#2d2a3e',
        },
      },
    },
  },
  plugins: [],
}
export default config
