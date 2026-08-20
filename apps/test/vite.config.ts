import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import honoReact from "vite-config-lib/plugin2";

export default defineConfig({
  plugins: [
    react(),
    honoReact({
      hono: {
        external: ["@openai/codex-sdk"],
        path: "./libs/aiserver/index.ts",
        port: 17321,
      },
      renderer: {
        paths: ["./libs/treeask/index.tsx"]
      },
    }),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
