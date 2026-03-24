import { defineConfig } from "vitest/config";
import path from "path";

const alias = { "@": path.resolve(__dirname, ".") };

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    projects: [
      {
        resolve: { alias },
        test: {
          name: "pipeline",
          include: ["tests/pipeline/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "accuracy",
          include: ["tests/accuracy/**/*.test.ts"],
          testTimeout: 120_000,
        },
      },
    ],
  },
  resolve: { alias },
});
