/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tiffany: {
          50:  "#f4faf9",
          100: "#ddf3ef",
          200: "#b8e7df",
          300: "#81d8d0",
          400: "#5eccc3",
          500: "#3abdb3",
          600: "#2d948b",
          700: "#1f7068",
          800: "#15524c",
          900: "#0d3632",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(13, 54, 50, 0.06), 0 1px 2px rgba(13, 54, 50, 0.04)",
        "card-hover":
          "0 4px 12px rgba(13, 54, 50, 0.08), 0 2px 4px rgba(13, 54, 50, 0.04)",
        modal:
          "0 20px 60px rgba(13, 54, 50, 0.15), 0 8px 20px rgba(13, 54, 50, 0.1)",
      },
    },
  },
  plugins: [],
};
