/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Blender-inspired dark charcoal neutrals.
        ink: {
          50: "#f3f5f6",
          100: "#e7ebee",
          200: "#c9d0d6",
          300: "#9aa3ac",
          400: "#6c757e",
          500: "#464d53",
          600: "#363c41",
          700: "#2a2f33",
          800: "#202428",
          900: "#17191b",
          950: "#101213",
        },
        // True Tiffany blue accent.
        tiffany: {
          50: "#0d2b2a",
          100: "#103634",
          200: "#134844",
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
        card: "0 1px 2px rgba(0, 0, 0, 0.4)",
        "card-hover": "0 4px 16px rgba(0, 0, 0, 0.5)",
        modal: "0 24px 60px rgba(0, 0, 0, 0.6)",
        glow: "0 0 0 1px rgba(10, 186, 181, 0.4), 0 0 18px rgba(10, 186, 181, 0.22)",
        "glow-sm":
          "0 0 0 1px rgba(10, 186, 181, 0.35), 0 0 10px rgba(10, 186, 181, 0.18)",
      },
    },
  },
  plugins: [],
};
