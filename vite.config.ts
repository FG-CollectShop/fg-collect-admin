import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Base path is overridable for GH Pages project-page deploys.
// Local dev: "/". GH Pages at <user>.github.io/fg-collect-admin/: "/fg-collect-admin/".
// Custom domain: "/".
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
