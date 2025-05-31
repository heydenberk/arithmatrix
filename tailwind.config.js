// /** @type {import('tailwindcss').Config} */
// export default {
//   content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
//   safelist: [
//     "bg-pink-100",
//     "selected-cell",
//     "error-cell",
//     "cell-flash-invalid",
//     "animate-fade-in-up",
//     "animate-slide-in-down",
//     // Cage color classes
//     "cage-color-0",
//     "cage-color-1",
//     "cage-color-2",
//     "cage-color-3",
//     "cage-color-4",
//     "cage-color-5",
//     "cage-color-6",
//     "cage-color-7",
//     "cage-color-8",
//     "cage-color-9",
//     "cage-color-10",
//     "cage-color-11",
//   ],
//   theme: {
//     extend: {
//       fontFamily: {
//         sans: [
//           "Inter",
//           "system-ui",
//           "-apple-system",
//           "BlinkMacSystemFont",
//           "Segoe UI",
//           "Roboto",
//           "sans-serif",
//         ],
//         mono: [
//           "JetBrains Mono",
//           "Fira Code",
//           "Monaco",
//           "Consolas",
//           "monospace",
//         ],
//       },
//       borderWidth: {
//         3: "3px",
//         5: "5px",
//       },
//       colors: {
//         primary: {
//           50: "#f0f9ff",
//           100: "#e0f2fe",
//           500: "#3b82f6",
//           600: "#2563eb",
//           700: "#1d4ed8",
//         },
//         purple: {
//           50: "#faf5ff",
//           100: "#f3e8ff",
//           500: "#8b5cf6",
//           600: "#7c3aed",
//           700: "#6d28d9",
//         },
//         emerald: {
//           400: "#34d399",
//           500: "#10b981",
//           600: "#059669",
//           700: "#047857",
//         },
//       },
//       animation: {
//         "fade-in-up": "fadeInUp 0.6s ease-out",
//         "slide-in-down": "slideInDown 0.4s ease-out",
//         "selected-pulse": "selectedPulse 2s infinite ease-in-out",
//         "invalid-flash": "invalidFlash 0.6s ease-out",
//         shine: "shine 2s infinite",
//       },
//       keyframes: {
//         fadeInUp: {
//           "0%": {
//             opacity: "0",
//             transform: "translateY(30px)",
//           },
//           "100%": {
//             opacity: "1",
//             transform: "translateY(0)",
//           },
//         },
//         slideInDown: {
//           "0%": {
//             opacity: "0",
//             transform: "translateY(-20px)",
//           },
//           "100%": {
//             opacity: "1",
//             transform: "translateY(0)",
//           },
//         },
//         selectedPulse: {
//           "0%, 100%": {
//             boxShadow:
//               "inset 0 2px 4px rgba(255, 255, 255, 0.8), inset 0 -2px 4px rgba(139, 92, 246, 0.1), 0 0 0 0 rgba(139, 92, 246, 0.4), 0 8px 16px rgba(139, 92, 246, 0.2)",
//           },
//           "50%": {
//             boxShadow:
//               "inset 0 2px 4px rgba(255, 255, 255, 0.8), inset 0 -2px 4px rgba(139, 92, 246, 0.1), 0 0 0 8px rgba(139, 92, 246, 0.1), 0 12px 20px rgba(139, 92, 246, 0.3)",
//           },
//         },
//         invalidFlash: {
//           "0%, 100%": {
//             transform: "scale(1)",
//             boxShadow:
//               "inset 0 2px 4px rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.1)",
//           },
//           "50%": {
//             transform: "scale(1.05)",
//             boxShadow:
//               "inset 0 2px 4px rgba(255, 255, 255, 0.6), inset 0 -2px 4px rgba(239, 68, 68, 0.2), 0 0 0 4px rgba(239, 68, 68, 0.4), 0 8px 16px rgba(239, 68, 68, 0.3)",
//           },
//         },
//         shine: {
//           "0%": { transform: "translateX(-100%)" },
//           "100%": { transform: "translateX(100%)" },
//         },
//       },
//       backdropBlur: {
//         xs: "2px",
//       },
//       boxShadow: {
//         "inner-light": "inset 0 2px 4px rgba(255, 255, 255, 0.6)",
//         glow: "0 0 20px rgba(139, 92, 246, 0.3)",
//         "glow-lg": "0 0 40px rgba(139, 92, 246, 0.4)",
//       },
//       borderRadius: {
//         "4xl": "2rem",
//       },
//     },
//   },
//   plugins: [],
// };

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  safelist: ["bg-green-500", "text-white", "p-4", "rounded", "text-xl"],
  theme: {
    extend: {},
  },
  plugins: [],
};
