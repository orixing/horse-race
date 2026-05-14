import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

export default defineConfig({
  base: "/horse-race/",
  server: {
    port: 5180,
    open: true,
  },
  build: {
    target: "esnext",
    outDir: "docs",
  },
  plugins: [
    {
      name: "horse-pool-writer",
      configureServer(server) {
        server.middlewares.use("/api/save-horse", (req, res) => {
          if (req.method === "POST") {
            let body = "";
            req.on("data", chunk => body += chunk);
            req.on("end", () => {
              const filePath = path.resolve("src/horsePool.json");
              fs.writeFileSync(filePath, body, "utf-8");
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            });
          } else {
            res.writeHead(405);
            res.end();
          }
        });
      },
    },
  ],
});
