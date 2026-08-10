import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
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
  childProcess: Pick<typeof import("node:child_process"), "execFile" | "spawn">;
  fileSystem: Pick<
    typeof import("node:fs/promises"),
    "access" | "cp" | "mkdir" | "mkdtemp" | "rm" | "stat"
  >;
  os: Pick<typeof import("node:os"), "homedir" | "tmpdir">;
  path: Pick<typeof import("node:path"), "dirname" | "join">;
  process: Pick<NodeJS.Process, "env" | "platform">;
  readLine: Pick<typeof import("node:readline"), "createInterface">;
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
    const configured = environmentTextRead(get().process.env.CODEX_EXECUTABLE);
    if (configured) return configured;
    const localAppData = environmentTextRead(get().process.env.LOCALAPPDATA)
      ?? get().path.join(get().os.homedir(), "AppData", "Local");
    const desktopCodex = get().path.join(
      localAppData,
      "Programs",
      "OpenAI",
      "Codex",
      "bin",
      "codex.exe",
    );
    try {
      await get().fileSystem.access(desktopCodex);
      return desktopCodex;
    } catch {
      // Continue with PATH lookup.
    }
    if (get().process.platform === "win32") {
      try {
        const stdout = await new Promise<string>((resolve, reject) => {
          get().childProcess.execFile("where.exe", ["codex"], (error, value) => {
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
        ...get().process.env,
        CODEX_HOME: this.codexHome,
      };
      delete environment.OPENAI_API_KEY;
      const child = get().childProcess.spawn(executable, [
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
      this.output = get().readLine.createInterface({ input: child.stdout });
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
    await get().fileSystem.mkdir(get().path.dirname(target), { recursive: true });
    await get().fileSystem.cp(source, target, { force: true });
  };
  const request = async <T>(options: AccountConnectionRequestOptions<T>): Promise<T> => {
    const codexHome = await get().fileSystem.mkdtemp(
      get().path.join(get().os.tmpdir(), "codex-app-server-account-"),
    );
    const temporaryAuthFile = get().path.join(codexHome, "auth.json");
    await authFileCopy(options.authFile, temporaryAuthFile);
    const appServer = new AppServer(codexHome);
    try {
      await appServer.open();
      const result = await appServer.request(options.method, options.params);
      return options.resultValidator.parse(result);
    } finally {
      await appServer.dispose();
      try {
        await get().fileSystem.stat(temporaryAuthFile);
        await authFileCopy(temporaryAuthFile, options.authFile);
        if (options.materializedCodexHome) {
          await authFileCopy(
            temporaryAuthFile,
            get().path.join(options.materializedCodexHome, "auth.json"),
          );
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      } finally {
        await get().fileSystem.rm(codexHome, { force: true, recursive: true });
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
