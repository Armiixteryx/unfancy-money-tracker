/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter_400Regular"], display: ["Fraunces_400Regular"] },
      colors: {
        canvas: "#EFECEA",
        surface: "#FFFFFF",
        navy: "#102A43",
        muted: "#59666C",
        border: "#DCD9D6",
        emerald: "#0F7A3A",
        coral: "#C93636",
        sky: "#0F7A3A"
      }
    }
  },
  plugins: []
};

