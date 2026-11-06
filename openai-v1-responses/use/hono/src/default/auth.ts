import { randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import hono from "../declare/hono.ts";

const codexHome = join(homedir(), ".codex");
const localBaseUrl = new URL("/v1", hono.origin).toString().replace(/\/$/, "");
const authPath = join(codexHome, "auth.json");
const configPath = join(codexHome, "config.toml");
const powershellExe = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

async function createDirectory(): Promise<void> {
  await mkdir(codexHome, { recursive: true });
}

async function createAuthJson(): Promise<void> {
  // Keep a valid existing key: Codex may already have loaded it into its process.
  try {
    const existing = JSON.parse(await readFile(authPath, "utf8")) as {
      OPENAI_API_KEY?: unknown;
      tokens?: unknown;
      last_refresh?: unknown;
    };
    if (
      typeof existing.OPENAI_API_KEY === "string" &&
      existing.OPENAI_API_KEY.length > 0
    ) {
      return;
    }
  } catch {
    // Missing or malformed auth.json: create a new local API key below.
  }

  const auth = {
    OPENAI_API_KEY: randomBytes(32).toString("hex"),
    tokens: null,
    last_refresh: null,
  };
  await writeFile(authPath, JSON.stringify(auth, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function createVsCodeDirectories(): Promise<void> {
  await mkdir(join(codexHome, "vscode-user-data"), { recursive: true });
  await mkdir(join(homedir(), ".vscode", "extensions"), { recursive: true });
}

async function createConfigToml(): Promise<void> {
  let config = "";
  try {
    config = (await readFile(configPath, "utf8")).replace(/^\uFEFF/, "");
  } catch {
    // Create the Codex config if it does not exist.
  }

  config = config.replace(/^model_provider\s*=.*\r?\n/gm, "");
  config = config.replace(/^cli_auth_credentials_store\s*=.*\r?\n/gm, "");
  config = config.replace(/\[model_providers\.honopeerjs\][\s\S]*?(?=\r?\n\[|$)/g, "").trim();

  const provider = [
    'model_provider = "honopeerjs"',
    'cli_auth_credentials_store = "file"',
    "",
    "[model_providers.honopeerjs]",
    'name = "honopeerjs"',
    "base_url = " + JSON.stringify(localBaseUrl),
    'wire_api = "responses"',
    "requires_openai_auth = true",
    "supports_websockets = false",
  ].join("\n");
  const rootConfig = [
    'model_provider = "honopeerjs"',
    'cli_auth_credentials_store = "file"',
  ].join("\n");
  const providerSection = provider.slice(provider.indexOf("[model_providers.honopeerjs]"));
  const next = `${rootConfig}\n${config ? `${config}\n\n` : "\n"}${providerSection}\n`;
  await writeFile(configPath, next, "utf8");
}

async function createCodexConfig(): Promise<void> {
  await createDirectory();
  await createAuthJson();
  await createConfigToml();
}

function getCodeExecutableCommand(): string {
  return [
    "$programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')",
    "$candidates = @(",
    "  (Join-Path $env:LOCALAPPDATA 'Programs\\Microsoft VS Code\\Code.exe'),",
    "  (Join-Path $env:ProgramFiles 'Microsoft VS Code\\Code.exe'),",
    "  (Join-Path $programFilesX86 'Microsoft VS Code\\Code.exe')",
    ")",
    "$codeExe = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1",
    "if ($codeExe) { $codeExe; exit 0 }",
    "$command = Get-Command 'code' -ErrorAction SilentlyContinue | Select-Object -First 1",
    "if ($command) {",
    "  $installRoot = Split-Path (Split-Path $command.Source -Parent) -Parent",
    "  $codeExe = Join-Path $installRoot 'Code.exe'",
    "  if (Test-Path -LiteralPath $codeExe) { $codeExe; exit 0 }",
    "  if ($command.Source -match '\\.exe$') { $command.Source; exit 0 }",
    "}",
  ].join("\r\n");
}

function getCodeExecutable(): string {
  const result = execFileSync(
    powershellExe,
    ["-NoProfile", "-NonInteractive", "-Command", getCodeExecutableCommand()],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  if (!result) throw new Error("找不到 Visual Studio Code。请先安装 VS Code 或将 code 命令加入 PATH。");
  return result;
}

function createShortcutAt(shortcutPath: string, codeExecutable: string): void {
  const quote = (value: string) => value.replaceAll("'", "''");
  const command = [
    "$codexHome = '" + quote(codexHome) + "'",
    "$userDataDir = Join-Path $codexHome 'vscode-user-data'",
    "$extensionsDir = Join-Path $env:USERPROFILE '.vscode\\extensions'",
    "New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null",
    "New-Item -ItemType Directory -Path $extensionsDir -Force | Out-Null",
    "$env:CODEX_HOME = $codexHome",
    "Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue",
    "& '" + quote(codeExecutable) + "' --new-window --user-data-dir $userDataDir --extensions-dir $extensionsDir",
  ].join("; ");
  const encodedCommand = Buffer.from(command, "utf16le").toString("base64");
  const argumentsText = "-NoProfile -WindowStyle Hidden -EncodedCommand " + encodedCommand;
  const shortcutCommand = [
    "$shell = New-Object -ComObject WScript.Shell",
    "$shortcut = $shell.CreateShortcut('" + quote(shortcutPath) + "')",
    "$shortcut.TargetPath = '" + quote(powershellExe) + "'",
    "$shortcut.Arguments = '" + quote(argumentsText) + "'",
    "$shortcut.WorkingDirectory = '" + quote(homedir()) + "'",
    "$shortcut.Description = 'VS Code with isolated Codex configuration'",
    "$shortcut.IconLocation = '" + quote(codeExecutable) + ",0'",
    "$shortcut.Save()",
  ].join("; ");
  execFileSync(powershellExe, ["-NoProfile", "-NonInteractive", "-Command", shortcutCommand], {
    encoding: "utf8",
    windowsHide: true,
    stdio: "pipe",
  });
}

function createDesktopShortcut(): string {
  if (process.platform !== "win32") {
    throw new Error("快捷方式目前仅支持 Windows");
  }
  const codeExecutable = getCodeExecutable();
  const shortcutPath = join(codexHome, "vscode-codex.lnk");
  createShortcutAt(shortcutPath, codeExecutable);
  return shortcutPath;
}

function launchVsCode(): Promise<void> {
  const codeExecutable = getCodeExecutable();
  const userDataDir = join(codexHome, "vscode-user-data");
  const extensionsDir = join(homedir(), ".vscode", "extensions");

  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: codexHome };
    // Do not let a machine-wide or stale API key override this isolated auth.json.
    delete env.OPENAI_API_KEY;

    const child = spawn(codeExecutable, [
      "--new-window",
      "--user-data-dir", userDataDir,
      "--extensions-dir", extensionsDir,
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      env,
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function verifyApiKey(candidate: string | undefined): Promise<boolean> {
  if (!candidate) return false;
  try {
    const content = await readFile(authPath, "utf8");
    const auth = JSON.parse(content) as { OPENAI_API_KEY?: unknown };
    if (typeof auth.OPENAI_API_KEY !== "string") return false;
    const expected = Buffer.from(auth.OPENAI_API_KEY);
    const actual = Buffer.from(candidate);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export default {
  codexHome,
  localBaseUrl,
  authPath,
  configPath,
  createDirectory,
  createAuthJson,
  createConfigToml,
  createCodexConfig,
  createVsCodeDirectories,
  createDesktopShortcut,
  launchVsCode,
  verifyApiKey,
};
