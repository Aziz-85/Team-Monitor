import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        luxury: {
          accent: "var(--accent)",
          primary: "var(--primary)",
          success: "var(--success)",
          error: "var(--error)",
          muted: "var(--muted)",
          surface: "var(--surface)",
          border: "var(--border)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        "luxury-btn": "var(--radius-button)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};
export default config;
