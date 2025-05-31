import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

/** @type {import('postcss').Config} */
export default {
  plugins: [
    tailwindcss({
      // 👇 This tells Tailwind to treat this CSS as the main entry point
      config: "./tailwind.config.js",
    }),
    autoprefixer(),
  ],
};
