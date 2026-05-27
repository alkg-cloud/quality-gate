import { defineConfig } from "tsup";
import { cpSync } from "node:fs";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "node20",
  dts: true,
  clean: true,
  splitting: false,
  shims: false,
  loader: { ".json": "copy" },
  async onSuccess() {
    // Copy schema JSON files into dist/schemas/ so the built CLI can find them
    cpSync("src/schemas", "dist/schemas", { recursive: true });
  },
});
