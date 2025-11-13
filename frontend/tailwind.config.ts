import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f6fb',
          100: '#e0ecf9',
          200: '#bcd6f3',
          300: '#8ab6eb',
          400: '#5d90db',
          500: '#285d9f',
          600: '#214e85',
          700: '#1b4070',
          800: '#17355c',
          900: '#132c4b',
        },
      },
    },
  },
  plugins: [],
};

export default config;
