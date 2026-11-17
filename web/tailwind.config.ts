import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#05070f',
          900: '#0a0d1a',
          800: '#10142450',
        },
        line: 'rgba(255,255,255,0.08)',
        accent: {
          cyan: '#38bdf8',
          violet: '#a78bfa',
          pink: '#f472b6',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(90deg, #38bdf8 0%, #a78bfa 60%, #f472b6 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
