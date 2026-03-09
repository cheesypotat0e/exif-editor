import { resolve } from "node:path";
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const rootDir = process.cwd();
const entries = ["index.html"];

for (const [index, input] of entries.entries()) {
  await build({
    configFile: false,
    root: rootDir,
    plugins: [viteSingleFile()],
    build: {
      outDir: "dist",
      emptyOutDir: index === 0,
      rollupOptions: {
        input: resolve(rootDir, input),
      },
    },
  });
}
