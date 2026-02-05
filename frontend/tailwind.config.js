/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1DA1F2',
        dark: '#15202B',
        darker: '#0F1419',
        light: '#F7F9FA',
      }
    },
  },
  plugins: [],
}
