import react from "@vitejs/plugin-react";
import { defineConfig, type UserConfig } from "electron-vite";
import preloadConfig from "electron-vite-config-lib/preloadCreate/vite/index";
import rendererPlugin from "electron-vite-config-lib/rendererReactPlugin/plugin";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rolldownOptions: {
        input: "index.ts",
      },
    },
  },
  preload: preloadConfig({
    paths: ["../../libs/browser-partition/preload/index.ts"],
  }),
  renderer: {
    plugins: [
      react(),
      rendererPlugin({
        ports: [5173, 5174],
        paths: ["../../libs/codex-app-server/renderer/index.tsx"],
      }),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
  },
});
