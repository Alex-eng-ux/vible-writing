/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f7f5',
          100: '#ededea',
          200: '#d6d6d1',
          300: '#a8a8a1',
          400: '#7c7c75',
          500: '#56564f',
          600: '#3d3d37',
          700: '#2a2a26',
          800: '#1a1a17',
          900: '#0f0f0d',
        },
        accent: {
          50: '#f3f1ec',
          100: '#e7e2d4',
          200: '#cfc4a8',
          300: '#a89578',
          400: '#806c52',
          500: '#5b4a35',
          600: '#3f3324',
          700: '#2a2118',
        },
        ok: '#2f5d3a',
        warn: '#8a6508',
        danger: '#9b2c2c',
      },
      fontFamily: {
        serif: ['"Source Serif Pro"', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
