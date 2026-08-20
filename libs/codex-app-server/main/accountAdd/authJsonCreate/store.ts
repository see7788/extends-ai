import { browser } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import type { WebContents } from "electron";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Interface as ReadLineInterface } from "node:readline";
import { z, type ZodType } from "zod";

const sourceValidator = z.object({
  sourceFileName: z.literal("auth.json"),
  sourcePath: z.string().trim().min(1),
  sourceText: z.string().min(1),
});
const authJsonCreateValidator = z.object({
  activeBrowserId: browser.browserIdValidator.nullable(),
  authorizationExpiresAt: z.string().min(1).nullable(),
  authorizationTimeoutSeconds: z.number().int().min(1).max(3_600),
  history: z.record(browser.browserIdValidator, z.object({
    browserId: browser.browserIdValidator,
    completedAt: z.string().min(1),
  })),
  status: z.enum(["idle", "working"]),
});
const createInputValidator = z.object({ browserId: browser.browserIdValidator });
const appServerMessageValidator = z.object({
  id: z.number().int().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
}).passthrough();
const appServerErrorValidator = z.object({ message: z.string() }).passthrough();
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
const loginCancelValidator = z.object({ status: z.enum(["canceled", "notFound"]) });
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: authJsonCreateValidator,
});

type AuthJsonCreate = z.infer<typeof authJsonCreateValidator>;
type AuthJsonCreateInput = z.infer<typeof createInputValidator>;
type AuthJsonCreateOperation = {
  authUrl: string;
  source: Promise<z.infer<typeof sourceValidator>>;
};
type AppServerMessage = z.infer<typeof appServerMessageValidator>;
type Waiter = {
  reject(error: unknown): void;
  resolve(value: unknown): void;
};
type NotificationWaiter = {
  receive(message: AppServerMessage): boolean;
  reject(error: unknown): void;
};
type nodeState_t = {
  app_getPath_temp_nodestate: string;
  childProcess_execFile_nodestate: typeof import("node:child_process").execFile;
  childProcess_spawn_nodestate: typeof import("node:child_process").spawn;
  fileSystem_access_nodestate: typeof import("node:fs/promises").access;
  fileSystem_mkdtemp_nodestate: typeof import("node:fs/promises").mkdtemp;
  fileSystem_readFile_nodestate: typeof import("node:fs/promises").readFile;
  fileSystem_rm_nodestate: typeof import("node:fs/promises").rm;
  os_homedir_nodestate: typeof import("node:os").homedir;
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
  webContents_nodestate?: WebContents;
};
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    cancel(): boolean;
    communicationStart(): () => void;
    create(input: AuthJsonCreateInput): Promise<AuthJsonCreateOperation>;
    dispose(): void;
  };
};

const initial: AuthJsonCreate = {
  activeBrowserId: null,
  authorizationExpiresAt: null,
  authorizationTimeoutSeconds: 59,
  history: {},
  status: "idle",
};
const authJsonCreate = {
  authJsonCreateValidator,
  channel: "authJsonCreate",
  initial,
  input: {
    create: createInputValidator,
  },
  messageValidator,
  requestValidator,
  sourceValidator,
};

const authJsonCreateStore: ImmerStateCreator<
  AuthJsonCreateSlice,
  nodeState_t
> = (set, get) => {
  let active: AbortController | undefined;
  const errorText = (error: unknown): string => error instanceof Error
    ? error.message
    : String(error);
  const canceledError = (): Error => {
    const error = new Error("Codex 登录已取消");
    error.name = "AbortError";
    return error;
  };
  const stateSend = (): void => get().webContents_nodestate?.send(
    authJsonCreate.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().authJsonCreate }),
  );
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

  const sourceCreate = async (signal: AbortSignal): Promise<{
    authUrl: string;
    source: Promise<z.infer<typeof sourceValidator>>;
  }> => {
    const loginHome = await get().fileSystem_mkdtemp_nodestate(get().path_join_nodestate(
      get().app_getPath_temp_nodestate,
      "codex-app-server-login-",
    ));
    const appServer = new AppServer(loginHome);
    let abortListener: (() => void) | undefined;
    let sourceCreated = false;
    const dispose = async (): Promise<void> => {
      if (abortListener) signal.removeEventListener("abort", abortListener);
      await appServer.dispose();
      await get().fileSystem_rm_nodestate(loginHome, { force: true, recursive: true })
        .catch(() => undefined);
    };
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
      const canceled = new Promise<never>((_resolve, reject) => {
        const abortError = canceledError();
        abortListener = () => {
          void appServer.request("account/login/cancel", { loginId: login.loginId }, 5_000)
            .then(value => loginCancelValidator.parse(value), () => undefined)
            .finally(() => reject(abortError));
        };
        if (signal.aborted) abortListener();
        else signal.addEventListener("abort", abortListener, { once: true });
      });
      const source = Promise.race([completed, canceled]).then(async result => {
        if (!result.success) throw new Error(result.error ?? "ChatGPT 登录失败");
        const sourcePath = get().path_join_nodestate(loginHome, "auth.json");
        return sourceValidator.parse({
          sourceFileName: "auth.json",
          sourcePath,
          sourceText: await get().fileSystem_readFile_nodestate(sourcePath, "utf8"),
        });
      }).finally(dispose);
      sourceCreated = true;
      return { authUrl: login.authUrl, source };
    } finally {
      if (!sourceCreated) await dispose();
    }
  };

  return {
    authJsonCreate: structuredClone(initial),
    authJsonCreateActions: {
      cancel() {
        if (!active || active.signal.aborted) return false;
        active.abort();
        return true;
      },
      communicationStart() {
        const contents = get().webContents_nodestate;
        if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
        contents.ipc.handle(authJsonCreate.channel, (_event, input: unknown) => {
          authJsonCreate.requestValidator.parse(input);
          return authJsonCreate.authJsonCreateValidator.parse(get().authJsonCreate);
        });
        return () => contents.ipc.removeHandler(authJsonCreate.channel);
      },
      async create(input) {
        if (active) throw new Error("已有 auth.json 创建操作正在进行");
        const options = createInputValidator.parse(input);
        const controller = new AbortController();
        active = controller;
        set(state => {
          state.authJsonCreate.activeBrowserId = options.browserId;
          state.authJsonCreate.authorizationExpiresAt = new Date(
            Date.now() + state.authJsonCreate.authorizationTimeoutSeconds * 1_000,
          ).toISOString();
          state.authJsonCreate.status = "working";
        });
        stateSend();
        const timeout = setTimeout(
          () => controller.abort(),
          get().authJsonCreate.authorizationTimeoutSeconds * 1_000,
        );
        const finish = (): void => {
          clearTimeout(timeout);
          if (active === controller) active = undefined;
          set(state => {
            state.authJsonCreate.activeBrowserId = null;
            state.authJsonCreate.authorizationExpiresAt = null;
            state.authJsonCreate.status = "idle";
          });
          stateSend();
        };
        try {
          const operation = await sourceCreate(controller.signal);
          const source = operation.source.then(value => {
            if (controller.signal.aborted) throw canceledError();
            set(state => {
              state.authJsonCreate.history[options.browserId] = {
                browserId: options.browserId,
                completedAt: new Date().toISOString(),
              };
            });
            stateSend();
            return value;
          }).finally(finish);
          return { authUrl: operation.authUrl, source };
        } catch (error) {
          finish();
          throw error;
        }
      },
      dispose() {
        active?.abort();
        active = undefined;
      },
    },
  };
};

export {
  authJsonCreate,
  type AuthJsonCreate,
  type AuthJsonCreateInput,
  type AuthJsonCreateSlice,
  type nodeState_t,
};
export default authJsonCreateStore;
