import { resolve } from "node:path";
import { cp } from "node:fs/promises";
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

// viteSingleFile may skip copying public assets that aren't inlined —
// ensure the PWA shell files (manifest, service worker, icon) are present.
const pwaFiles = ["manifest.json", "sw.js", "icon.png"];
for (const file of pwaFiles) {
  await cp(resolve(rootDir, "public", file), resolve(rootDir, "dist", file), {
    force: true,
  });
}
