import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { accounts } from "./accounts/store.ts";
import { cookieImport } from "./cookieImport/store.ts";
import { login } from "./login/store.ts";
import store from "./store/index.ts";

const preloadPath = () => join(
  app.getAppPath(),
  "out",
  "preload",
  "browser-partition-preload.cjs",
);

const accountsInstall = (): (() => void) => {
  const contents = store.getState().loginWindow?.webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("Login WebContents 不可用");
  }

  contents.ipc.handle(accounts.channel, async (_event, input: unknown) => {
    const request = accounts.requestValidator.parse(input);
    switch (request.method) {
    case "cookieImportConsume": {
      const candidate = store.getState().cookieImport.candidate;
      if (store.getState().cookieImport.status !== "ready" || !candidate) {
        throw new Error("没有待识别的浏览器登录态");
      }
      const value = await store.getState().accountsActions.candidateConsume({
        partition: candidate.partition,
        source: {
          browserId: candidate.browserId,
          browserName: candidate.browserName,
        },
      });
      store.getState().cookieImportActions.candidateClear({
        partition: candidate.partition,
      });
      return accounts.result.account.parse({ account: value });
    }
    case "open":
      return accounts.result.command.parse({
        completed: await store.getState().accountsActions.open(request.input),
      });
    case "remove": {
      const sources = store.getState().accounts.byEmail[request.input.email]?.sources ?? [];
      const completed = await store.getState().accountsActions.remove(request.input);
      if (completed) {
        for (const source of sources) {
          await store.getState().cookieImportActions.historyRemove({
            browserId: source.browserId,
          });
        }
      }
      return accounts.result.command.parse({ completed });
    }
    case "stateRead":
      return accounts.accountsValidator.parse(store.getState().accounts);
    case "validate":
      return accounts.result.command.parse({
        completed: await store.getState().accountsActions.validate(request.input),
      });
    }
  });

  return () => {
    store.getState().accountsActions.dispose();
    contents.ipc.removeHandler(accounts.channel);
  };
};

const loginInstall = (): (() => void) => {
  const contents = store.getState().loginWindow?.webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("Login WebContents 不可用");
  }

  contents.ipc.handle(login.channel, async (_event, input: unknown) => {
    const request = login.requestValidator.parse(input);
    switch (request.method) {
    case "cancel":
      return login.result.cancel.parse({
        canceled: store.getState().loginActions.cancel(),
      });
    case "start":
      try {
        const candidate = await store.getState().loginActions.create();
        if (!await store.getState().accountsActions.loginIdentify(candidate.partition)) {
          throw new Error("未检测到有效的 ChatGPT 登录态");
        }
        return login.result.start.parse({ completed: true });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return login.result.start.parse({ completed: false });
        }
        throw error;
      }
    case "stateRead":
      return login.loginValidator.parse(store.getState().login);
    }
  });

  return () => {
    store.getState().loginActions.cancel();
    contents.ipc.removeHandler(login.channel);
  };
};

const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);

const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);

const cookieImportInstall = (): (() => void) => {
  const contents = store.getState().loginWindow?.webContents;
  if (!contents || contents.isDestroyed()) {
    throw new Error("Login WebContents 不可用");
  }

  let active: AbortController | undefined;

  const cancel = (): boolean => {
    if (!active || active.signal.aborted) return false;
    active.abort();
    store.getState().cookieImportActions.operationCancel();
    return true;
  };

  const start = async (browserId: string): Promise<boolean> => {
    if (active) throw new Error("已有 Cookie 导入操作正在进行");
    const input = cookieImport.input.create.parse({ browserId });
    const controller = new AbortController();
    active = controller;

    let connection: Awaited<ReturnType<
      ReturnType<typeof store.getState>["cookieImportActions"]["connectionOpen"]
    >> | undefined;
    let openedWindow: Awaited<ReturnType<
      ReturnType<typeof store.getState>["browserActions"]["windowOpen"]
    >> | undefined;
    let partition: string | undefined;

    try {
      const state = store.getState();
      const actions = state.cookieImportActions;
      const browserActions = state.browserActions;
      const previousPartition = state.cookieImport.status === "ready"
        ? state.cookieImport.candidate?.partition
        : undefined;

      if (previousPartition) {
        actions.candidateClear({ partition: previousPartition });
        await actions.partitionClear(previousPartition).catch(() => undefined);
      }
      actions.operationStart(input);

      const application = await browserActions.applicationRead(input);
      const debug = await browserActions.remoteDebugRead(
        application.executablePath,
        application.launchArguments,
      );
      const authorizationTimeoutMs = state.cookieImport.authorizationTimeoutSeconds * 1_000;
      const deadline = Date.now() + authorizationTimeoutMs;
      actions.authorizationStart({ expiresAt: new Date(deadline).toISOString() });

      let endpoint: string | undefined;
      try {
        try {
          endpoint = await actions.endpointRead(debug.devToolsActivePortPath);
        } catch (error) {
          if (canceled(error)) throw error;
        }
        if (!endpoint) {
          openedWindow = await browserActions.windowOpen(
            application.executablePath,
            debug.inspectUrl,
            application.launchArguments,
            controller.signal,
          );
          endpoint = await actions.endpointWait({
            activePortPath: debug.devToolsActivePortPath,
            signal: controller.signal,
            timeoutMs: Math.max(1, deadline - Date.now()),
          });
        }
        connection = await actions.connectionOpen({
          endpoint,
          signal: controller.signal,
          timeoutMs: Math.max(1, deadline - Date.now()),
        });
      } finally {
        actions.authorizationFinish();
      }

      partition = await actions.webAccessCreate({
        browserId: input.browserId,
        connection,
        preferredTargetUrl: debug.inspectUrl,
        signal: controller.signal,
      });
      const candidate = cookieImport.candidateValidator.parse({
        browserId: input.browserId,
        browserName: application.name,
        partition,
      });
      connection.dispose();
      connection = undefined;
      await openedWindow?.close().catch(() => false);
      openedWindow = undefined;
      partition = undefined;
      actions.operationSucceed(candidate);
      return true;
    } catch (error) {
      connection?.dispose();
      await openedWindow?.close().catch(() => false);
      if (partition) {
        await store.getState().cookieImportActions.partitionClear(partition)
          .catch(() => undefined);
      }
      if (canceled(error)) {
        store.getState().cookieImportActions.operationCancel();
        return false;
      }
      store.getState().cookieImportActions.operationFail({ error: errorText(error) });
      throw error;
    } finally {
      if (active === controller) active = undefined;
    }
  };

  contents.ipc.handle(cookieImport.channel, async (_event, input: unknown) => {
    const request = cookieImport.requestValidator.parse(input);
    switch (request.method) {
    case "applicationsRead":
      return cookieImport.result.applicationsRead.parse(
        await store.getState().browserActions.applicationsRead(),
      );
    case "authorizationTimeoutSecondsSet":
      store.getState().cookieImportActions.authorizationTimeoutSecondsSet(request.input);
      return cookieImport.result.setting.parse({ updated: true });
    case "cancel":
      return cookieImport.result.cancel.parse({ canceled: cancel() });
    case "start":
      return cookieImport.result.start.parse({
        completed: await start(request.input.browserId),
      });
    case "stateRead":
      return cookieImport.cookieImportValidator.parse(store.getState().cookieImport);
    }
  });

  return () => {
    cancel();
    contents.ipc.removeHandler(cookieImport.channel);
  };
};

class Login {
  private disposed = false;
  private readonly disposeCommunication: Array<() => void>;
  private readonly ready: Promise<void>;
  private readonly window: BrowserWindow;

  constructor() {
    this.window = new BrowserWindow({
      autoHideMenuBar: true,
      width: 760,
      height: 620,
      minWidth: 620,
      minHeight: 460,
      show: false,
      title: "ChatGPT 登录态",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:login",
        preload: preloadPath(),
        sandbox: true,
      },
    });
    store.setState({
      loginWindow: this.window,
      webContents: this.window.webContents,
    });
    this.disposeCommunication = [
      accountsInstall(),
      loginInstall(),
      cookieImportInstall(),
    ];
    this.ready = this.rendererLoad();
    this.window.on("close", event => {
      if (this.disposed) return;
      event.preventDefault();
      this.window.hide();
    });
  }

  async show(): Promise<void> {
    if (this.disposed) throw new Error("Login 已释放");
    await this.ready;
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const run of this.disposeCommunication.reverse()) run();
    store.setState({ loginWindow: undefined, webContents: undefined });
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  private rendererLoad(): Promise<void> {
    const rendererUrl = store.getState().electronRendererUrl;
    if (rendererUrl) {
      return this.window.loadURL(new URL(
        "login-renderer/",
        rendererUrl,
      ).toString());
    }
    return this.window.loadFile(join(
      app.getAppPath(),
      "out",
      "renderer",
      "login-renderer",
      "index.html",
    ));
  }

}

export default Login;
