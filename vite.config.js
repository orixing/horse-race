import { defineConfig } from "vite";

export default defineConfig({
  base: "/horse-race/",
  server: {
    host: true,
    port: 5180,
    open: true,
  },
  build: {
    target: "esnext",
    outDir: "docs",
  },
});
