import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

const analyze = process.env.ANALYZE === "1";

export default defineConfig(async () => {
  // Bundle analyzer — opt-in via `ANALYZE=1 npm run build`. Drops a
  // treemap at dist/stats.html. Loaded via dynamic import because
  // rollup-plugin-visualizer 7.x is ESM-only and Vite's config
  // loader can't `require` it under rolldown.
  const analyzer: PluginOption[] = [];
  if (analyze) {
    const { visualizer } = await import("rollup-plugin-visualizer");
    analyzer.push(visualizer({
      filename: "dist/stats.html",
      template: "treemap",
      gzipSize: true,
      brotliSize: true,
    }) as PluginOption);
  }

  return {
    plugins: [
      TanStackRouterVite({ routesDirectory: "./src/routes", generatedRouteTree: "./src/routeTree.gen.ts" }),
      react(),
      ...analyzer,
    ],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          proxyTimeout: 10 * 60 * 1000,
          timeout: 10 * 60 * 1000,
        },
      },
    },
  };
});
