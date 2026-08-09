import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  ipcMain,
  session,
  type CookiesSetDetails,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import browserIndex from "browser-partition-main/browser/index.ts";
import store from "../store.ts";
import { cookieImport } from "./store.ts";

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
const endpointRead = async (activePortPath: string): Promise<string | undefined> => {
  let text: string;
  try {
    const value = await stat(activePortPath);
    if (!value.isFile() || value.size > 4096) {
      throw new Error("浏览器 DevToolsActivePort 文件无效");
    }
    text = await readFile(activePortPath, "utf8");
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
  debug: ReturnType<typeof browserIndex.remoteDebugRead>,
  signal: AbortSignal,
  authorizationTimeoutMs: number,
): Promise<{
  connection: DevToolsConnection;
  windowClose?: () => Promise<boolean>;
}> => {
  const deadline = Date.now() + authorizationTimeoutMs;
  try {
    const endpoint = await endpointRead(debug.devToolsActivePortPath);
    if (endpoint) {
      return {
        connection: await DevToolsConnection.open(endpoint, signal, deadline - Date.now()),
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
  }
  const openedWindow = await browserIndex.windowOpen(
    executablePath,
    debug.inspectUrl,
    launchArguments,
  );
  try {
    while (Date.now() < deadline) {
      canceledAssert(signal);
      try {
        const endpoint = await endpointRead(debug.devToolsActivePortPath);
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
) => {
  canceledAssert(signal);
  const partition = `persist:login.cookie-import.${browserId}.${randomUUID()}`;
  const targetSession = session.fromPartition(partition);
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

const cookieImportIndex = {
  async start(browserId: string): Promise<boolean> {
    const input = cookieImport.input.create.parse({ browserId });
    if (store.getState().cookieImport.status === "ready") {
      throw new Error("已有待识别的浏览器登录态");
    }
    const result = await store.getState().cookieImportActions.run(async signal => {
      const actions = store.getState().cookieImportActions;
      actions.operationStart(input);
      try {
        const candidate = await cookieImportIndex.create({
          authorizationTimeoutSeconds: store.getState().cookieImport.authorizationTimeoutSeconds,
          browserId: input.browserId,
          signal,
        });
        actions.operationSucceed(candidate);
        return true;
      } catch (error) {
        if (canceled(error)) actions.operationCancel();
        else actions.operationFail({ error: errorText(error) });
        throw error;
      }
    });
    return result ?? false;
  },
  async importOpen(
    browserId: string,
    signal: AbortSignal,
    authorizationTimeoutMs: number,
  ) {
    const input = cookieImport.input.create.parse({ browserId });
    const application = await browserIndex.applicationRead(input);
    const debug = browserIndex.remoteDebugRead(
      application.executablePath,
      application.launchArguments,
    );
    const connected = await connect(
      application.executablePath,
      application.launchArguments,
      debug,
      signal,
      authorizationTimeoutMs,
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
      ),
    };
  },
  async create(input: {
    authorizationTimeoutSeconds: number;
    browserId: string;
    signal: AbortSignal;
  }) {
    const authorizationTimeoutMs = input.authorizationTimeoutSeconds * 1_000;
    let browserImport: Awaited<ReturnType<typeof cookieImportIndex.importOpen>> | undefined;
    let partition: string | undefined;
    store.getState().cookieImportActions.authorizationStart({
      expiresAt: new Date(Date.now() + authorizationTimeoutMs).toISOString(),
    });
    try {
      browserImport = await cookieImportIndex.importOpen(
        input.browserId,
        input.signal,
        authorizationTimeoutMs,
      );
    } finally {
      store.getState().cookieImportActions.authorizationFinish();
    }
    try {
      partition = await browserImport.webAccessCreate();
      const result = cookieImport.candidateValidator.parse({
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
      if (partition) await session.fromPartition(partition).clearData().catch(() => undefined);
    }
  },
  install(): () => void {
    const renderers = new Set<WebContents>();
    const rendererSet = (event: IpcMainInvokeEvent): void => {
      renderers.add(event.sender);
    };
    const send = (channel: string, value: unknown): void => {
      for (const renderer of renderers) {
        if (renderer.isDestroyed()) renderers.delete(renderer);
        else renderer.send(channel, value);
      }
    };
    ipcMain.handle(
      cookieImport.channel.authorizationTimeoutSecondsSet,
      (event, input: unknown) => {
        rendererSet(event);
        store.getState().cookieImportActions.authorizationTimeoutSecondsSet(
          cookieImport.input.authorizationTimeoutSecondsSet.parse(input),
        );
        return cookieImport.result.setting.parse({ updated: true });
      },
    );
    ipcMain.handle(cookieImport.channel.cancel, (event, input: unknown) => {
      rendererSet(event);
      cookieImport.input.command.parse(input);
      return cookieImport.result.cancel.parse({
        canceled: store.getState().cookieImportActions.cancel(),
      });
    });
    ipcMain.handle(cookieImport.channel.start, async (event, input: unknown) => {
      rendererSet(event);
      const value = cookieImport.input.create.parse(input);
      return cookieImport.result.start.parse({
        completed: await cookieImportIndex.start(value.browserId),
      });
    });
    ipcMain.handle(cookieImport.channel.stateRead, event => {
      rendererSet(event);
      return cookieImport.cookieImportValidator.parse(store.getState().cookieImport);
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.cookieImport !== previous.cookieImport) {
        send(
          cookieImport.channel.stateUpdated,
          cookieImport.cookieImportValidator.parse(state.cookieImport),
        );
      }
    });
    return () => {
      store.getState().cookieImportActions.dispose();
      unsubscribe();
      renderers.clear();
      ipcMain.removeHandler(cookieImport.channel.authorizationTimeoutSecondsSet);
      ipcMain.removeHandler(cookieImport.channel.cancel);
      ipcMain.removeHandler(cookieImport.channel.start);
      ipcMain.removeHandler(cookieImport.channel.stateRead);
    };
  },
};

export default cookieImportIndex;
