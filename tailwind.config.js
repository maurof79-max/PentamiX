/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accademia: {
          red: '#b30000',     // Il rosso scuro che usavi
          hover: '#d90000',
          dark: '#121212',    // Sfondo principale
          card: '#1e1e1e',    // Sfondo card
          input: '#2d2d2d',   // Sfondo input
          text: '#ffffff',
          muted: '#aaaaaa'
        }
      }
    },
  },
  plugins: [],
}