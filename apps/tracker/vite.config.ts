import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { voidPlugin } from "void";
import { defineConfig } from "vite-plus";

// Lint, format and test settings live in the root vite.config.ts.
export default defineConfig({
  plugins: [voidPlugin(), react(), tailwindcss()],
});
