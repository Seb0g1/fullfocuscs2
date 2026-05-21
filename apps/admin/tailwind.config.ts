import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: "#0b0d12",
        panel: "#151820",
        line: "rgba(255,255,255,.09)",
        focus: "#ff6a00",
        cyan: "#36d1dc"
      },
      boxShadow: {
        glow: "0 0 42px rgba(255,106,0,.18)"
      }
    }
  },
  plugins: []
};

export default config;
