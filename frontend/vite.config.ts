import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@mui") || id.includes("@emotion")) return "ui";
          if (id.includes("chart.js") || id.includes("recharts")) return "charts";
          if (id.includes("react")) return "react";
          if (id.includes("axios")) return "http";
          return "vendor";
        },
      },
    },
  },
});
