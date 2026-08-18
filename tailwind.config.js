/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cool light-neutral scale (ink 50 = page, ink 900 = darkest text).
        ink: {
          50: "#f5f8f9",
          100: "#eaf0f2",
          200: "#d8e2e6",
          300: "#bcc9cf",
          400: "#95a6ae",
          500: "#71848d",
          600: "#56686f",
          700: "#3e4d54",
          800: "#29343a",
          900: "#172126",
          950: "#0d1418",
        },
        // True Tiffany blue accent.
        tiffany: {
          50: "#e6f7f6",
          100: "#c6efec",
          200: "#92e2dd",
          300: "#5ee0da",
          400: "#26cec7",
          500: "#0abab5",
          600: "#089a95",
          700: "#067a76",
          800: "#04524e",
          900: "#033432",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)",
        "card-hover":
          "0 4px 16px rgba(15, 23, 42, 0.1), 0 2px 4px rgba(15, 23, 42, 0.04)",
        modal:
          "0 20px 60px rgba(15, 23, 42, 0.18), 0 8px 20px rgba(15, 23, 42, 0.1)",
        glow: "0 0 0 1px rgba(10, 186, 181, 0.35), 0 0 18px rgba(10, 186, 181, 0.25)",
        "glow-sm":
          "0 0 0 1px rgba(10, 186, 181, 0.3), 0 0 10px rgba(10, 186, 181, 0.18)",
      },
    },
  },
  plugins: [],
};
