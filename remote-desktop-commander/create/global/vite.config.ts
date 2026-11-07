import { defineConfig } from "vite";
import honoVite from "hono-vite-config/plugin";
import Ports from "ubuntu-lib/ports/index";
import Sftp from "ubuntu-lib/sftp/index";
import Pm2 from "ubuntu-lib/pm2/index";

const port = 11422;

export default defineConfig({
  plugins: [
    honoVite({
      hono: { path: "./src/index.ts", port: [port, port + 1] },
      renderer: { paths: [] },
    }),
    new Ports(port).writeFilePlugin({
      global: {
        dataRoot: "/www/server/remote-desktop-commander",
        publicDomain: "13520521413.store",
        vncPortStart: 10003,
        displayStart: 1,
        chromiumBinary: "/snap/chromium/current/usr/lib/chromium-browser/chrome",
        extensionPath: "/opt/extends-ssh/chromium-extension",
        vncHttpdDirectory: "/opt/extends-ssh/kasmvnc-www",
      },
    }),
    new Sftp().vitePlugin(port),
    new Pm2().vitePlugin(port, { command: "node dist/remote-desktop-commander-global/index.js" }),
  ],
});