/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0f1e',
          card: '#111827',
          border: '#1f2937',
        },
      },
    },
  },
  plugins: [],
}
