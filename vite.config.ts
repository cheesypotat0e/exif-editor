import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const proxyConfig = {
  "/api/proxy/apple": {
    target: "https://developer.apple.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/proxy\/apple/, "/news/releases/"),
    headers: {
      "User-Agent": "exif-editor/0.1",
    },
  },
  "/api/proxy/samsung": {
    target: "https://doc.samsungmobile.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/proxy\/samsung/, "/SM-S928B/029279240224/eng.html"),
    headers: {
      "User-Agent": "exif-editor/0.1",
    },
  },
  "/api/proxy/google": {
    target: "https://play.google.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/proxy\/google/, "/store/apps/details?id=com.google.android.GoogleCamera&hl=en"),
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  },
};

export default defineConfig({
  plugins: [viteSingleFile()],
  server: {
    proxy: proxyConfig,
  },
  preview: {
    proxy: proxyConfig,
  },
});

