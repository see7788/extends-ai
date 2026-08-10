import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const browserIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const browserApplicationValidator = z.object({
  executablePath: z.string().trim().min(1),
  launchArguments: z.array(z.string()),
  name: z.string().trim().min(1).max(120),
  sourcePath: z.string().trim().min(1).optional(),
});
const browserApplicationItemValidator = z.object({
  id: browserIdValidator,
  importSupported: z.boolean(),
  name: z.string().trim().min(1).max(120),
});
const browserApplicationsValidator = z.array(browserApplicationItemValidator);
const browserWindowHandlesValidator = z.object({
  handles: z.array(z.number().int().positive()),
});
const browserWindowCloseValidator = z.object({ closed: z.boolean() });
const environmentTextValidator = z.string().trim().min(1);
const shortcutValidator = z.object({
  arguments: z.string(),
  executablePath: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1),
});
const shortcutsResultValidator = z.object({
  shortcuts: z.array(shortcutValidator),
});
const urlValidator = z.string().url();
const applicationReadValidator = z.object({ browserId: browserIdValidator });
const openValidator = applicationReadValidator.extend({ url: urlValidator });
const request = {
  applicationsRead: z.object({ method: z.literal("applicationsRead") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.applicationsRead,
]);

type BrowserApplication = z.infer<typeof browserApplicationValidator>;
type BrowserApplications = z.infer<typeof browserApplicationsValidator>;
type RemoteDebug = {
  devToolsActivePortPath: string;
  inspectUrl: string;
};
type WindowOpen = {
  close(): Promise<boolean>;
  closed: Promise<void>;
};
type nodeState_t = {
  browserApp: Pick<import("electron").App, "getPath">;
  browserChildProcess: Pick<typeof import("node:child_process"), "execFile" | "spawn">;
  browserCrypto: Pick<typeof import("node:crypto"), "createHash">;
  browserFileSystem: Pick<typeof import("node:fs/promises"), "access">;
  browserOs: Pick<typeof import("node:os"), "homedir">;
  browserPath: Pick<typeof import("node:path"), "basename" | "join" | "resolve">;
  browserProcess: Pick<NodeJS.Process, "env" | "platform">;
};
type BrowserSlice = {
  browserActions: {
    applicationRead(input: unknown): Promise<BrowserApplication>;
    applicationsRead(): Promise<BrowserApplications>;
    executableOpen(
      executablePath: string,
      url: string,
      launchArguments?: string[],
    ): Promise<void>;
    open(input: unknown): Promise<void>;
    remoteDebugRead(
      executablePath: string,
      launchArguments?: string[],
    ): RemoteDebug;
    windowClose(executablePath: string, handle: number): Promise<boolean>;
    windowHandlesRead(executablePath: string): Promise<number[]>;
    windowOpen(
      executablePath: string,
      url: string,
      launchArguments?: string[],
      signal?: AbortSignal,
    ): Promise<WindowOpen>;
    windowOpenRead(executablePath: string): Promise<boolean>;
  };
};

const browser = {
  browserApplicationValidator,
  browserApplicationsValidator,
  browserIdValidator,
  browserWindowCloseValidator,
  browserWindowHandlesValidator,
  channel: "browser",
  environmentTextValidator,
  input: {
    applicationRead: applicationReadValidator,
    open: openValidator,
  },
  request,
  requestValidator,
  result: {
    applicationsRead: browserApplicationsValidator,
  },
  shortcutsResultValidator,
  urlValidator,
} as const;

const browserStore: ImmerStateCreator<BrowserSlice, nodeState_t> = (_set, get) => {
const execFileAsync = (
  file: string,
  arguments_: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    maxBuffer?: number;
    windowsHide?: boolean;
  },
): Promise<{ stdout: string }> => new Promise((resolveRun, reject) => {
  get().browserChildProcess.execFile(
    file,
    arguments_,
    { ...options, encoding: "utf8" },
    (error, stdout) => {
      if (error) reject(error);
      else resolveRun({ stdout });
    },
  );
});
const registryRoots = [
  "HKEY_CURRENT_USER\\Software\\Clients\\StartMenuInternet",
  "HKEY_LOCAL_MACHINE\\Software\\Clients\\StartMenuInternet",
  "HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Clients\\StartMenuInternet",
];
const environmentTextRead = (value: string | undefined): string | undefined => {
  const result = browser.environmentTextValidator.safeParse(value);
  return result.success ? result.data : undefined;
};
const registryValueRead = (output: string): string | undefined => {
  for (const line of output.split(/\r?\n/).reverse()) {
    const match = line.match(/\s+REG_(?:EXPAND_)?SZ\s+(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
};
const environmentExpand = (value: string): string => value.replace(
  /%([^%]+)%/g,
  (source, name: string) => get().browserProcess.env[name] ?? source,
);
const executablePathRead = (command: string): string | undefined => {
  const expanded = environmentExpand(command).trim();
  const quoted = expanded.match(/^"([^"]+\.exe)"/i)?.[1];
  if (quoted) return quoted;
  return expanded.match(/^((?:[a-z]:\\|\\\\).+?\.exe)(?:\s|$)/i)?.[1];
};
const registryQuery = async (key: string): Promise<string | undefined> => {
  try {
    const { stdout } = await execFileAsync("reg.exe", ["query", key, "/ve"], {
      windowsHide: true,
    });
    return registryValueRead(stdout);
  } catch {
    return undefined;
  }
};
const registryKeysRead = async (): Promise<string[]> => {
  const keys = new Set<string>();
  await Promise.all(registryRoots.map(async root => {
    try {
      const { stdout } = await execFileAsync("reg.exe", ["query", root], {
        windowsHide: true,
      });
      for (const line of stdout.split(/\r?\n/)) {
        const key = line.trim();
        if (key.toLowerCase().startsWith(`${root.toLowerCase()}\\`)) keys.add(key);
      }
    } catch {
      // This registry hive may not contain browser registrations.
    }
  }));
  return [...keys];
};
const commandArgumentsRead = (commandLine: string): string[] => {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < commandLine.length; index += 1) {
    const character = commandLine[index];
    if (character === "\\" && commandLine[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (/\s/.test(character) && !quoted) {
      if (current) {
        result.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }
  if (quoted) throw new Error("浏览器快捷方式参数中的引号不完整");
  if (current) result.push(current);
  return result;
};
const executableNames = new Set([
  "brave.exe",
  "chrome.exe",
  "firefox.exe",
  "msedge.exe",
  "opera.exe",
  "vivaldi.exe",
]);
const shortcutsRead = async (desktopPath: string): Promise<BrowserApplication[]> => {
  const script = [
    "$desktopPath = [Environment]::GetEnvironmentVariable('BROWSER_PARTITION_DESKTOP')",
    "$shell = New-Object -ComObject WScript.Shell",
    "$shortcuts = @(Get-ChildItem -LiteralPath $desktopPath -Filter '*.lnk' -File | ForEach-Object {",
    "  $shortcut = $shell.CreateShortcut($_.FullName)",
    "  [pscustomobject]@{ arguments = $shortcut.Arguments; executablePath = $shortcut.TargetPath; name = $_.BaseName; sourcePath = $_.FullName }",
    "})",
    "[pscustomobject]@{ shortcuts = $shortcuts } | ConvertTo-Json -Compress -Depth 3",
  ].join("\n");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: { ...get().browserProcess.env, BROWSER_PARTITION_DESKTOP: desktopPath },
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
    const value = browser.shortcutsResultValidator.parse(JSON.parse(stdout));
    const shortcuts = await Promise.all(value.shortcuts.map(async shortcut => {
      if (!executableNames.has(
        get().browserPath.basename(shortcut.executablePath).toLowerCase(),
      )) return undefined;
      try {
        await get().browserFileSystem.access(shortcut.executablePath);
        return {
          executablePath: shortcut.executablePath,
          launchArguments: commandArgumentsRead(shortcut.arguments),
          name: shortcut.name,
          sourcePath: shortcut.sourcePath,
        };
      } catch {
        return undefined;
      }
    }));
    return shortcuts.filter(value => value !== undefined);
  } catch {
    return [];
  }
};
const sourceRead = async (desktopPath?: string): Promise<BrowserApplication[]> => {
  if (get().browserProcess.platform !== "win32") return [];
  const applications = await Promise.all((await registryKeysRead()).map(async key => {
    const [name, command] = await Promise.all([
      registryQuery(key),
      registryQuery(`${key}\\shell\\open\\command`),
    ]);
    const executablePath = command && executablePathRead(command);
    if (!executablePath || executablePath.toLowerCase().endsWith("\\iexplore.exe")) {
      return undefined;
    }
    try {
      await get().browserFileSystem.access(executablePath);
    } catch {
      return undefined;
    }
    return {
      executablePath,
      launchArguments: [] as string[],
      name: name ?? key.slice(key.lastIndexOf("\\") + 1),
    };
  }));
  const shortcuts = desktopPath ? await shortcutsRead(desktopPath) : [];
  const unique = new Map<string, BrowserApplication>();
  for (const application of applications) {
    if (application) unique.set(identityRead(application), application);
  }
  for (const shortcut of shortcuts) {
    const identity = identityRead(shortcut);
    if (!unique.has(identity)) unique.set(identity, shortcut);
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
};
const identityRead = (application: BrowserApplication): string => JSON.stringify({
  executablePath: application.executablePath.toLowerCase(),
  launchArguments: application.launchArguments,
});
const idRead = (application: BrowserApplication): string => get().browserCrypto
  .createHash("sha256")
  .update(JSON.stringify({
    executablePath: application.executablePath.toLowerCase(),
    launchArguments: application.launchArguments,
    sourcePath: application.sourcePath?.toLowerCase() ?? null,
  }), "utf8")
  .digest("hex")
  .slice(0, 24);

const applicationRead = async (input: unknown) => {
    const { browserId } = browser.input.applicationRead.parse(input);
    const application = (await sourceRead(get().browserApp.getPath("desktop")))
      .find(value => idRead(value) === browserId);
    if (!application) throw new Error("所选浏览器不可用，请重新读取浏览器列表");
    return browser.browserApplicationValidator.parse(application);
};

const applicationsRead = async () => {
    const source = browser.browserApplicationValidator.array().parse(
      await sourceRead(get().browserApp.getPath("desktop")),
    );
    return browser.browserApplicationsValidator.parse(source.map(application => ({
      id: idRead(application),
      importSupported: (() => {
        try {
          remoteDebugRead(application.executablePath, application.launchArguments);
          return true;
        } catch {
          return false;
        }
      })(),
      name: application.name,
    })));
};

const executableOpen = async (
    executablePath: string,
    url: string,
    launchArguments: string[] = [],
  ): Promise<void> => {
    await get().browserFileSystem.access(executablePath);
    const validUrl = browser.urlValidator.parse(url);
    await new Promise<void>((resolveOpen, reject) => {
    const child = get().browserChildProcess.spawn(
      executablePath,
      [...launchArguments, validUrl],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      },
    );
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolveOpen();
      });
    });
};

const open = async (input: unknown): Promise<void> => {
    const value = browser.input.open.parse(input);
    const application = await applicationRead(value);
    await executableOpen(
      application.executablePath,
      value.url,
      application.launchArguments,
    );
};

const remoteDebugRead = (
  executablePath: string,
  launchArguments: string[] = [],
) => {
    if (get().browserProcess.platform !== "win32") {
      throw new Error("当前只支持从 Windows Chromium 浏览器导入网页登录态");
    }
    const localAppData = environmentTextRead(get().browserProcess.env.LOCALAPPDATA)
      ?? get().browserPath.join(get().browserOs.homedir(), "AppData", "Local");
    const normalized = executablePath.replace(/\//g, "\\").toLowerCase();
    const products = [
      ["\\google\\chrome sxs\\application\\", "Google/Chrome SxS/User Data", "chrome://inspect/#remote-debugging"],
      ["\\google\\chrome beta\\application\\", "Google/Chrome Beta/User Data", "chrome://inspect/#remote-debugging"],
      ["\\google\\chrome\\application\\", "Google/Chrome/User Data", "chrome://inspect/#remote-debugging"],
    ] as const;
    const product = products.find(([marker]) => normalized.includes(marker));
    if (!product) throw new Error("所选浏览器暂不支持授权读取网页登录态");
    const profileArgument = launchArguments.find(argument => (
      argument.toLowerCase().startsWith("--user-data-dir=")
    ));
    const profile = profileArgument
      ? get().browserPath.resolve(
          environmentExpand(profileArgument.slice(profileArgument.indexOf("=") + 1)),
        )
      : get().browserPath.join(localAppData, ...product[1].split("/"));
    return {
      devToolsActivePortPath: get().browserPath.join(profile, "DevToolsActivePort"),
      inspectUrl: product[2],
    };
};

const windowClose = async (
  executablePath: string,
  handle: number,
): Promise<boolean> => {
    await get().browserFileSystem.access(executablePath);
    if (get().browserProcess.platform !== "win32") return false;
    const script = [
      "$source = @'",
      "using System;",
      "using System.Runtime.InteropServices;",
      "public static class BrowserPartitionWindowClose {",
      "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);",
      "  [DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr handle, uint message, IntPtr word, IntPtr data);",
      "}",
      "'@",
      "Add-Type -TypeDefinition $source",
      "$targetPath = [Environment]::GetEnvironmentVariable('BROWSER_PARTITION_EXECUTABLE')",
      "$handle = [IntPtr]([long][Environment]::GetEnvironmentVariable('BROWSER_PARTITION_WINDOW_HANDLE'))",
      "$processId = [uint32]0",
      "[BrowserPartitionWindowClose]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null",
      "$closed = $false",
      "try {",
      "  $process = Get-Process -Id $processId -ErrorAction Stop",
      "  if ($process.Path -and [StringComparer]::OrdinalIgnoreCase.Equals($process.Path, $targetPath)) {",
      "    $closed = [BrowserPartitionWindowClose]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)",
      "  }",
      "} catch {}",
      "[pscustomobject]@{ closed = $closed } | ConvertTo-Json -Compress",
    ].join("\n");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: {
          ...get().browserProcess.env,
          BROWSER_PARTITION_EXECUTABLE: executablePath,
          BROWSER_PARTITION_WINDOW_HANDLE: String(handle),
        },
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    return browser.browserWindowCloseValidator.parse(JSON.parse(stdout)).closed;
};

const windowHandlesRead = async (executablePath: string): Promise<number[]> => {
    await get().browserFileSystem.access(executablePath);
    if (get().browserProcess.platform !== "win32") return [];
    const script = [
      "$source = @'",
      "using System;",
      "using System.Runtime.InteropServices;",
      "public static class BrowserPartitionWindowList {",
      "  public delegate bool EnumWindowsCallback(IntPtr handle, IntPtr state);",
      "  [DllImport(\"user32.dll\")] public static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr state);",
      "  [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);",
      "  [DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(IntPtr handle);",
      "}",
      "'@",
      "Add-Type -TypeDefinition $source",
      "$targetPath = [Environment]::GetEnvironmentVariable('BROWSER_PARTITION_EXECUTABLE')",
      "$handles = [System.Collections.Generic.List[long]]::new()",
      "$callback = [BrowserPartitionWindowList+EnumWindowsCallback]{",
      "  param($handle, $state)",
      "  if ([BrowserPartitionWindowList]::IsWindowVisible($handle)) {",
      "    $processId = [uint32]0",
      "    [BrowserPartitionWindowList]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null",
      "    try {",
      "      $process = Get-Process -Id $processId -ErrorAction Stop",
      "      if ($process.Path -and [StringComparer]::OrdinalIgnoreCase.Equals($process.Path, $targetPath)) {",
      "        $handles.Add($handle.ToInt64())",
      "      }",
      "    } catch {}",
      "  }",
      "  return $true",
      "}",
      "[BrowserPartitionWindowList]::EnumWindows($callback, [IntPtr]::Zero) | Out-Null",
      "[pscustomobject]@{ handles = @($handles) } | ConvertTo-Json -Compress",
    ].join("\n");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        env: {
          ...get().browserProcess.env,
          BROWSER_PARTITION_EXECUTABLE: executablePath,
        },
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    return browser.browserWindowHandlesValidator.parse(JSON.parse(stdout)).handles;
};

const windowOpen = async (
    executablePath: string,
    url: string,
    launchArguments: string[] = [],
    signal?: AbortSignal,
  ): Promise<{
    close(): Promise<boolean>;
    closed: Promise<void>;
  }> => {
    const canceledError = (): Error => {
      const error = new Error("浏览器操作已取消");
      error.name = "AbortError";
      return error;
    };
    const previous = new Set(await windowHandlesRead(executablePath));
    if (signal?.aborted) throw canceledError();
    let canceled = false;
    const cancel = (): void => {
      canceled = true;
    };
    signal?.addEventListener("abort", cancel, { once: true });
    await executableOpen(
      executablePath,
      url,
      [...launchArguments, "--new-window"],
    );
    try {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const handle = (await windowHandlesRead(executablePath))
          .find(value => !previous.has(value));
        if (handle !== undefined) {
          const closed = (async (): Promise<void> => {
            while (true) {
              try {
                if (!(await windowHandlesRead(executablePath)).includes(handle)) return;
              } catch {
                return;
              }
              await new Promise(resolveWait => setTimeout(resolveWait, 200));
            }
          })();
          const result = {
            close: () => windowClose(executablePath, handle),
            closed,
          };
          if (!canceled) return result;
          await result.close().catch(() => false);
          throw canceledError();
        }
        await new Promise(resolveWait => setTimeout(resolveWait, 100));
      }
      if (canceled) throw canceledError();
      throw new Error("浏览器没有创建授权窗口");
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
};

const windowOpenRead = async (executablePath: string): Promise<boolean> => {
    return (await windowHandlesRead(executablePath)).length > 0;
};

return {
  browserActions: {
    applicationRead,
    applicationsRead,
    executableOpen,
    open,
    remoteDebugRead,
    windowClose,
    windowHandlesRead,
    windowOpen,
    windowOpenRead,
  },
};
};

export {
  browser,
  type BrowserApplication,
  type BrowserApplications,
  type BrowserSlice,
  type nodeState_t,
};
export default browserStore;
