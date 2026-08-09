import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import process from "node:process";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
import { promisify } from "node:util";
import { z, type ZodType } from "zod";
import { errorText } from "./public.ts";

export const pathSame = (left: string, right: string): boolean => (
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
);

export const directoryWritableAssert = async (directory: string): Promise<void> => {
  const probe = join(directory, `.codex-app-server-write-${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    const handle = await open(probe, "wx");
    await handle.close();
    await unlink(probe);
  } catch (error) {
    await unlink(probe).catch(() => undefined);
    throw new Error(`目录不可写：${directory}`, { cause: error });
  }
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};
const pathInside = (parent: string, child: string): boolean => {
  const value = relative(parent, child);
  return Boolean(value) && !value.startsWith("..") && !isAbsolute(value);
};
const pathWritableAssert = async (path: string): Promise<void> => {
  let existing = path;
  while (!await pathExists(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error(`找不到可写的父目录：${path}`);
    existing = parent;
  }
  const value = await stat(existing);
  if (!value.isDirectory()) throw new Error(`路径不是目录：${existing}`);
  await directoryWritableAssert(existing);
};

export const codexHomeMove = async (
  source: string | null,
  target: string,
): Promise<{ oldPathCleanupFailed: boolean }> => {
  if (!source) {
    await pathWritableAssert(target);
    return { oldPathCleanupFailed: false };
  }
  if (pathSame(source, target)) return { oldPathCleanupFailed: false };
  if (pathInside(source, target) || pathInside(target, source)) {
    throw new Error("新旧 CODEX_HOME 不能互相嵌套");
  }
  await pathWritableAssert(target);
  if (!await pathExists(source)) return { oldPathCleanupFailed: false };
  const sourceState = await stat(source);
  if (!sourceState.isDirectory()) throw new Error(`原 CODEX_HOME 不是目录：${source}`);
  if (await pathExists(target)) {
    const targetState = await stat(target);
    if (!targetState.isDirectory()) throw new Error(`新 CODEX_HOME 不是目录：${target}`);
    if ((await readdir(target)).length > 0) throw new Error(`新 CODEX_HOME 不是空目录：${target}`);
    await rm(target, { recursive: true });
  }
  await mkdir(dirname(target), { recursive: true });
  try {
    await rename(source, target);
    return { oldPathCleanupFailed: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  try {
    await cp(source, target, { errorOnExist: true, force: false, recursive: true });
  } catch (error) {
    await rm(target, { force: true, recursive: true });
    throw new Error("CODEX_HOME 复制失败，原目录保持不变", { cause: error });
  }
  let oldPathCleanupFailed = false;
  await rm(source, { recursive: true }).catch(() => {
    oldPathCleanupFailed = true;
  });
  return { oldPathCleanupFailed };
};

export const accountAuthPath = (userData: string, accountId: string): string => (
  join(userData, "codex-account-auth", accountId, "auth.json")
);
export const authFileCopy = async (source: string, target: string): Promise<void> => {
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { force: true });
};
export const authFileCopySync = (source: string, target: string): void => {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
};

export const electronRendererUrlRead = (): string | undefined => {
  const value = process.env.ELECTRON_RENDERER_URL?.trim();
  if (!value) return undefined;
  return z.string().url().parse(value);
};

const appServerMessageValidator = z.object({
  id: z.number().int().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
}).passthrough();
const appServerErrorValidator = z.object({
  message: z.string(),
}).passthrough();
type AppServerMessage = z.infer<typeof appServerMessageValidator>;
type Waiter = {
  resolve(value: unknown): void;
  reject(error: unknown): void;
};
type NotificationWaiter = {
  receive(message: AppServerMessage): boolean;
  reject(error: unknown): void;
};
export type ConnectionRequestOptions<T> = {
  accountId: string;
  codexHome: string;
  method: string;
  params?: unknown;
  resultValidator: ZodType<T>;
};

const execFileAsync = promisify(execFile);
const environmentTextRead = (value: string | undefined): string | undefined => {
  const result = z.string().trim().min(1).safeParse(value);
  return result.success ? result.data : undefined;
};
const appServerEnvironmentRead = (codexHome: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: codexHome };
  delete environment.OPENAI_API_KEY;
  return environment;
};
const codexExecutableRead = async (): Promise<string> => {
  const configured = environmentTextRead(process.env.CODEX_EXECUTABLE);
  if (configured) return configured;
  const localAppData = environmentTextRead(process.env.LOCALAPPDATA)
    ?? join(homedir(), "AppData", "Local");
  const desktopCodex = join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe");
  try {
    await access(desktopCodex);
    return desktopCodex;
  } catch {
    // Continue with PATH lookup.
  }
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync("where.exe", ["codex"]);
      const command = stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean);
      if (command) return command;
    } catch {
      // Let spawn report the final executable error.
    }
  }
  return "codex";
};

class AppServer {
  private closed = false;
  private child: ChildProcessWithoutNullStreams | undefined;
  private messageId = 0;
  private output: ReadLineInterface | undefined;
  private stderr = "";
  private readonly notificationWaiters = new Set<NotificationWaiter>();
  private readonly waiters = new Map<number, Waiter>();

  constructor(private readonly codexHome: string) {}

  async open(): Promise<void> {
    const executable = await codexExecutableRead();
    const child = spawn(executable, [
      "app-server",
      "-c",
      "cli_auth_credentials_store=\"file\"",
    ], {
      env: appServerEnvironmentRead(this.codexHome),
      shell: executable.toLowerCase().endsWith(".cmd"),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    this.output = createInterface({ input: child.stdout });
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-8192);
    });
    child.once("error", error => this.close(error));
    child.once("close", (code, signal) => this.close(new Error(
      `Codex App Server exited (${String(code)}, ${String(signal)})${
        this.stderr.trim() ? `: ${this.stderr.trim()}` : ""
      }`,
    )));
    child.stdin.once("error", error => this.close(error));
    this.output.on("line", line => this.messageReceive(line));
    await this.request("initialize", {
      clientInfo: { name: "extends-ai", title: "Extends AI", version: "0.1.0" },
    });
    this.messageSend({ method: "initialized", params: {} });
  }

  async request(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed || !this.child) {
      throw new Error(`Codex App Server is not connected: ${method}`);
    }
    const id = ++this.messageId;
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`Codex App Server request timed out: ${method}`));
      }, timeoutMs);
      this.waiters.set(id, {
        resolve: value => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.messageSend({ id, method, params });
    });
  }

  waitForNotification<T>(options: {
    method: string;
    predicate(value: T): boolean;
    timeoutMs?: number;
    validator: ZodType<T>;
  }): Promise<T> {
    if (this.closed) throw new Error("Codex App Server connection is closed");
    return new Promise<T>((resolve, reject) => {
      let waiter: NotificationWaiter;
      const timeout = setTimeout(() => {
        this.notificationWaiters.delete(waiter);
        reject(new Error(`Codex App Server notification timed out: ${options.method}`));
      }, options.timeoutMs ?? 10 * 60_000);
      waiter = {
        receive: message => {
          if (message.method !== options.method) return false;
          try {
            const value = options.validator.parse(message.params);
            if (!options.predicate(value)) return false;
            clearTimeout(timeout);
            resolve(value);
            return true;
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
            return true;
          }
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        },
      };
      this.notificationWaiters.add(waiter);
    });
  }

  close = (reason: unknown = new Error("Codex App Server connection closed")): void => {
    if (this.closed) return;
    this.closed = true;
    this.output?.close();
    this.child?.kill();
    for (const waiter of this.notificationWaiters) waiter.reject(reason);
    this.notificationWaiters.clear();
    for (const waiter of this.waiters.values()) waiter.reject(reason);
    this.waiters.clear();
  };

  async dispose(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.close();
      return;
    }
    const exited = new Promise<void>(resolve => child.once("close", () => resolve()));
    this.close();
    await Promise.race([
      exited,
      new Promise<void>(resolve => setTimeout(resolve, 2_000)),
    ]);
  }

  private messageSend(message: AppServerMessage): void {
    if (this.closed || !this.child) throw new Error("Codex App Server connection is closed");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private messageReceive(line: string): void {
    let message: AppServerMessage;
    try {
      message = appServerMessageValidator.parse(JSON.parse(line));
    } catch (error) {
      this.close(new Error("Codex App Server returned invalid JSON", { cause: error }));
      return;
    }
    if (message.id === undefined) {
      for (const waiter of this.notificationWaiters) {
        if (waiter.receive(message)) this.notificationWaiters.delete(waiter);
      }
      return;
    }
    const waiter = this.waiters.get(message.id);
    if (!waiter) return;
    this.waiters.delete(message.id);
    if (message.error !== undefined) {
      const parsedError = appServerErrorValidator.safeParse(message.error);
      waiter.reject(new Error(
        `Codex App Server request failed: ${parsedError.success
          ? parsedError.data.message
          : errorText(message.error)}`,
        { cause: message.error },
      ));
      return;
    }
    waiter.resolve(message.result);
  }
}

export const connectionRequest = async <T>(
  options: ConnectionRequestOptions<T>,
): Promise<T> => {
  const appServer = new AppServer(options.codexHome);
  try {
    await appServer.open();
    const result = await appServer.request(options.method, options.params);
    return options.resultValidator.parse(result);
  } finally {
    await appServer.dispose();
  }
};

export type AccountConnectionRequestOptions<T> = Omit<
  ConnectionRequestOptions<T>,
  "codexHome"
> & {
  authFile: string;
  materializedCodexHome?: string;
};
export const accountConnectionRequest = async <T>(
  options: AccountConnectionRequestOptions<T>,
): Promise<T> => {
  const codexHome = await mkdtemp(join(tmpdir(), "codex-app-server-account-"));
  const temporaryAuthFile = join(codexHome, "auth.json");
  await authFileCopy(options.authFile, temporaryAuthFile);
  try {
    return await connectionRequest({
      accountId: options.accountId,
      codexHome,
      method: options.method,
      params: options.params,
      resultValidator: options.resultValidator,
    });
  } finally {
    if (await pathExists(temporaryAuthFile)) {
      await authFileCopy(temporaryAuthFile, options.authFile);
      if (options.materializedCodexHome) {
        await authFileCopy(
          temporaryAuthFile,
          join(options.materializedCodexHome, "auth.json"),
        );
      }
    }
    await rm(codexHome, { force: true, recursive: true });
  }
};

const loginStartValidator = z.object({
  type: z.literal("chatgpt"),
  loginId: z.string().min(1),
  authUrl: z.string().url(),
});
const loginCompletedValidator = z.object({
  loginId: z.string().nullable(),
  success: z.boolean(),
  error: z.string().nullable(),
}).passthrough();
const loginCancelValidator = z.object({
  status: z.enum(["canceled", "notFound"]),
});
export const connectionLoginChatGpt = async (options: {
  codexHome: string;
  openAuthUrl(authUrl: string): Promise<void>;
  signal?: AbortSignal;
}): Promise<void> => {
  const appServer = new AppServer(options.codexHome);
  let abortListener: (() => void) | undefined;
  try {
    await appServer.open();
    const login = loginStartValidator.parse(await appServer.request("account/login/start", {
      type: "chatgpt",
      appBrand: "codex",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
    }));
    const completed = appServer.waitForNotification({
      method: "account/login/completed",
      predicate: value => value.loginId === login.loginId,
      validator: loginCompletedValidator,
    });
    const canceled = options.signal && new Promise<never>((_resolve, reject) => {
      const abortError = new Error("ChatGPT 登录已取消");
      abortError.name = "AbortError";
      abortListener = () => {
        void appServer.request("account/login/cancel", {
          loginId: login.loginId,
        }, 5_000).then(
          value => loginCancelValidator.parse(value),
          () => undefined,
        ).finally(() => reject(abortError));
      };
      if (options.signal?.aborted) abortListener();
      else options.signal?.addEventListener("abort", abortListener, { once: true });
    });
    if (!options.signal?.aborted) await options.openAuthUrl(login.authUrl);
    const result = await (canceled
      ? Promise.race([completed, canceled])
      : completed);
    if (options.signal?.aborted) {
      const error = new Error("ChatGPT 登录已取消");
      error.name = "AbortError";
      throw error;
    }
    if (!result.success) {
      throw new Error(result.error ?? "ChatGPT 登录失败");
    }
  } finally {
    if (options.signal && abortListener) {
      options.signal.removeEventListener("abort", abortListener);
    }
    await appServer.dispose();
  }
};
