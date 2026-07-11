/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F5F0",
        surface: "#FFFFFF",
        navy: "#102A43",
        muted: "#627D98",
        border: "#D9E2EC",
        emerald: "#149447",
        coral: "#D64545",
        sky: "#2F80ED"
      }
    }
  },
  plugins: []
};

