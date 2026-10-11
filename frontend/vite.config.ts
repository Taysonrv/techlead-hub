import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3333",
      "/health": "http://127.0.0.1:3333",
    },
  },
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

          /*
           * Não separamos React/MUI/Axios em chunks manuais.
           * O Rollup pode criar dependências circulares entre chunks vendor
           * quando bibliotecas compartilham runtime/helpers. Em produção isso
           * pode resultar em "x is not a function" antes do React montar.
           *
           * Mantemos somente gráficos isolados, que são pesados e independentes,
           * e deixamos o Rollup decidir o grafo seguro para o restante.
           */
          if (id.includes("chart.js") || id.includes("recharts")) return "charts";
          return undefined;
        },
      },
    },
  },
});
