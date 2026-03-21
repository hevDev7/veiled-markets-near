/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — Veiled Violet (custom, deeper & more mysterious than generic indigo)
        brand: {
          50: '#f3f0ff',
          100: '#e9e3ff',
          200: '#d4c9ff',
          300: '#b5a1ff',
          400: '#9171f8',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#3b0d7e',
          950: '#1a0536',
        },
        // Accent — Electric Teal (distinct from brand)
        accent: {
          50: '#edfffe',
          100: '#d0fffe',
          200: '#a7fdfa',
          300: '#6bf6f0',
          400: '#2de4db',
          500: '#14c8bf',
          600: '#0d9e9a',
          700: '#107e7b',
          800: '#136463',
          900: '#145352',
        },
        // Gold — Premium accent for featured/important elements
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Yes outcome — Luminous Emerald
        yes: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // No outcome — Vibrant Coral
        no: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
        },
        // Dark theme surfaces — Deep Blue-Black with slight purple tint
        surface: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#b8b2cf',
          400: '#8b83a8',
          500: '#64597e',
          600: '#453d5c',
          700: '#302847',
          800: '#1c1632',
          900: '#0e0a1f',
          950: '#06030f',
        },
      },
      fontFamily: {
        sans: ['General Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Clash Display', 'General Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display-lg': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-sm': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
        'heading-lg': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'heading-md': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
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
          radial-gradient(at 40% 20%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
          radial-gradient(at 80% 0%, rgba(6, 182, 212, 0.1) 0px, transparent 50%),
          radial-gradient(at 0% 50%, rgba(99, 102, 241, 0.08) 0px, transparent 50%),
          radial-gradient(at 80% 80%, rgba(16, 185, 129, 0.06) 0px, transparent 50%)
        `,
        'gradient-spotlight': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.2), transparent)',
        'gradient-card': 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(6, 182, 212, 0.03) 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-in-up': 'fade-in-up 0.5s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
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
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'border-pulse': {
          '0%, 100%': { borderColor: 'rgba(99, 102, 241, 0.2)' },
          '50%': { borderColor: 'rgba(99, 102, 241, 0.5)' },
        },
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(124, 58, 237, 0.25), 0 0 60px rgba(124, 58, 237, 0.1)',
        'glow-accent': '0 0 20px rgba(20, 200, 191, 0.25), 0 0 60px rgba(20, 200, 191, 0.1)',
        'glow-yes': '0 0 20px rgba(16, 185, 129, 0.25), 0 0 60px rgba(16, 185, 129, 0.1)',
        'glow-no': '0 0 20px rgba(244, 63, 94, 0.25), 0 0 60px rgba(244, 63, 94, 0.1)',
        'glow-gold': '0 0 20px rgba(245, 158, 11, 0.25), 0 0 60px rgba(245, 158, 11, 0.1)',
        'inner-glow': 'inset 0 0 20px rgba(124, 58, 237, 0.08)',
        'elevated': '0 2px 4px -1px rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.2)',
        'elevated-md': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'elevated-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
        'card': '0 0 0 1px rgba(48, 40, 71, 0.5), 0 4px 20px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 0 0 1px rgba(124, 58, 237, 0.3), 0 8px 30px rgba(0, 0, 0, 0.4), 0 0 40px rgba(124, 58, 237, 0.06)',
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
