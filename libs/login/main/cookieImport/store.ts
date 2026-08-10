import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type {
  CookiesSetDetails,
  session as electronSession,
  WebContents,
} from "electron";
import { browser } from "browser-partition-main/browser/store.ts";
import { z } from "zod";

const candidateValidator = z.object({
  browserId: browser.browserIdValidator,
  browserName: z.string().trim().min(1).max(120),
  partition: z.string().trim().min(1),
});
const importHistoryValidator = z.record(
  browser.browserIdValidator,
  candidateValidator.omit({ partition: true }).extend({
    importedAt: z.string().datetime({ offset: true }),
  }),
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
const authorizationTimeoutSecondsSetValidator = cookieImportValidator.pick({
  authorizationTimeoutSeconds: true,
});
const authorizationStartValidator = z.object({
  expiresAt: z.string().datetime({ offset: true }),
});
const operationFailValidator = z.object({ error: z.string().min(1) });
const activePortPathValidator = z.string().trim().min(1);
const endpointValidator = z.string().url().refine(value => (
  value.startsWith("ws://") || value.startsWith("wss://")
));
const timeoutMsValidator = z.number().int().min(1).max(3_600_000);
const preferredTargetUrlValidator = z.string().url();
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
const browserCookiesValidator = z.object({
  cookies: z.array(z.object({
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
  }).passthrough()).max(512),
});

const channel = "cookieImport";
const request = {
  authorizationTimeoutSecondsSet: z.object({
    method: z.literal("authorizationTimeoutSecondsSet"),
    input: authorizationTimeoutSecondsSetValidator,
  }),
  stateRead: z.object({ method: z.literal("stateRead") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.authorizationTimeoutSecondsSet,
  request.stateRead,
]);
const result = {
  setting: z.object({ updated: z.boolean() }),
};

type CookieImportContract = {
  candidateValidator: typeof candidateValidator;
  channel: typeof channel;
  cookieImportValidator: typeof cookieImportValidator;
  cookiesValidator: typeof browserCookiesValidator;
  devToolsAttachedValidator: typeof devToolsAttachedValidator;
  devToolsMessageValidator: typeof devToolsMessageValidator;
  devToolsTargetsValidator: typeof devToolsTargetsValidator;
  importHistoryValidator: typeof importHistoryValidator;
  initial: z.infer<typeof cookieImportValidator>;
  input: {
    authorizationStart: typeof authorizationStartValidator;
    authorizationTimeoutSecondsSet: typeof authorizationTimeoutSecondsSetValidator;
    candidateClear: typeof candidateClearValidator;
    create: typeof createValidator;
    operationFail: typeof operationFailValidator;
  };
  request: typeof request;
  requestValidator: typeof requestValidator;
  result: typeof result;
};

type CookieImport = z.infer<typeof cookieImportValidator>;
type BrowserApplications = z.infer<typeof browser.browserApplicationsValidator>;
type CookieImportCreateInput = z.infer<typeof createValidator>;
type DevToolsMessage = z.infer<typeof devToolsMessageValidator>;
type DevToolsTargets = z.infer<typeof devToolsTargetsValidator>;
type DevToolsAttached = z.infer<typeof devToolsAttachedValidator>;
type BrowserCookie = z.infer<typeof browserCookiesValidator>["cookies"][number];
type CookieParsers = {
  attached(input: unknown): DevToolsAttached;
  cookies(input: unknown): { cookies: BrowserCookie[] };
  message(input: unknown): DevToolsMessage;
  targets(input: unknown): DevToolsTargets;
};
type DevToolsConnection = {
  dispose(): void;
  request(method: string, params?: unknown, sessionId?: string): Promise<unknown>;
};
type PendingRequest = {
  reject(error: unknown): void;
  resolve(value: unknown): void;
  timeout: ReturnType<typeof setTimeout>;
};
type nodeState_t = {
  electronSession: Pick<typeof electronSession, "fromPartition">;
  fileSystem: Pick<typeof import("node:fs/promises"), "readFile" | "stat">;
  webContents?: WebContents;
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
    communicationStart(): () => void;
    connectionOpen(input: {
      endpoint: string;
      signal: AbortSignal;
      timeoutMs: number;
    }): Promise<DevToolsConnection>;
    endpointRead(activePortPath: string): Promise<string | undefined>;
    endpointWait(input: {
      activePortPath: string;
      signal: AbortSignal,
      timeoutMs: number;
    }): Promise<string>;
    historyRemove(input: z.infer<typeof createValidator>): Promise<boolean>;
    operationCancel(): void;
    operationFail(input: z.infer<typeof operationFailValidator>): void;
    operationStart(input: z.infer<typeof createValidator>): void;
    operationSucceed(input: z.infer<typeof candidateValidator>): void;
    partitionClear(partition: string): Promise<void>;
    webAccessCreate(input: {
      browserId: string;
      connection: DevToolsConnection;
      preferredTargetUrl: string;
      signal: AbortSignal;
    }): Promise<string>;
  };
  cookieImportPrivateActions: {
    canceledAssert(signal: AbortSignal): void;
    canceledError(): Error;
    cookieDetailsRead(cookie: BrowserCookie): CookiesSetDetails | undefined;
    cookiesRead(
      connection: DevToolsConnection,
      preferredTargetUrl: string,
      parsers: CookieParsers,
    ): Promise<BrowserCookie[]>;
    cookiesUniqueRead(cookies: BrowserCookie[]): BrowserCookie[];
    domainAllowed(domain: string): boolean;
    stateSend(): void;
    wait(milliseconds: number, signal: AbortSignal): Promise<void>;
  };
};

const initial = {
  activeBrowserId: null,
  authorizationExpiresAt: null,
  authorizationTimeoutSeconds: 59,
  candidate: null,
  error: null,
  errorBrowserId: null,
  history: {},
  status: "idle",
} satisfies CookieImport;
const cookieImport = {
  candidateValidator,
  channel,
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
    create: createValidator,
    operationFail: operationFailValidator,
  },
  request,
  requestValidator,
  result,
} satisfies CookieImportContract;


const cookieImportStore: ImmerStateCreator<
  CookieImportSlice,
  nodeState_t
> = (set, get) => {
  const commandTimeoutMs = 15_000;
  const cookieTextMaxBytes = 2 * 1024 * 1024;
  const protocolMessageMaxBytes = 4 * 1024 * 1024;
  const cookieUrls = ["https://chatgpt.com/"];
  const allowedCookieDomains = ["chatgpt.com"];

  class Connection implements DevToolsConnection {
    private disposed = false;
    private messageId = 0;
    private readonly pending = new Map<number, PendingRequest>();

    private constructor(
      private readonly socket: WebSocket,
      signal: AbortSignal,
      private readonly messageParse: CookieParsers["message"],
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
      messageParse: CookieParsers["message"],
    ): Promise<Connection> {
      get().cookieImportPrivateActions.canceledAssert(signal);
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
            resolve(new Connection(socket, signal, messageParse));
          }
        };
        const opened = (): void => finish();
        const failed = (): void => finish(new Error("浏览器拒绝了调试连接"));
        const closed = (): void => finish(new Error("浏览器关闭了调试连接"));
        const abort = (): void => finish(get().cookieImportPrivateActions.canceledError());
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
      let message: DevToolsMessage;
      try {
        message = this.messageParse(input);
      } catch {
        return;
      }
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(`浏览器调试命令失败：${message.error.message}`));
        return;
      }
      pending.resolve(message.result);
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

  return {
  cookieImport: structuredClone(cookieImport.initial),
  cookieImportActions: {
    authorizationFinish() {
      set(state => {
        state.cookieImport.authorizationExpiresAt = null;
      });
      get().cookieImportPrivateActions.stateSend();
    },
    authorizationStart(input) {
      const value = authorizationStartValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationExpiresAt = value.expiresAt;
      });
      get().cookieImportPrivateActions.stateSend();
    },
    authorizationTimeoutSecondsSet(input) {
      const value = authorizationTimeoutSecondsSetValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationTimeoutSeconds = value.authorizationTimeoutSeconds;
      });
      get().cookieImportPrivateActions.stateSend();
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
      get().cookieImportPrivateActions.stateSend();
      return cleared;
    },
    communicationStart() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) throw new Error("Login WebContents 不可用");
      contents.ipc.handle(cookieImport.channel, (_event, input: unknown) => {
        const requestValue = cookieImport.requestValidator.parse(input);
        switch (requestValue.method) {
        case "authorizationTimeoutSecondsSet":
          get().cookieImportActions.authorizationTimeoutSecondsSet(requestValue.input);
          return cookieImport.result.setting.parse({ updated: true });
        case "stateRead":
          return cookieImport.cookieImportValidator.parse(get().cookieImport);
        }
      });
      return () => contents.ipc.removeHandler(cookieImport.channel);
    },
    connectionOpen(input) {
      const endpoint = endpointValidator.parse(input.endpoint);
      const timeoutMs = timeoutMsValidator.parse(input.timeoutMs);
      return Connection.open(
        endpoint,
        input.signal,
        timeoutMs,
        value => cookieImport.devToolsMessageValidator.parse(value),
      );
    },
    async endpointRead(activePortPath) {
      const path = activePortPathValidator.parse(activePortPath);
      let text: string;
      try {
        const value = await get().fileSystem.stat(path);
        if (!value.isFile() || value.size > 4096) {
          throw new Error("浏览器 DevToolsActivePort 文件无效");
        }
        text = await get().fileSystem.readFile(path, "utf8");
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
    },
    async endpointWait(input) {
      const activePortPath = activePortPathValidator.parse(input.activePortPath);
      const timeoutMs = timeoutMsValidator.parse(input.timeoutMs);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        get().cookieImportPrivateActions.canceledAssert(input.signal);
        try {
          const endpoint = await get().cookieImportActions.endpointRead(activePortPath);
          if (endpoint) return endpoint;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
        }
        await get().cookieImportPrivateActions.wait(
          Math.min(500, Math.max(1, deadline - Date.now())),
          input.signal,
        );
      }
      throw new Error("浏览器授权超时");
    },
    async historyRemove(input) {
      const { browserId } = createValidator.parse(input);
      let candidatePartition: string | undefined;
      let removed = false;
      set(state => {
        removed = browserId in state.cookieImport.history;
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
      get().cookieImportPrivateActions.stateSend();
      if (candidatePartition) {
        await get().cookieImportActions.partitionClear(candidatePartition)
          .catch(() => undefined);
      }
      return removed;
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
      get().cookieImportPrivateActions.stateSend();
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
      get().cookieImportPrivateActions.stateSend();
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
      get().cookieImportPrivateActions.stateSend();
    },
    operationSucceed(input) {
      const value = cookieImport.candidateValidator.parse(input);
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
      get().cookieImportPrivateActions.stateSend();
    },
    partitionClear(partition) {
      const value = candidateClearValidator.parse({ partition });
      return get().electronSession.fromPartition(value.partition).clearData();
    },
    async webAccessCreate(input) {
      const browserId = createValidator.parse({ browserId: input.browserId }).browserId;
      const preferredTargetUrl = preferredTargetUrlValidator.parse(input.preferredTargetUrl);
      get().cookieImportPrivateActions.canceledAssert(input.signal);
      const partition = `persist:login.cookie-import.${browserId}.${crypto.randomUUID()}`;
      const targetSession = get().electronSession.fromPartition(partition);
      try {
        await targetSession.clearData();
        const cookies = await get().cookieImportPrivateActions.cookiesRead(
          input.connection,
          preferredTargetUrl,
          {
            attached: value => cookieImport.devToolsAttachedValidator.parse(value),
            cookies: value => cookieImport.cookiesValidator.parse(value),
            message: value => cookieImport.devToolsMessageValidator.parse(value),
            targets: value => cookieImport.devToolsTargetsValidator.parse(value),
          },
        );
        let imported = 0;
        for (const cookie of cookies) {
          get().cookieImportPrivateActions.canceledAssert(input.signal);
          const details = get().cookieImportPrivateActions.cookieDetailsRead(cookie);
          if (!details) continue;
          await targetSession.cookies.set(details);
          imported += 1;
        }
        if (imported === 0) throw new Error("浏览器登录态中没有可导入的 Cookie");
        await targetSession.flushStorageData();
        return partition;
      } catch (error) {
        await targetSession.clearData().catch(() => undefined);
        if (input.signal.aborted) {
          throw get().cookieImportPrivateActions.canceledError();
        }
        throw error;
      }
    },
  },
  cookieImportPrivateActions: {
    canceledAssert(signal) {
      if (signal.aborted) {
        throw get().cookieImportPrivateActions.canceledError();
      }
    },
    canceledError() {
      const error = new Error("ChatGPT 登录已取消");
      error.name = "AbortError";
      return error;
    },
    cookieDetailsRead(cookie) {
      if (cookie.partitionKey !== undefined) return undefined;
      if (!get().cookieImportPrivateActions.domainAllowed(cookie.domain)) return undefined;
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
    },
    async cookiesRead(connection, preferredTargetUrl, parsers) {
      const targets = parsers.targets(
        await connection.request("Target.getTargets"),
      );
      const target = targets.targetInfos.find(value => (
        value.type === "page" && value.url === preferredTargetUrl
      )) ?? targets.targetInfos.find(value => value.type === "page");
      if (!target) throw new Error("所选浏览器没有可用于读取登录态的页面");
      const attached = parsers.attached(
        await connection.request("Target.attachToTarget", {
          flatten: true,
          targetId: target.targetId,
        }),
      );
      try {
        const result = parsers.cookies(
          await connection.request(
            "Network.getCookies",
            { urls: cookieUrls },
            attached.sessionId,
          ),
        );
        const cookies = get().cookieImportPrivateActions.cookiesUniqueRead(
          result.cookies.filter(cookie => (
            get().cookieImportPrivateActions.domainAllowed(cookie.domain)
          )),
        );
        const bytes = cookies.reduce((total, cookie) => total + Buffer.byteLength(
          `${cookie.name}${cookie.value}${cookie.domain}${cookie.path}`,
          "utf8",
        ), 0);
        if (bytes > cookieTextMaxBytes) {
          throw new Error("网页登录态数据超过 2 MiB");
        }
        if (cookies.length === 0) {
          throw new Error("所选浏览器中没有 ChatGPT 登录态");
        }
        return cookies;
      } finally {
        await connection.request("Target.detachFromTarget", {
          sessionId: attached.sessionId,
        }).catch(() => undefined);
      }
    },
    cookiesUniqueRead(cookies) {
      const unique = new Map<string, BrowserCookie>();
      for (const cookie of cookies) {
        const key = JSON.stringify([
          cookie.name,
          cookie.domain.replace(/^\./, "").toLowerCase(),
          cookie.path.startsWith("/") ? cookie.path : "/",
        ]);
        const current = unique.get(key);
        if (!current || (!current.secure && cookie.secure)) unique.set(key, cookie);
      }
      return [...unique.values()].sort((left, right) => (
        Number(left.secure) - Number(right.secure)
      ));
    },
    domainAllowed(domain) {
      const normalized = domain.replace(/^\./, "").toLowerCase();
      return allowedCookieDomains.some(allowed => (
        normalized === allowed || normalized.endsWith(`.${allowed}`)
      ));
    },
    stateSend() {
      get().webContents?.send(
        cookieImport.channel,
        cookieImport.cookieImportValidator.parse(get().cookieImport),
      );
    },
    wait(milliseconds, signal) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, milliseconds);
        const abort = (): void => {
          clearTimeout(timeout);
          reject(get().cookieImportPrivateActions.canceledError());
        };
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    },
  },
  };
};

export {
  type BrowserApplications,
  cookieImport,
  type CookieImport,
  type CookieImportCreateInput,
  type CookieImportSlice,
  type nodeState_t,
};
export default cookieImportStore;
