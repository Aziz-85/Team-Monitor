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
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        muted: "var(--muted)",
        surface: "var(--surface)",
        "surface-subtle": "var(--surface-subtle)",
        "surface-elevated": "var(--surface-elevated)",
        border: "var(--border)",
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
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        card: "var(--radius-card)",
        "luxury-btn": "var(--radius-button)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};
export default config;
