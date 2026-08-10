import { session, type CookiesSetDetails } from "electron";
import type { BrowserSlice } from "browser-partition-main/browser/store.ts";
import { readFile, stat } from "node:fs/promises";

type DevToolsMessage = {
  error?: { message: string };
  id?: number;
  result?: unknown;
};
type DevToolsTargets = {
  targetInfos: Array<{ targetId: string; type: string; url: string }>;
};
type DevToolsAttached = { sessionId: string };
type BrowserCookie = {
  domain: string;
  expires: number;
  httpOnly: boolean;
  name: string;
  partitionKey?: unknown;
  path: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure: boolean;
  session: boolean;
  value: string;
};
type CookieParsers = {
  attached(input: unknown): DevToolsAttached;
  cookies(input: unknown): { cookies: BrowserCookie[] };
  message(input: unknown): DevToolsMessage;
  targets(input: unknown): DevToolsTargets;
};
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
          resolve(new DevToolsConnection(socket, signal, messageParse));
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

const connect = async (
  executablePath: string,
  launchArguments: string[],
  debug: Awaited<ReturnType<BrowserSlice["browserActions"]["remoteDebugRead"]>>,
  signal: AbortSignal,
  authorizationTimeoutMs: number,
  windowOpen: BrowserSlice["browserActions"]["windowOpen"],
  messageParse: CookieParsers["message"],
): Promise<{
  connection: DevToolsConnection;
  windowClose?: () => Promise<boolean>;
}> => {
  const deadline = Date.now() + authorizationTimeoutMs;
  try {
    const endpoint = await endpointRead(debug.devToolsActivePortPath);
    if (endpoint) {
      return {
        connection: await DevToolsConnection.open(
          endpoint,
          signal,
          deadline - Date.now(),
          messageParse,
        ),
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
  }
  const openedWindow = await windowOpen(
    executablePath,
    debug.inspectUrl,
    launchArguments,
    signal,
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
              messageParse,
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
  parsers: CookieParsers,
) => {
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
  cookie: BrowserCookie,
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
  parsers: CookieParsers,
) => {
  canceledAssert(signal);
  const partition = `persist:login.cookie-import.${browserId}.${crypto.randomUUID()}`;
  const targetSession = session.fromPartition(partition);
  try {
    await targetSession.clearData();
    const cookies = await cookiesRead(connection, preferredTargetUrl, parsers);
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

const partitionClear = async (partition: string): Promise<void> => {
  await session.fromPartition(partition).clearData();
};

export { connect, partitionClear, webAccessCreate };
