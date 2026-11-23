import { defineConfig } from "void/config";

export default defineConfig({
  inference: { appType: "void" },
  worker: { compatibility_date: "2026-11-01" },
  cloudflare: { name: "blue-orchid" },
});
