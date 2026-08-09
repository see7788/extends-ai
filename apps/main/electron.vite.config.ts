import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, type UserConfig } from "electron-vite";
import { normalizePath, type Plugin } from "vite";
import rendererReact from "electron-vite-config-lib/rendererReactPlugin/plugin";

const reactDevelopment = react().map(plugin => ({
  ...plugin,
  apply: "serve" as const,
}));
const rendererProjects = [
  "../../libs/login/renderer",
  "../../libs/codex-app-server/renderer",
] as const;
const rendererEntryCanonical: Plugin = {
  apply: "serve",
  name: "renderer-entry-canonical",
  transformIndexHtml(html) {
    const project = html.includes("<title>ChatGPT 登录态</title>")
      ? rendererProjects[0]
      : html.includes("<title>Codex 账号维护</title>")
        ? rendererProjects[1]
        : undefined;
    if (!project) return;
    const entry = normalizePath(resolve(project, "index.tsx"));
    return html.replace("./index.tsx", `/@fs/${entry}`);
  },
};

const config = {
  main: {
    build: {
      externalizeDeps: false,
      rolldownOptions: {
        input: "index.ts",
      },
    },
  },
  preload: {
    build: {
      assetsInlineLimit: Number.POSITIVE_INFINITY,
      cssCodeSplit: false,
      externalizeDeps: false,
      isolatedEntries: true,
      rolldownOptions: {
        input: {
          "browser-partition-preload": "../../libs/browser-partition/preload/index.ts",
        },
        output: {
          codeSplitting: false,
          entryFileNames: "[name].cjs",
          format: "cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [
      ...reactDevelopment,
      rendererEntryCanonical,
      rendererReact(
        { otherPort: 5174 },
        ...rendererProjects.map(path => [path] as [string]),
      ),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
    },
  },
} satisfies UserConfig;

export default defineConfig(config);
