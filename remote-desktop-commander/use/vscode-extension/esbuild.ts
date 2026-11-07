import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, type BuildOptions } from "esbuild";

const publish = process.argv[2] === "publish";
const packageOnly = process.argv[2] === "package-only";
const buildOnly = process.argv[2] === "build-only";
const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { name: string; version: string };

const configurations: BuildOptions[] = [
  {
    entryPoints: ["src/extension.ts"],
    outfile: "dist/out/extension.js",
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["vscode", "peerjs", "@webrtc-node/webrtc", "@wonderwhy-er/desktop-commander"],
    alias: {
      "remote-desktop-commander-peerjs": resolve("../commander-peerjs/index.ts"),
    },
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
    sourcemap: false,
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
    sourcemap: false,
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
    sourcemap: false,
    target: "es2022",
    logLevel: "info",
  },
];

await Promise.all(configurations.map(configuration => build(configuration)));
await cp(resolve("../../create/chrome-extension/dist"), resolve("dist/chrome-extension"), {
  recursive: true,
  force: true,
});

if (!buildOnly) {
  const stage = resolve(".log/package-stage");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(resolve("dist"), resolve(stage, "dist"), { recursive: true });
  await copyFile("package.json", resolve(stage, "package.json"));
  await copyFile(resolve("../../README.md"), resolve(stage, "README.md"));

  const ignore = (await readFile(".vscodeignore", "utf8"))
    .split(/\r?\n/)
    .filter(line => line.trim() !== "node_modules/**")
    .concat("**/package-lock.json")
    .join("\n");
  await writeFile(resolve(stage, ".vscodeignore"), ignore, "utf8");

  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", [
    "install", "--omit=dev", "--no-audit", "--no-fund", "--package-lock=false",
  ], {
    cwd: stage,
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: false,
  });

  const vsce = resolve(process.platform === "win32" ? "node_modules/.bin/vsce.cmd" : "node_modules/.bin/vsce");
  if (publish) {
    execFileSync(vsce, ["publish", "--allow-missing-repository", "--skip-license", "--dependencies"], {
      cwd: stage,
      shell: process.platform === "win32",
      stdio: "inherit",
      windowsHide: false,
    });
  } else {
    const artifactDirectory = resolve("dist/release");
    await mkdir(artifactDirectory, { recursive: true });
    const vsixPath = resolve(artifactDirectory, `${packageJson.name}-${packageJson.version}.vsix`);
    execFileSync(vsce, [
      "package", "--dependencies", "--allow-missing-repository", "--skip-license", "--out", vsixPath,
    ], {
      cwd: stage,
      shell: process.platform === "win32",
      stdio: "inherit",
      windowsHide: false,
    });
    if (!packageOnly) {
      execFileSync(process.platform === "win32" ? "code.cmd" : "code", [
        "--install-extension", vsixPath, "--force",
      ], {
        shell: process.platform === "win32",
        stdio: "inherit",
        windowsHide: false,
      });
      console.log(`Installed ${packageJson.name}@${packageJson.version} into VS Code`);
    }
  }
  await rm(stage, { recursive: true, force: true });
}
