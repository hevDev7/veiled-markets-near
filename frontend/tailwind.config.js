/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — refined gold/amber for premium feel
        // (replaces the old "Veiled Violet")
        brand: {
          50: '#fdf9ed',
          100: '#f8edd0',
          200: '#f0d89d',
          300: '#e7bf63',
          400: '#c9a84c',
          500: '#b8922e',
          600: '#9a7424',
          700: '#7a5720',
          800: '#674921',
          900: '#583e21',
          950: '#322110',
        },
        // Accent — refined warm gold (cohesive with brand)
        accent: {
          50: '#fdf9ed',
          100: '#f8edd0',
          200: '#f0d89d',
          300: '#e7bf63',
          400: '#c9a84c',
          500: '#b8922e',
          600: '#9a7424',
          700: '#7a5720',
          800: '#674921',
          900: '#583e21',
        },
        // Gold — same as brand for consistency
        gold: {
          50: '#fdf9ed',
          100: '#f8edd0',
          200: '#f0d89d',
          300: '#e7bf63',
          400: '#c9a84c',
          500: '#b8922e',
          600: '#9a7424',
          700: '#7a5720',
          800: '#674921',
          900: '#583e21',
        },
        // Yes outcome — Luminous Emerald (keeping the green, refined)
        yes: {
          50: '#edfdf6',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#00dc82',
          500: '#00c472',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // No outcome — Refined Coral Red
        no: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#ff4757',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        // Dark theme surfaces — Deep Blue-Black, luxurious
        surface: {
          50: '#e8e6e3',
          100: '#d1cdc7',
          200: '#9ca3af',
          300: '#5c6370',
          400: '#3b4252',
          500: '#323a4e',
          600: '#252b3a',
          700: '#1c2130',
          800: '#161a24',
          850: '#11141b',
          900: '#0f1118',
          950: '#0b0d12',
        },
        // Semantic colors
        bullish: {
          DEFAULT: '#00dc82',
        },
        bearish: {
          DEFAULT: '#ff4757',
        },
        volatile: {
          DEFAULT: '#ffa502',
        },
      },
      fontFamily: {
        sans: ['Instrument Sans', 'SF Pro Display', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['DM Serif Display', 'Georgia', 'serif'],
        heading: ['Instrument Sans', 'SF Pro Display', 'system-ui', 'sans-serif'],
        body: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      fontSize: {
        'display-lg': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '400' }],
        'display-md': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '400' }],
        'display-sm': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '400' }],
        'heading-lg': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600' }],
        'heading-md': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        'caption': ['0.75rem', { lineHeight: '1.5' }],
        'overline': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'gradient-mesh': `
          radial-gradient(ellipse at 20% 0%, rgba(201, 168, 76, 0.06) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 100%, rgba(0, 220, 130, 0.04) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 50%, rgba(13, 15, 20, 1) 0%, rgba(8, 9, 12, 1) 100%)
        `,
        'gradient-spotlight': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(201, 168, 76, 0.12), transparent)',
        'gradient-card': 'linear-gradient(135deg, rgba(201, 168, 76, 0.04) 0%, rgba(0, 220, 130, 0.02) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
        'fade-in': 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'spin-slow': 'spin 3s linear infinite',
        'border-pulse': 'border-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'border-pulse': {
          '0%, 100%': { borderColor: 'rgba(201, 168, 76, 0.15)' },
          '50%': { borderColor: 'rgba(201, 168, 76, 0.4)' },
        },
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(201, 168, 76, 0.2), 0 0 60px rgba(201, 168, 76, 0.08)',
        'glow-accent': '0 0 20px rgba(201, 168, 76, 0.2), 0 0 60px rgba(201, 168, 76, 0.08)',
        'glow-yes': '0 0 20px rgba(0, 220, 130, 0.2), 0 0 60px rgba(0, 220, 130, 0.08)',
        'glow-no': '0 0 20px rgba(255, 71, 87, 0.2), 0 0 60px rgba(255, 71, 87, 0.08)',
        'glow-gold': '0 0 20px rgba(201, 168, 76, 0.25), 0 0 60px rgba(201, 168, 76, 0.1)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.03)',
        'elevated': '0 2px 4px -1px rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
        'elevated-md': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'elevated-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
        'card': '0 0 0 1px rgba(255, 255, 255, 0.04), 0 4px 20px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 0 0 1px rgba(201, 168, 76, 0.15), 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 40px rgba(201, 168, 76, 0.04)',
        'panel': '0 1px 3px 0 rgba(0,0,0,0.3), 0 1px 2px -1px rgba(0,0,0,0.3)',
        'panel-lg': '0 4px 20px -4px rgba(0,0,0,0.4), 0 2px 4px -2px rgba(0,0,0,0.3)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      backdropBlur: {
        'xs': '2px',
      },
      transitionDuration: {
        '400': '400ms',
      },
    },
  },
  plugins: [],
}
