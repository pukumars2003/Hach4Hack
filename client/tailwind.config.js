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
        canvas: '#F6F5F1',
        surface: '#FFFFFF',
        cardBorder: '#DDDACF',
        borderLight: '#EFEDE5',
        borderMuted: '#B9B6AA',
        charcoal: '#16181D',
        muted: '#4A4F57',
        subtle: '#9A9788',
        danger: '#B42318',
      },
    },
  },
  plugins: [],
};
