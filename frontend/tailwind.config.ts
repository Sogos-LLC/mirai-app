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
        // Dark theme colors - sophisticated purple-tinted palette
        dark: {
          // Numbered scale for flexibility
          50: '#262340',
          100: '#232038',
          200: '#1c1a2e',
          300: '#151320',
          400: '#12101c',
          500: '#0e0c16',
          600: '#0c0a12',
          700: '#0a080e',
          800: '#08060a',
          900: '#050406',
          // Semantic surface colors
          surface: '#151320',
          'surface-elevated': '#1c1a2e',
          'surface-raised': '#232038',
          // Border colors
          border: '#2d2a45',
          'border-subtle': '#1f1d30',
          'border-input': '#3d3860',
          // Text colors for dark mode
          text: '#f8fafc',
          'text-secondary': '#cbd5e1',
          'text-muted': '#8b8da8',
        },
        // Semantic colors using CSS variables
        surface: {
          DEFAULT: 'var(--bg-surface)',
          elevated: 'var(--bg-surface-elevated)',
          raised: 'var(--bg-surface-raised)',
        },
        // Status colors optimized for dark backgrounds
        status: {
          success: '#34d399',
          'success-muted': 'rgba(52, 211, 153, 0.15)',
          error: '#f87171',
          'error-muted': 'rgba(248, 113, 113, 0.15)',
          warning: '#fbbf24',
          'warning-muted': 'rgba(251, 191, 36, 0.15)',
        },
      },
      backgroundColor: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        'surface-elevated': 'var(--bg-surface-elevated)',
        'surface-raised': 'var(--bg-surface-raised)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
        input: 'var(--bg-input)',
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
        subtle: 'var(--border-subtle)',
        input: 'var(--border-input)',
        focus: 'var(--border-focus)',
      },
      textColor: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        placeholder: 'var(--text-placeholder)',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(139, 92, 246, 0.15)',
        'glow-md': '0 0 25px rgba(139, 92, 246, 0.2)',
        'glow-lg': '0 0 40px rgba(139, 92, 246, 0.25)',
        'dark-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'dark-md': '0 4px 6px rgba(0, 0, 0, 0.4)',
        'dark-lg': '0 10px 15px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
}
export default config
