/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: "#171717",
        surface: "#212121",
        card: "#2f2f2f",
        border: "#3f3f3f",
        accent: "#4f8ef7",
        "accent-hover": "#3b7de8",
        "text-primary": "#ececec",
        "text-secondary": "#8e8ea0",
        "text-muted": "#5c5c6e",
        "review-bg": "#2a2008",
        "review-border": "#78510a",
        "success": "#22c55e",
        "danger": "#ef4444",
        "warning": "#f59e0b",
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
