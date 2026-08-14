import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.rls.test.ts"],
    testTimeout: 45_000,
    hookTimeout: 45_000,
  },
});
