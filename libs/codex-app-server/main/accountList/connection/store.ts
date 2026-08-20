import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Interface as ReadLineInterface } from "node:readline";
import { z, type ZodType } from "zod";

const appServerMessageValidator = z.object({
  id: z.number().int().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
}).passthrough();
const appServerErrorValidator = z.object({ message: z.string() }).passthrough();

type AppServerMessage = z.infer<typeof appServerMessageValidator>;
type Waiter = {
  reject(error: unknown): void;
  resolve(value: unknown): void;
};
type NotificationWaiter = {
  receive(message: AppServerMessage): boolean;
  reject(error: unknown): void;
};
type AccountConnectionRequestOptions<T> = {
  accountId: string;
  authFile: string;
  materializedCodexHome?: string;
  method: string;
  params?: unknown;
  resultValidator: ZodType<T>;
};
type nodeState_t = {
  childProcess_execFile_nodestate: typeof import("node:child_process").execFile;
  childProcess_spawn_nodestate: typeof import("node:child_process").spawn;
  fileSystem_access_nodestate: typeof import("node:fs/promises").access;
  fileSystem_cp_nodestate: typeof import("node:fs/promises").cp;
  fileSystem_mkdir_nodestate: typeof import("node:fs/promises").mkdir;
  fileSystem_mkdtemp_nodestate: typeof import("node:fs/promises").mkdtemp;
  fileSystem_rm_nodestate: typeof import("node:fs/promises").rm;
  fileSystem_stat_nodestate: typeof import("node:fs/promises").stat;
  os_homedir_nodestate: typeof import("node:os").homedir;
  os_tmpdir_nodestate: typeof import("node:os").tmpdir;
  path_dirname_nodestate: typeof import("node:path").dirname;
  path_join_nodestate: typeof import("node:path").join;
  process_env_APPDATA_nodestate?: string;
  process_env_CODEX_EXECUTABLE_nodestate?: string;
  process_env_HOME_nodestate?: string;
  process_env_LOCALAPPDATA_nodestate?: string;
  process_env_PATH_nodestate?: string;
  process_env_PATHEXT_nodestate?: string;
  process_env_SystemRoot_nodestate?: string;
  process_env_TEMP_nodestate?: string;
  process_env_TMP_nodestate?: string;
  process_env_USERPROFILE_nodestate?: string;
  process_platform_nodestate: NodeJS.Process["platform"];
  readline_createInterface_nodestate: typeof import("node:readline").createInterface;
};
type ConnectionSlice = {
  connectionActions: {
    request<T>(options: AccountConnectionRequestOptions<T>): Promise<T>;
  };
};

const connectionStore: ImmerStateCreator<ConnectionSlice, nodeState_t> = (_set, get) => {
  const accountQueues = new Map<string, Promise<unknown>>();
  const errorText = (error: unknown): string => error instanceof Error
    ? error.message
    : String(error);
  const environmentTextRead = (value: string | undefined): string | undefined => {
    const result = z.string().trim().min(1).safeParse(value);
    return result.success ? result.data : undefined;
  };
  const executableRead = async (): Promise<string> => {
    const configured = environmentTextRead(get().process_env_CODEX_EXECUTABLE_nodestate);
    if (configured) return configured;
    const localAppData = environmentTextRead(get().process_env_LOCALAPPDATA_nodestate)
      ?? get().path_join_nodestate(get().os_homedir_nodestate(), "AppData", "Local");
    const desktopCodex = get().path_join_nodestate(
      localAppData,
      "Programs",
      "OpenAI",
      "Codex",
      "bin",
      "codex.exe",
    );
    try {
      await get().fileSystem_access_nodestate(desktopCodex);
      return desktopCodex;
    } catch {
      // Continue with PATH lookup.
    }
    if (get().process_platform_nodestate === "win32") {
      try {
        const stdout = await new Promise<string>((resolve, reject) => {
          get().childProcess_execFile_nodestate("where.exe", ["codex"], (error, value) => {
            if (error) reject(error);
            else resolve(value);
          });
        });
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
      const executable = await executableRead();
      const environment: NodeJS.ProcessEnv = {
        APPDATA: get().process_env_APPDATA_nodestate,
        CODEX_HOME: this.codexHome,
        HOME: get().process_env_HOME_nodestate,
        LOCALAPPDATA: get().process_env_LOCALAPPDATA_nodestate,
        PATH: get().process_env_PATH_nodestate,
        PATHEXT: get().process_env_PATHEXT_nodestate,
        SystemRoot: get().process_env_SystemRoot_nodestate,
        TEMP: get().process_env_TEMP_nodestate,
        TMP: get().process_env_TMP_nodestate,
        USERPROFILE: get().process_env_USERPROFILE_nodestate,
      };
      const child = get().childProcess_spawn_nodestate(executable, [
        "app-server",
        "-c",
        "cli_auth_credentials_store=\"file\"",
      ], {
        env: environment,
        shell: executable.toLowerCase().endsWith(".cmd"),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      this.child = child;
      this.output = get().readline_createInterface_nodestate({ input: child.stdout });
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

    request(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
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

    close(reason: unknown = new Error("Codex App Server connection closed")): void {
      if (this.closed) return;
      this.closed = true;
      this.output?.close();
      this.child?.kill();
      for (const waiter of this.notificationWaiters) waiter.reject(reason);
      this.notificationWaiters.clear();
      for (const waiter of this.waiters.values()) waiter.reject(reason);
      this.waiters.clear();
    }

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
      if (message.id === undefined) return;
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

  const authFileCopy = async (source: string, target: string): Promise<void> => {
    await get().fileSystem_mkdir_nodestate(get().path_dirname_nodestate(target), { recursive: true });
    await get().fileSystem_cp_nodestate(source, target, { force: true });
  };
  const request = async <T>(options: AccountConnectionRequestOptions<T>): Promise<T> => {
    const codexHome = await get().fileSystem_mkdtemp_nodestate(
      get().path_join_nodestate(get().os_tmpdir_nodestate(), "codex-app-server-account-"),
    );
    const temporaryAuthFile = get().path_join_nodestate(codexHome, "auth.json");
    await authFileCopy(options.authFile, temporaryAuthFile);
    const appServer = new AppServer(codexHome);
    try {
      await appServer.open();
      const result = await appServer.request(options.method, options.params);
      return options.resultValidator.parse(result);
    } finally {
      await appServer.dispose();
      try {
        await get().fileSystem_stat_nodestate(temporaryAuthFile);
        await authFileCopy(temporaryAuthFile, options.authFile);
        if (options.materializedCodexHome) {
          await authFileCopy(
            temporaryAuthFile,
            get().path_join_nodestate(options.materializedCodexHome, "auth.json"),
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      } finally {
        await get().fileSystem_rm_nodestate(codexHome, { force: true, recursive: true });
      }
    }
  };

  return {
    connectionActions: {
      async request<T>(options: AccountConnectionRequestOptions<T>): Promise<T> {
        const previous = accountQueues.get(options.accountId) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(() => request(options));
        accountQueues.set(options.accountId, current);
        try {
          return await current;
        } finally {
          if (accountQueues.get(options.accountId) === current) {
            accountQueues.delete(options.accountId);
          }
        }
      },
    },
  };
};

export type { AccountConnectionRequestOptions, ConnectionSlice, nodeState_t };
export default connectionStore;
