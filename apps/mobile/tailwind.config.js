/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './index.js', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        border: 'var(--border)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        destructive: 'var(--destructive)',
        success: 'var(--success)',
        input: 'var(--input)',
        cell: {
          DEFAULT: '#1c3a5c',
          border: '#2f6aa8',
        },
        estop: {
          DEFAULT: '#e10600',
          border: '#e10600',
        },
      },
    },
  },
  plugins: [],
};
