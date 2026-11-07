import { defineConfig } from "vite";
import { crx, defineManifest } from "@crxjs/vite-plugin";
import KasmVnc from "ubuntu-lib/kasmVnc/index";

export default defineConfig({
  publicDir: "public",
  plugins: [
    crx({
      manifest: defineManifest({
        manifest_version: 3,
        name: "Remote Desktop Commander",
        version: "0.1.0",
        description: "Connect ChatGPT tabs to local Desktop Commander over PeerJS.",
        icons: { 24: "24.png", 128: "128.png", 256: "256.png" },
        permissions: ["tabs", "clipboardWrite", "storage"],
        host_permissions: [
          "https://chatgpt.com/*",
          "https://chat.openai.com/*",
          "https://0.peerjs.com/*",
        ],
        action: {
          default_title: "Remote Desktop Commander",
          default_icon: { 24: "24.png", 128: "128.png" },
          default_popup: "src/action.default_popup/index.html",
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
    new KasmVnc(0).vitePlugin_chromiumExtension(),
  ],
});
