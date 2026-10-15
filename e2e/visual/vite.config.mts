import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const root = process.cwd();
export default defineConfig({
  root,
  envDir: false,
  publicDir: "public",
  plugins: [
    {
      name: "synthetic-visual-client",
      enforce: "pre",
      resolveId(source, importer) {
        if (!importer || !source.startsWith(".")) return;
        const resolved = path
          .resolve(path.dirname(importer.split("?")[0]), source)
          .replace(/\.[jt]s$/, "");
        if (resolved === path.resolve(root, "services/supabaseClient"))
          return path.resolve(root, "e2e/visual/fixture/client.ts");
      },
    },
    react(),
  ],
  resolve: {
    alias: { "react-router-dom": path.resolve(root, "src/lib/router.tsx") },
  },
  server: { host: "127.0.0.1", port: 4175, strictPort: true, hmr: false },
  build: {
    outDir: ".visual-dist",
    rollupOptions: {
      input: path.resolve(root, "e2e/visual/fixture/index.html"),
    },
  },
});
