/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sunnyYellow: '#fef08a',
        sunnyOrange: '#f59e0b',
        sunnyCard: '#ffffff',
        warmBg: '#fffbeb',
      },
      backgroundImage: {
        'sunny-gradient': 'linear-gradient(135deg, #fde68a 0%, #fcd34d 100%)',
        'soft-grid': 'linear-gradient(to right, #fbbf24 1px, transparent 1px), linear-gradient(to bottom, #fbbf24 1px, transparent 1px)',
      },
      boxShadow: {
        'soft-warm': '0 4px 20px rgba(245, 158, 11, 0.15), 0 0 40px rgba(254, 240, 138, 0.4)',
      }
    },
  },
  plugins: [],
}
