import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": "" },
  },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
