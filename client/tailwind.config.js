/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Hack4Hack-inspired palette
        lime: {
          DEFAULT: '#CDFF00',
          dark: '#B8E600',
          light: '#E8FF80',
          muted: '#F0FFB3',
        },
        pine: {
          DEFAULT: '#12302D',
          dark: '#0A1C1A',
          light: '#1B4743',
        },
        teal: {
          DEFAULT: '#0F766E',
          dark: '#0B5F58',
          hover: '#08443F',
          light: '#E3F1EE',
        },
        mint: {
          DEFAULT: '#5EEAD4',
          hover: '#2DD4BF',
        },
        canvas: '#FAFAFA',
        surface: '#FFFFFF',
        cardBorder: '#E5E5E5',
        borderLight: '#F0F0F0',
        borderMuted: '#D4D4D4',
        charcoal: '#171717',
        muted: '#525252',
        subtle: '#A3A3A3',
        danger: '#DC2626',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
