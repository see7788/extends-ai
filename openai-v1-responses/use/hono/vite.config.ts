import { defineConfig } from "vite";
import honoReact2 from "hono-vite-config/plugin";

const devPort = 11410;

export default defineConfig({
  server: {
    hmr: false,
  },
  plugins: [
    honoReact2({
      hono: {
        external: ["peerjs", "@roamhq/wrtc"],
        path: "./src/index.ts",
        port: [devPort, devPort + 1],
      },
      renderer: {
        paths: ["../react/index.tsx"],
      },
    }),
  ],
});

