/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17362f',
        forest: '#245b4e',
        mint: '#dff3e9',
        cream: '#f7f3e9',
        coral: '#f2735b',
        sun: '#f3c96b',
        paper: '#fffdf8',
      },
      fontFamily: {
        sans: ['Be Vietnam Pro', 'sans-serif'],
        editorial: ['Be Vietnam Pro', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 16px 50px rgba(23, 54, 47, 0.10)',
        card: '0 8px 30px rgba(23, 54, 47, 0.08)',
      },
      opacity: {
        15: '0.15',
        35: '0.35',
        38: '0.38',
        42: '0.42',
        45: '0.45',
        48: '0.48',
        52: '0.52',
        55: '0.55',
        58: '0.58',
        65: '0.65',
        85: '0.85',
      },
      animation: {
        'fade-in': 'fadeIn 420ms cubic-bezier(.22,.8,.24,1) both',
        'fade-only': 'fadeOnly 360ms ease-out both',
        'rise-in': 'riseIn 500ms cubic-bezier(.2,.8,.2,1) both',
        'soft-pulse': 'softPulse 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(5px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOnly: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        softPulse: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
      },
    },
  },
  plugins: [],
};
