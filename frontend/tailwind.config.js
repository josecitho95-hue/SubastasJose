/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          navy:       '#0f172a',
          'navy-soft':'#1e293b',
          cyan:       '#06b6d4',
          'cyan-dark':'#0891b2',
          orange:     '#f97316',
          'orange-dark':'#ea580c',
        },
      },
    },
  },
  plugins: [],
}
