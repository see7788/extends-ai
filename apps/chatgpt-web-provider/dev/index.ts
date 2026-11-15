import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const envobj = {
  CODEX_HOME: resolve(dirname(fileURLToPath(import.meta.url)), "dist", "codex-home"),
  CHATGPT_WEB_ALLOW_ANONYMOUS: "true",
  CHATGPT_WEB_PASSWORD_MODE: "current_date",
  CHATGPT_WEB_SESSION_SECRET: "dev-session-secret",
  CHATGPT_WEB_BACKEND: "browser",
  CHATGPT_WEB_CDP_URL: "http://127.0.0.1:11111",
  CHATGPT_WEB_PROFILE_DIR: resolve(dirname(fileURLToPath(import.meta.url)), "dist", "chatgpt-chrome-profile"),
  CHATGPT_WEB_HOST: "127.0.0.1",
  CHATGPT_WEB_PORT: "8791",
  CHATGPT_WEB_HEADLESS: "false",
};

await (async () => {
  const devRoot = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(devRoot, "..");
  const vscodeWorkspaceRoot = resolve(projectRoot, "..");
  const distRoot = resolve(devRoot, "dist");
  const logRoot = resolve(projectRoot, ".log");
  const pythonPath = resolve(projectRoot, ".venv", "Scripts", "python.exe");
  const chromePath = [
    resolve(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    resolve(process.env["ProgramFiles(x86)"] ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    resolve(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].find(existsSync);
  const vscodePath = [
    resolve(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
    "C:\\Program Files\\Microsoft VS Code\\Code.exe",
  ].find(existsSync);
  const healthUrl = `http://${envobj.CHATGPT_WEB_HOST}:${envobj.CHATGPT_WEB_PORT}/health`;
  const readHealth = async () => {
    try {
      const response = await fetch(healthUrl);
      if (!response.ok) return undefined;
      const data = await response.json() as { ok?: boolean; backend?: string; logged_in_hint?: boolean };
      return data.ok ? data : undefined;
    } catch {
      return undefined;
    }
  };
  const readCdpVersion = async () => {
    try {
      const response = await fetch(`${envobj.CHATGPT_WEB_CDP_URL}/json/version`);
      return response.ok;
    } catch {
      return false;
    }
  };
  const childEnv = { ...process.env, ...envobj };
  let browserProcess: ReturnType<typeof spawn> | undefined;
  if (!(await readCdpVersion())) {
    if (!chromePath) throw new Error("找不到 Google Chrome，请安装 Chrome 或手动启动 11111 CDP 浏览器");
    mkdirSync(envobj.CHATGPT_WEB_PROFILE_DIR, { recursive: true });
    browserProcess = spawn(chromePath, [
      "--remote-debugging-port=11111",
      `--user-data-dir=${envobj.CHATGPT_WEB_PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-popup-blocking",
      "--restore-last-session",
    ], {
      cwd: projectRoot,
      env: childEnv,
      stdio: "ignore",
      windowsHide: false,
    });
    for (let index = 0; index < 60; index += 1) {
      if (await readCdpVersion()) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
      if (browserProcess.exitCode !== null) throw new Error("Chrome 启动失败");
    }
    if (!(await readCdpVersion())) throw new Error("Chrome CDP 未在 30 秒内就绪");
  }
  const currentHealth = await readHealth();
  let providerProcess: ReturnType<typeof spawn> | undefined;
  if (!currentHealth) {
    if (!existsSync(pythonPath)) {
      throw new Error(`找不到 Python 虚拟环境：${pythonPath}`);
    }
    providerProcess = spawn(pythonPath, ["-m", "chatgpt_web_provider.app"], {
      cwd: projectRoot,
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    });
    let startedHealth: { ok?: boolean; backend?: string; logged_in_hint?: boolean } | undefined;
    for (let index = 0; index < 60; index += 1) {
      const health = await readHealth();
      if (health?.ok && health.backend === "browser") {
        startedHealth = health;
        break;
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
      if (providerProcess.exitCode !== null) throw new Error("ChatGPT Web 服务启动失败");
    }
    if (!startedHealth) throw new Error("ChatGPT Web 服务未能完成浏览器能力检查");
  } else if (currentHealth.backend !== "browser") {
    throw new Error(`已有服务不是浏览器版 ChatGPT Web 服务：${JSON.stringify(currentHealth)}`);
  }

  const readCapabilities = async () => {
    try {
      const response = await fetch(`http://${envobj.CHATGPT_WEB_HOST}:${envobj.CHATGPT_WEB_PORT}/v1/provider/capabilities`);
      if (!response.ok) return undefined;
      return await response.json() as {
        models?: Array<{ id?: string }>;
        levels?: Array<{ id?: string }>;
      };
    } catch {
      return undefined;
    }
  };
  const codexConfigPath = resolve(envobj.CODEX_HOME, "config.toml");
  const modelCatalogPath = resolve(envobj.CODEX_HOME, "model-catalog.json");
  let waitingForReadyNoticeShown = false;
  for (;;) {
    const health = await readHealth();
    const capabilities = await readCapabilities();
    if (health?.backend === "browser" && health.logged_in_hint === true && capabilities?.models?.length && capabilities.levels?.length && existsSync(codexConfigPath) && existsSync(modelCatalogPath)) {
      break;
    }
    if (!waitingForReadyNoticeShown) {
      waitingForReadyNoticeShown = true;
      console.warn("等待 ChatGPT Web 登录并读取模型、推理档位；完成前不会启动 VS Code。\n");
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
    if (providerProcess?.exitCode !== null) throw new Error("ChatGPT Web 服务已退出");
  }

  mkdirSync(distRoot, { recursive: true });
  mkdirSync(logRoot, { recursive: true });
  writeFileSync(resolve(distRoot, "start-isolated-vscode.bat"), [
    "@echo off",
    "setlocal",
    "set \"PROJECT_ROOT=%~dp0..\\..\"",
    "call pnpm --dir \"%PROJECT_ROOT%\" dev",
    "if errorlevel 1 pause",
    "endlocal",
    "",
  ].join("\r\n"), { encoding: "utf8" });

  if (!vscodePath) throw new Error("找不到 Visual Studio Code");
  const vscodeProcess = spawn(vscodePath, [
    "--new-window",
    vscodeWorkspaceRoot,
  ], {
    cwd: projectRoot,
    env: childEnv,
    stdio: "ignore",
    windowsHide: false,
  });
  console.log(`VS Code 已启动（仅隔离 CODEX_HOME，使用系统 VS Code 数据）：${vscodeWorkspaceRoot}`);
  console.log(`ChatGPT Chrome：${chromePath ?? "复用已有 CDP 浏览器"}`);
  console.log(`Chrome Profile：${envobj.CHATGPT_WEB_PROFILE_DIR}`);
  console.log(`CODEX_HOME：${envobj.CODEX_HOME}`);
  console.log(`ChatGPT Web：${healthUrl}`);
  console.log(`批处理启动文件：${resolve(distRoot, "start-isolated-vscode.bat")}`);

  let shuttingDown = false;
  let cdpMonitor: ReturnType<typeof setInterval> | undefined;
  const stopProcessTree = (child: ReturnType<typeof spawn> | undefined) => {
    if (!child?.pid) return;
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  };
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (cdpMonitor) clearInterval(cdpMonitor);
    stopProcessTree(providerProcess);
    stopProcessTree(browserProcess);
    stopProcessTree(vscodeProcess);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await new Promise<void>(resolvePromise => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        if (cdpMonitor) clearInterval(cdpMonitor);
        resolvePromise();
      }
    };
    const childExited = () => {
      stop();
      finish();
    };
    vscodeProcess.once("exit", childExited);
    browserProcess?.once("exit", () => {
      stop();
      finish();
    });
    providerProcess?.once("exit", () => {
      stop();
      finish();
    });
    if (!browserProcess) {
      cdpMonitor = setInterval(async () => {
        if (!(await readCdpVersion())) childExited();
      }, 2000);
    }
  });
})();
