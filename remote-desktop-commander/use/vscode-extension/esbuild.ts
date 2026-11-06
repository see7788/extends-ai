import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, type BuildOptions } from "esbuild";

const publish = process.argv[2] === "publish";
const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { name: string; version: string };

const configurations: BuildOptions[] = [
  {
    entryPoints: ["src/extension.ts"],
    outfile: "dist/out/extension.js",
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["vscode"],
    plugins: [{
      name: "copy-vscode-extension-icons",
      setup(currentBuild) {
        currentBuild.onEnd(async result => {
          if (result.errors.length > 0) return;
          const resourcesDirectory = resolve("dist/resources");
          await mkdir(resourcesDirectory, { recursive: true });
          await Promise.all([
            copyFile(resolve("src/resources/256.png"), resolve(resourcesDirectory, "icon.png")),
            copyFile(resolve("src/resources/24.png"), resolve(resourcesDirectory, "activitybar.png")),
          ]);
        });
      },
    }],
    sourcemap: true,
    target: "es2022",
    logLevel: "info",
  },
  {
    entryPoints: ["src/webview-view/web/index.tsx"],
    outfile: "dist/media/WebviewView.js",
    bundle: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    sourcemap: true,
    target: "es2022",
    logLevel: "info",
  },
  {
    entryPoints: ["src/webview-panel/web/index.tsx"],
    outfile: "dist/media/WebviewPanel.js",
    bundle: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    sourcemap: true,
    target: "es2022",
    logLevel: "info",
  },
];

await Promise.all(configurations.map(configuration => build(configuration)));
await cp(resolve("../../create/chrome-extension/dist"), resolve("dist/chrome-extension"), { recursive: true, force: true });

if (publish) {
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "exec", "vsce", "publish", "--no-dependencies", "--allow-missing-repository", "--skip-license",
  ], {
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: false,
  });
} else {
  const artifactDirectory = resolve("dist/release");
  await mkdir(artifactDirectory, { recursive: true });
  const vsixPath = resolve(artifactDirectory, `${packageJson.name}-${packageJson.version}.vsix`);
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "exec", "vsce", "package", "--no-dependencies", "--allow-missing-repository", "--skip-license", "--out", vsixPath,
  ], {
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: false,
  });
  execFileSync(process.platform === "win32" ? "code.cmd" : "code", [
    "--install-extension", vsixPath, "--force",
  ], {
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: false,
  });
  console.log(`宸插畨瑁呭埌鏈満 VS Code锛?{packageJson.name}@${packageJson.version}`);
}

