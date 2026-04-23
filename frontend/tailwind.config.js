/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: "#f0f4f8",
        surface: "#f8fafc",
        card: "#ffffff",
        border: "#e2e8f0",
        accent: "#2563eb",
        "accent-hover": "#1d4ed8",
        "text-primary": "#0f172a",
        "text-secondary": "#475569",
        "text-muted": "#94a3b8",
        "review-bg": "#fffbeb",
        "review-border": "#fbbf24",
        "success": "#16a34a",
        "danger": "#dc2626",
        "warning": "#d97706",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      animation: {
        "bounce-dot": "bounce 1s infinite",
        "fade-in": "fadeIn 0.2s ease-in-out",
        "slide-in": "slideIn 0.2s ease-out",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideIn: { from: { transform: "translateY(8px)", opacity: 0 }, to: { transform: "translateY(0)", opacity: 1 } },
      },
    },
  },
  plugins: [],
};
