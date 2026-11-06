import { defineConfig } from "vite";
import { crx, defineManifest } from "@crxjs/vite-plugin";

export default defineConfig({
  publicDir: "public",
  plugins: [
    crx({
      manifest: defineManifest({
        manifest_version: 3,
        name: "Remote Desktop Commander",
        version: "0.1.0",
        description: "Connect ChatGPT running in KasmVNC to the local Desktop Commander MCP service.",
        icons: { 24: "24.png", 128: "128.png", 256: "256.png" },
        permissions: ["storage"],
        host_permissions: ["http://*/*"],
        action: {
          default_title: "Remote Desktop Commander",
          default_icon: { 24: "24.png", 128: "128.png" },
          default_popup: "src/action.default_popup/index.html",
        },
        background: {
          service_worker: "src/background.service_worker/index.ts",
          type: "module",
        },
        content_scripts: [
          {
            matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
            js: ["src/content_scripts/index.tsx"],
            run_at: "document_idle",
          },
        ],
      }),
    }),
  ],
});
