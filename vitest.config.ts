import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // convex-test runs Convex functions in an edge-like runtime
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
