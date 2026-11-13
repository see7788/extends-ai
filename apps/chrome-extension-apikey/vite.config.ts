﻿import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import Peerjs from "ubuntu-lib/peerjs/index";
import Ports from "ubuntu-lib/ports/index";

const devPort = 11412;

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    react(),
    new Peerjs().vitePlugin(devPort),
    new Ports(devPort).writeFilePlugin({}),
  ],
  server: { host: "127.0.0.1", port: devPort, strictPort: true },
});
