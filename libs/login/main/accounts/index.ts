import {
  BrowserWindow as ElectronBrowserWindow,
  ipcMain,
  session,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import store from "../store.ts";
import { accounts } from "./store.ts";

const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);
const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const parentRead = (event: IpcMainInvokeEvent): ElectronBrowserWindow => {
  const parent = ElectronBrowserWindow.fromWebContents(event.sender);
  if (!parent) throw new Error("无法取得 Login 父窗口");
  return parent;
};

type Verification = {
  checkedAt: string;
  email: string | null;
  error: string | null;
  status: "valid" | "expired" | "unknown";
};

const verificationRead = async (
  partition: string,
  signal?: AbortSignal,
): Promise<Verification> => {
  const checkedAt = new Date().toISOString();
  try {
    const response = await session.fromPartition(partition).fetch(
      "https://chatgpt.com/api/auth/session",
      signal ? { signal } : undefined,
    );
    if (response.status === 401 || response.status === 403) {
      return { checkedAt, email: null, error: null, status: "expired" };
    }
    if (!response.ok) {
      return {
        checkedAt,
        email: null,
        error: `ChatGPT 登录态检查失败：${response.status}`,
        status: "unknown",
      };
    }
    const parsed = accounts.accountSessionValidator.safeParse(
      await response.json() as unknown,
    );
    if (!parsed.success) {
      return {
        checkedAt,
        email: null,
        error: "ChatGPT 登录态响应中没有可识别的账号",
        status: "unknown",
      };
    }
    if (!parsed.data.user) {
      return { checkedAt, email: null, error: null, status: "expired" };
    }
    return {
      checkedAt,
      email: parsed.data.user.email,
      error: null,
      status: "valid",
    };
  } catch (error) {
    if (canceled(error)) throw error;
    return {
      checkedAt,
      email: null,
      error: errorText(error),
      status: "unknown",
    };
  }
};

let accountWindow: BrowserPartitionWindow | undefined;
const accountsIndex = {
  async cookieImportConsume() {
    const candidate = store.getState().cookieImport.candidate;
    if (store.getState().cookieImport.status !== "ready" || !candidate) {
      throw new Error("没有待识别的浏览器登录态");
    }
    try {
      return await accountsIndex.candidateConsume({
        partition: candidate.partition,
        source: {
          browserId: candidate.browserId,
          browserName: candidate.browserName,
        },
      });
    } finally {
      store.getState().cookieImportActions.candidateClear({
        partition: candidate.partition,
      });
    }
  },
  async candidateConsume(input: unknown, signal?: AbortSignal) {
    const value = accounts.input.candidate.parse(input);
    try {
      const verification = await verificationRead(value.partition, signal);
      if (verification.status !== "valid" || !verification.email) {
        throw new Error(verification.error ?? "候选分区没有可用的 ChatGPT 登录态");
      }
      const previous = store.getState().accounts.byEmail[verification.email];
      const sources = value.source
        ? [
            ...(previous?.sources.filter(
              source => source.browserId !== value.source?.browserId,
            ) ?? []),
            { ...value.source, importedAt: new Date().toISOString() },
          ]
        : previous?.sources ?? [];
      const account = accounts.accountValidator.parse({
        checkedAt: verification.checkedAt,
        email: verification.email,
        error: null,
        partition: value.partition,
        sources,
        status: "valid",
      });
      const previousPartition = store.getState().accountsActions.accountSet(account);
      if (previousPartition && previousPartition !== account.partition) {
        await BrowserPartitionWindow.storageClear(previousPartition).catch(() => undefined);
      }
      return account;
    } catch (error) {
      await BrowserPartitionWindow.storageClear(value.partition).catch(() => undefined);
      throw error;
    }
  },
  async loginConsume() {
    const candidate = store.getState().login;
    if (candidate.status !== "ready" || !candidate.partition) {
      throw new Error("没有待识别的内嵌登录态");
    }
    try {
      return await accountsIndex.candidateConsume({ partition: candidate.partition });
    } finally {
      store.getState().loginActions.candidateClear({
        partition: candidate.partition,
      });
    }
  },
  install(): () => void {
    const renderers = new Set<WebContents>();
    const rendererSet = (event: IpcMainInvokeEvent): void => {
      renderers.add(event.sender);
    };
    ipcMain.handle(accounts.channel.cookieImportConsume, async (event, input: unknown) => {
      rendererSet(event);
      accounts.input.command.parse(input);
      return accounts.result.account.parse({
        account: await accountsIndex.cookieImportConsume(),
      });
    });
    ipcMain.handle(accounts.channel.loginConsume, async (event, input: unknown) => {
      rendererSet(event);
      accounts.input.command.parse(input);
      return accounts.result.account.parse({
        account: await accountsIndex.loginConsume(),
      });
    });
    ipcMain.handle(accounts.channel.open, async (event, input: unknown) => {
      rendererSet(event);
      const { email } = accounts.input.email.parse(input);
      const account = store.getState().accounts.byEmail[email];
      if (!account) throw new Error("账号不存在");
      accountWindow?.dispose();
      accountWindow = await BrowserPartitionWindow.open({
        height: 760,
        minHeight: 520,
        minWidth: 760,
        onClose: () => {
          accountWindow = undefined;
        },
        parent: parentRead(event),
        partition: account.partition,
        title: email,
        url: "https://chatgpt.com/",
        width: 920,
      });
      return accounts.result.command.parse({ completed: true });
    });
    ipcMain.handle(accounts.channel.remove, async (event, input: unknown) => {
      rendererSet(event);
      const value = accounts.input.email.parse(input);
      const partition = store.getState().accountsActions.accountRemove(value);
      if (partition) {
        accountWindow?.dispose();
        accountWindow = undefined;
        await BrowserPartitionWindow.storageClear(partition);
      }
      return accounts.result.command.parse({ completed: partition !== undefined });
    });
    ipcMain.handle(accounts.channel.validate, async (event, input: unknown) => {
      rendererSet(event);
      const { email } = accounts.input.email.parse(input);
      const account = store.getState().accounts.byEmail[email];
      if (!account) throw new Error("账号不存在");
      const verification = await verificationRead(account.partition);
      const identityChanged = verification.email !== null && verification.email !== email;
      store.getState().accountsActions.accountStatusSet({
        checkedAt: verification.checkedAt,
        email,
        error: identityChanged ? "隔离分区中的账号身份已经变化" : verification.error,
        status: identityChanged ? "unknown" : verification.status,
      });
      return accounts.result.command.parse({ completed: true });
    });
    ipcMain.handle(accounts.channel.stateRead, event => {
      rendererSet(event);
      return accounts.accountsValidator.parse(store.getState().accounts);
    });
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.accounts === previous.accounts) return;
      const value = accounts.accountsValidator.parse(state.accounts);
      for (const renderer of renderers) {
        if (renderer.isDestroyed()) renderers.delete(renderer);
        else renderer.send(accounts.channel.stateUpdated, value);
      }
    });
    return () => {
      accountWindow?.dispose();
      accountWindow = undefined;
      unsubscribe();
      renderers.clear();
      ipcMain.removeHandler(accounts.channel.cookieImportConsume);
      ipcMain.removeHandler(accounts.channel.loginConsume);
      ipcMain.removeHandler(accounts.channel.open);
      ipcMain.removeHandler(accounts.channel.remove);
      ipcMain.removeHandler(accounts.channel.stateRead);
      ipcMain.removeHandler(accounts.channel.validate);
    };
  },
};

export default accountsIndex;
