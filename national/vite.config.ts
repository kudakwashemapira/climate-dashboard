import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

// Used by "npm run dev" (hot reload) and by the production build. In Docker the built app is served
// by nginx, which forwards /api to the backend, so this proxy only matters for the dev server.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  // "@/..." is src/...: the import style of the shadcn/ui components (components/shadcn, components.json).
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5174, strictPort: true, proxy: { "/api": apiTarget } },
  build: {
    rollupOptions: {
      output: {
        // Keep the chart library, the framework and the UI libraries in their own files so they cache separately.
        manualChunks: {
          charts: ["recharts"],
          framework: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          // The libraries under the shadcn/ui components.
          ui: [
            "@radix-ui/react-alert-dialog", "@radix-ui/react-checkbox", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-label", "@radix-ui/react-select", "@radix-ui/react-separator", "@radix-ui/react-slot", "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip", "class-variance-authority", "clsx", "cmdk", "sonner", "tailwind-merge",
          ],
        },
      },
    },
  },
});
