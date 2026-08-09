import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { CookiesSetDetails } from "electron";
import { browser } from "browser-partition-main/browser/store.ts";
import { z } from "zod";

const candidateValidator = z.object({
  browserId: browser.browserIdValidator,
  browserName: z.string().trim().min(1).max(120),
  partition: z.string().trim().min(1),
});
const importRecordValidator = candidateValidator.omit({ partition: true }).extend({
  importedAt: z.string().datetime({ offset: true }),
});
const importHistoryValidator = z.record(
  browser.browserIdValidator,
  importRecordValidator,
);
const cookieImportValidator = z.object({
  activeBrowserId: browser.browserIdValidator.nullable(),
  authorizationExpiresAt: z.string().datetime({ offset: true }).nullable(),
  authorizationTimeoutSeconds: z.number().int().min(1).max(3_600),
  candidate: candidateValidator.nullable(),
  error: z.string().nullable(),
  errorBrowserId: browser.browserIdValidator.nullable(),
  history: importHistoryValidator.default({}),
  status: z.enum(["idle", "working", "ready", "error"]),
});
const createValidator = z.object({ browserId: browser.browserIdValidator });
const candidateClearValidator = candidateValidator.pick({ partition: true });
const historyRemoveValidator = createValidator;
const authorizationTimeoutSecondsSetValidator = cookieImportValidator.pick({
  authorizationTimeoutSeconds: true,
});
const authorizationStartValidator = z.object({
  expiresAt: z.string().datetime({ offset: true }),
});
const operationFailValidator = z.object({ error: z.string().min(1) });
const commandValidator = z.object({});
const cancelResultValidator = z.object({ canceled: z.boolean() });
const settingResultValidator = z.object({ updated: z.boolean() });
const devToolsMessageValidator = z.object({
  id: z.number().int().positive().optional(),
  sessionId: z.string().min(1).optional(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string().min(1),
  }).passthrough().optional(),
}).passthrough();
const devToolsTargetsValidator = z.object({
  targetInfos: z.array(z.object({
    targetId: z.string().min(1),
    type: z.string().min(1),
    url: z.string(),
  }).passthrough()),
});
const devToolsAttachedValidator = z.object({ sessionId: z.string().min(1) });
const browserCookieValidator = z.object({
  name: z.string().min(1).max(4096),
  value: z.string().max(1024 * 1024),
  domain: z.string().trim().min(1).max(255),
  path: z.string().max(4096),
  expires: z.number().finite(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  session: z.boolean(),
  sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
  partitionKey: z.unknown().optional(),
}).passthrough();
const browserCookiesValidator = z.object({
  cookies: z.array(browserCookieValidator).max(512),
});

type CookieImport = z.infer<typeof cookieImportValidator>;
type BrowserImport = {
  browserName: string;
  dispose(): Promise<void>;
  webAccessCreate(): Promise<string>;
};
type CookieImportRuntime = {
  applicationRead(input: { browserId: string }): Promise<{
    executablePath: string;
    launchArguments: string[];
    name: string;
  }>;
  fileRead(path: string): Promise<string>;
  fileStat(path: string): Promise<{ isFile(): boolean; size: number }>;
  idCreate(): string;
  remoteDebugRead(executablePath: string, launchArguments: string[]): {
    devToolsActivePortPath: string;
    inspectUrl: string;
  };
  sessionRead(partition: string): {
    clearData(): Promise<void>;
    cookies: { set(details: CookiesSetDetails): Promise<void> };
    flushStorageData(): Promise<void> | void;
  };
  windowOpen(
    executablePath: string,
    url: string,
    launchArguments: string[],
    signal: AbortSignal,
  ): Promise<{ close(): Promise<boolean> }>;
};
type CookieImportSlice = {
  cookieImport: CookieImport;
  cookieImportActions: {
    authorizationFinish(): void;
    authorizationStart(input: z.infer<typeof authorizationStartValidator>): void;
    authorizationTimeoutSecondsSet(
      input: z.infer<typeof authorizationTimeoutSecondsSetValidator>,
    ): void;
    candidateClear(input: z.infer<typeof candidateClearValidator>): boolean;
    cancel(): boolean;
    create(input: {
      authorizationTimeoutSeconds: number;
      browserId: string;
      signal: AbortSignal;
    }, runtime: CookieImportRuntime): Promise<z.infer<typeof candidateValidator>>;
    dispose(): void;
    importOpen(
      browserId: string,
      signal: AbortSignal,
      authorizationTimeoutMs: number,
      runtime: CookieImportRuntime,
    ): Promise<BrowserImport>;
    historyRemove(input: z.infer<typeof historyRemoveValidator>): string | undefined;
    operationCancel(): void;
    operationFail(input: z.infer<typeof operationFailValidator>): void;
    operationStart(input: z.infer<typeof createValidator>): void;
    operationSucceed(input: z.infer<typeof candidateValidator>): void;
    start(browserId: string, runtime: CookieImportRuntime): Promise<boolean>;
  };
};

let active: AbortController | undefined;
const initial: CookieImport = {
  activeBrowserId: null,
  authorizationExpiresAt: null,
  authorizationTimeoutSeconds: 59,
  candidate: null,
  error: null,
  errorBrowserId: null,
  history: {},
  status: "idle",
};
const cookieImport = {
  candidateValidator,
  channel: {
    authorizationTimeoutSecondsSet: "login:cookie-import:authorization-timeout-seconds-set",
    cancel: "login:cookie-import:cancel",
    start: "login:cookie-import:start",
    stateRead: "login:cookie-import:state-read",
    stateUpdated: "login:cookie-import:state-updated",
  },
  cookieImportValidator,
  cookiesValidator: browserCookiesValidator,
  devToolsAttachedValidator,
  devToolsMessageValidator,
  devToolsTargetsValidator,
  importHistoryValidator,
  initial,
  input: {
    authorizationStart: authorizationStartValidator,
    authorizationTimeoutSecondsSet: authorizationTimeoutSecondsSetValidator,
    candidateClear: candidateClearValidator,
    command: commandValidator,
    create: createValidator,
    operationFail: operationFailValidator,
  },
  result: {
    cancel: cancelResultValidator,
    start: z.object({ completed: z.boolean() }),
    setting: settingResultValidator,
  },
};


const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);
const commandTimeoutMs = 15_000;
const cookieTextMaxBytes = 2 * 1024 * 1024;
const protocolMessageMaxBytes = 4 * 1024 * 1024;
const cookieUrls = ["https://chatgpt.com/"];
const allowedCookieDomains = ["chatgpt.com"];

const canceledError = (): Error => {
  const error = new Error("ChatGPT 登录已取消");
  error.name = "AbortError";
  return error;
};
const canceledAssert = (signal: AbortSignal): void => {
  if (signal.aborted) throw canceledError();
};
const wait = (milliseconds: number, signal: AbortSignal): Promise<void> => (
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(canceledError());
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  })
);
const endpointRead = async (
  activePortPath: string,
  runtime: CookieImportRuntime,
): Promise<string | undefined> => {
  let text: string;
  try {
    const value = await runtime.fileStat(activePortPath);
    if (!value.isFile() || value.size > 4096) {
      throw new Error("浏览器 DevToolsActivePort 文件无效");
    }
    text = await runtime.fileRead(activePortPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const [portText, browserPath] = text.trim().split(/\r?\n/);
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("浏览器 DevToolsActivePort 端口无效");
  }
  if (!browserPath?.startsWith("/devtools/browser/")) {
    throw new Error("浏览器 DevToolsActivePort 地址无效");
  }
  return `ws://127.0.0.1:${port}${browserPath}`;
};

type PendingRequest = {
  reject(error: unknown): void;
  resolve(value: unknown): void;
  timeout: ReturnType<typeof setTimeout>;
};

class DevToolsConnection {
  private disposed = false;
  private messageId = 0;
  private readonly pending = new Map<number, PendingRequest>();

  private constructor(
    private readonly socket: WebSocket,
    signal: AbortSignal,
  ) {
    socket.addEventListener("message", this.messageReceive);
    socket.addEventListener("close", this.closed);
    socket.addEventListener("error", this.failed);
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  static open(
    endpoint: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<DevToolsConnection> {
    canceledAssert(signal);
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(endpoint);
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        socket.removeEventListener("open", opened);
        socket.removeEventListener("error", failed);
        socket.removeEventListener("close", closed);
        if (error) {
          try {
            socket.close();
          } catch {
            // A connecting socket may already have been closed by the browser.
          }
          reject(error);
        } else {
          resolve(new DevToolsConnection(socket, signal));
        }
      };
      const opened = (): void => finish();
      const failed = (): void => finish(new Error("浏览器拒绝了调试连接"));
      const closed = (): void => finish(new Error("浏览器关闭了调试连接"));
      const abort = (): void => finish(canceledError());
      const timeout = setTimeout(() => finish(new Error(
        "等待浏览器授权超时，请重新选择浏览器后及时允许连接",
      )), timeoutMs);
      signal.addEventListener("abort", abort, { once: true });
      socket.addEventListener("open", opened, { once: true });
      socket.addEventListener("error", failed, { once: true });
      socket.addEventListener("close", closed, { once: true });
    });
  }

  request(method: string, params: unknown = {}, sessionId?: string): Promise<unknown> {
    if (this.disposed || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("浏览器调试连接已经关闭");
    }
    const id = ++this.messageId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`浏览器调试命令超时：${method}`));
      }, commandTimeoutMs);
      this.pending.set(id, { reject, resolve, timeout });
      try {
        this.socket.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.socket.removeEventListener("message", this.messageReceive);
    this.socket.removeEventListener("close", this.closed);
    this.socket.removeEventListener("error", this.failed);
    if (this.socket.readyState === WebSocket.OPEN
      || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close();
    }
    this.rejectAll(new Error("浏览器调试连接已经关闭"));
  };

  private readonly messageReceive = (event: MessageEvent): void => {
    if (typeof event.data !== "string") {
      this.rejectAll(new Error("浏览器返回了非文本调试消息"));
      this.dispose();
      return;
    }
    if (Buffer.byteLength(event.data, "utf8") > protocolMessageMaxBytes) {
      this.rejectAll(new Error("浏览器调试消息超过 4 MiB"));
      this.dispose();
      return;
    }
    let input: unknown;
    try {
      input = JSON.parse(event.data);
    } catch (error) {
      this.rejectAll(new Error("浏览器返回了无效的调试 JSON", { cause: error }));
      this.dispose();
      return;
    }
    const message = cookieImport.devToolsMessageValidator.safeParse(input);
    if (!message.success || message.data.id === undefined) return;
    const pending = this.pending.get(message.data.id);
    if (!pending) return;
    this.pending.delete(message.data.id);
    clearTimeout(pending.timeout);
    if (message.data.error) {
      pending.reject(new Error(`浏览器调试命令失败：${message.data.error.message}`));
      return;
    }
    pending.resolve(message.data.result);
  };

  private readonly closed = (): void => {
    this.disposed = true;
    this.rejectAll(new Error("浏览器关闭了调试连接"));
  };

  private readonly failed = (): void => {
    this.rejectAll(new Error("浏览器调试连接发生错误"));
  };

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

const connect = async (
  executablePath: string,
  launchArguments: string[],
  debug: ReturnType<CookieImportRuntime["remoteDebugRead"]>,
  signal: AbortSignal,
  authorizationTimeoutMs: number,
  runtime: CookieImportRuntime,
): Promise<{
  connection: DevToolsConnection;
  windowClose?: () => Promise<boolean>;
}> => {
  const deadline = Date.now() + authorizationTimeoutMs;
  try {
    const endpoint = await endpointRead(debug.devToolsActivePortPath, runtime);
    if (endpoint) {
      return {
        connection: await DevToolsConnection.open(endpoint, signal, deadline - Date.now()),
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
  }
  const openedWindow = await runtime.windowOpen(
    executablePath,
    debug.inspectUrl,
    launchArguments,
    signal,
  );
  try {
    while (Date.now() < deadline) {
      canceledAssert(signal);
      try {
        const endpoint = await endpointRead(debug.devToolsActivePortPath, runtime);
        if (endpoint) {
          return {
            connection: await DevToolsConnection.open(
              endpoint,
              signal,
              deadline - Date.now(),
            ),
            windowClose: openedWindow.close,
          };
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
      }
      await wait(Math.min(500, Math.max(1, deadline - Date.now())), signal);
    }
    throw canceledError();
  } catch (error) {
    await openedWindow.close().catch(() => false);
    throw error;
  }
};

const domainAllowed = (domain: string): boolean => {
  const normalized = domain.replace(/^\./, "").toLowerCase();
  return allowedCookieDomains.some(allowed => (
    normalized === allowed || normalized.endsWith(`.${allowed}`)
  ));
};

type BrowserCookie = ReturnType<
  typeof cookieImport.cookiesValidator.parse
>["cookies"][number];

const cookieKeyRead = (cookie: BrowserCookie): string => JSON.stringify([
  cookie.name,
  cookie.domain.replace(/^\./, "").toLowerCase(),
  cookie.path.startsWith("/") ? cookie.path : "/",
]);

const cookiesUniqueRead = (cookies: BrowserCookie[]): BrowserCookie[] => {
  const unique = new Map<string, BrowserCookie>();
  for (const cookie of cookies) {
    const key = cookieKeyRead(cookie);
    const current = unique.get(key);
    if (!current || (!current.secure && cookie.secure)) unique.set(key, cookie);
  }
  return [...unique.values()].sort((left, right) => (
    Number(left.secure) - Number(right.secure)
  ));
};

const cookiesRead = async (
  connection: DevToolsConnection,
  preferredTargetUrl: string,
) => {
  const targets = cookieImport.devToolsTargetsValidator.parse(
    await connection.request("Target.getTargets"),
  );
  const target = targets.targetInfos.find(value => (
    value.type === "page" && value.url === preferredTargetUrl
  )) ?? targets.targetInfos.find(value => value.type === "page");
  if (!target) throw new Error("所选浏览器没有可用于读取登录态的页面");
  const attached = cookieImport.devToolsAttachedValidator.parse(
    await connection.request("Target.attachToTarget", {
      flatten: true,
      targetId: target.targetId,
    }),
  );
  try {
    const result = cookieImport.cookiesValidator.parse(
      await connection.request("Network.getCookies", { urls: cookieUrls }, attached.sessionId),
    );
    const cookies = cookiesUniqueRead(result.cookies.filter(cookie => (
      domainAllowed(cookie.domain)
    )));
    const bytes = cookies.reduce((total, cookie) => total + Buffer.byteLength(
      `${cookie.name}${cookie.value}${cookie.domain}${cookie.path}`,
      "utf8",
    ), 0);
    if (bytes > cookieTextMaxBytes) throw new Error("网页登录态数据超过 2 MiB");
    if (cookies.length === 0) throw new Error("所选浏览器中没有 ChatGPT 登录态");
    return cookies;
  } finally {
    await connection.request("Target.detachFromTarget", {
      sessionId: attached.sessionId,
    }).catch(() => undefined);
  }
};

const cookieDetailsRead = (
  cookie: ReturnType<typeof cookieImport.cookiesValidator.parse>["cookies"][number],
): CookiesSetDetails | undefined => {
  if (cookie.partitionKey !== undefined) return undefined;
  if (!domainAllowed(cookie.domain)) return undefined;
  if (!cookie.session && cookie.expires > 0 && cookie.expires <= Date.now() / 1000) {
    return undefined;
  }
  const host = cookie.domain.replace(/^\./, "").toLowerCase();
  const path = cookie.path.startsWith("/") ? cookie.path : "/";
  const details: CookiesSetDetails = {
    url: `${cookie.secure ? "https" : "http"}://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
  };
  if (cookie.domain.startsWith(".")) details.domain = cookie.domain;
  if (!cookie.session && cookie.expires > 0) details.expirationDate = cookie.expires;
  if (cookie.sameSite) {
    details.sameSite = {
      Strict: "strict",
      Lax: "lax",
      None: "no_restriction",
    }[cookie.sameSite] as CookiesSetDetails["sameSite"];
  }
  return details;
};

const webAccessCreate = async (
  connection: DevToolsConnection,
  preferredTargetUrl: string,
  browserId: string,
  signal: AbortSignal,
  runtime: CookieImportRuntime,
) => {
  canceledAssert(signal);
  const partition = `persist:login.cookie-import.${browserId}.${runtime.idCreate()}`;
  const targetSession = runtime.sessionRead(partition);
  try {
    await targetSession.clearData();
    const cookies = await cookiesRead(connection, preferredTargetUrl);
    let imported = 0;
    for (const cookie of cookies) {
      canceledAssert(signal);
      const details = cookieDetailsRead(cookie);
      if (!details) continue;
      await targetSession.cookies.set(details);
      imported += 1;
    }
    if (imported === 0) throw new Error("浏览器登录态中没有可导入的 Cookie");
    await targetSession.flushStorageData();
    return partition;
  } catch (error) {
    await targetSession.clearData().catch(() => undefined);
    if (signal.aborted) throw canceledError();
    throw error;
  }
};

const cookieImportStore: ImmerStateCreator<CookieImportSlice> = (set, get) => ({
  cookieImport: structuredClone(initial),
  cookieImportActions: {
    async create(input, runtime) {
      const authorizationTimeoutMs = input.authorizationTimeoutSeconds * 1_000;
      let browserImport: BrowserImport | undefined;
      let partition: string | undefined;
      get().cookieImportActions.authorizationStart({
        expiresAt: new Date(Date.now() + authorizationTimeoutMs).toISOString(),
      });
      try {
        browserImport = await get().cookieImportActions.importOpen(
          input.browserId,
          input.signal,
          authorizationTimeoutMs,
          runtime,
        );
      } finally {
        get().cookieImportActions.authorizationFinish();
      }
      try {
        partition = await browserImport.webAccessCreate();
        const result = candidateValidator.parse({
          browserId: input.browserId,
          browserName: browserImport.browserName,
          partition,
        });
        await browserImport.dispose();
        browserImport = undefined;
        partition = undefined;
        return result;
      } finally {
        await browserImport?.dispose();
        if (partition) {
          await runtime.sessionRead(partition).clearData().catch(() => undefined);
        }
      }
    },
    async importOpen(browserId, signal, authorizationTimeoutMs, runtime) {
      const input = createValidator.parse({ browserId });
      const application = await runtime.applicationRead(input);
      const debug = runtime.remoteDebugRead(
        application.executablePath,
        application.launchArguments,
      );
      const connected = await connect(
        application.executablePath,
        application.launchArguments,
        debug,
        signal,
        authorizationTimeoutMs,
        runtime,
      );
      return {
        browserName: application.name,
        dispose: async () => {
          connected.connection.dispose();
          await connected.windowClose?.().catch(() => false);
        },
        webAccessCreate: () => webAccessCreate(
          connected.connection,
          debug.inspectUrl,
          input.browserId,
          signal,
          runtime,
        ),
      };
    },
    authorizationFinish() {
      set(state => {
        state.cookieImport.authorizationExpiresAt = null;
      });
    },
    authorizationStart(input) {
      const value = authorizationStartValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationExpiresAt = value.expiresAt;
      });
    },
    authorizationTimeoutSecondsSet(input) {
      const value = authorizationTimeoutSecondsSetValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationTimeoutSeconds = value.authorizationTimeoutSeconds;
      });
    },
    candidateClear(input) {
      const value = candidateClearValidator.parse(input);
      let cleared = false;
      set(state => {
        if (state.cookieImport.status !== "ready"
          || state.cookieImport.candidate?.partition !== value.partition) return;
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "idle";
        cleared = true;
      });
      return cleared;
    },
    historyRemove(input) {
      const { browserId } = historyRemoveValidator.parse(input);
      let candidatePartition: string | undefined;
      set(state => {
        delete state.cookieImport.history[browserId];
        if (state.cookieImport.status !== "ready"
          || state.cookieImport.candidate?.browserId !== browserId) return;
        candidatePartition = state.cookieImport.candidate.partition;
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "idle";
      });
      return candidatePartition;
    },
    cancel() {
      if (!active || active.signal.aborted) return false;
      active.abort();
      get().cookieImportActions.operationCancel();
      return true;
    },
    dispose() {
      active?.abort();
      active = undefined;
    },
    operationCancel() {
      set(state => {
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "idle";
      });
    },
    operationFail(input) {
      const value = operationFailValidator.parse(input);
      set(state => {
        const browserId = state.cookieImport.activeBrowserId;
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = value.error;
        state.cookieImport.errorBrowserId = browserId;
        state.cookieImport.status = "error";
      });
    },
    operationStart(input) {
      const value = createValidator.parse(input);
      set(state => {
        state.cookieImport.activeBrowserId = value.browserId;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = null;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.status = "working";
      });
    },
    operationSucceed(input) {
      const value = candidateValidator.parse(input);
      set(state => {
        state.cookieImport.activeBrowserId = null;
        state.cookieImport.authorizationExpiresAt = null;
        state.cookieImport.candidate = value;
        state.cookieImport.error = null;
        state.cookieImport.errorBrowserId = null;
        state.cookieImport.history[value.browserId] = {
          browserId: value.browserId,
          browserName: value.browserName,
          importedAt: new Date().toISOString(),
        };
        state.cookieImport.status = "ready";
      });
    },
    async start(browserId, runtime) {
      if (active) throw new Error("已有 Cookie 导入操作正在进行");
      const input = createValidator.parse({ browserId });
      const controller = new AbortController();
      active = controller;
      try {
        const actions = get().cookieImportActions;
        const current = get().cookieImport;
        const previousPartition = current.status === "ready"
          ? current.candidate?.partition
          : undefined;
        if (previousPartition) actions.candidateClear({ partition: previousPartition });
        actions.operationStart(input);
        try {
          if (previousPartition) {
            await runtime.sessionRead(previousPartition).clearData().catch(() => undefined);
          }
          const candidate = await actions.create({
            authorizationTimeoutSeconds: get().cookieImport.authorizationTimeoutSeconds,
            browserId: input.browserId,
            signal: controller.signal,
          }, runtime);
          actions.operationSucceed(candidate);
          return true;
        } catch (error) {
          if (canceled(error)) {
            actions.operationCancel();
            return false;
          }
          actions.operationFail({ error: errorText(error) });
          throw error;
        }
      } finally {
        if (active === controller) active = undefined;
      }
    },
  },
});

export { cookieImport };
export default cookieImportStore;
