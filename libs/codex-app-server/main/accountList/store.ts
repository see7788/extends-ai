import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";
import { globalSettings, type GlobalSettingsSlice } from "../globalSettings/store.ts";
import { account, type AccountSlice } from "./account/store.ts";
import { accounts, type AccountsSlice } from "./accounts/store.ts";
import { authSessions, type AuthSessionsSlice } from "./authSessions/store.ts";
import type { ConnectionSlice } from "./connection/store.ts";
import { rateLimits, type RateLimitsSlice } from "./rateLimits/store.ts";
import type { SchedulerSlice } from "./scheduler/store.ts";
import { usage, type UsageSlice } from "./usage/store.ts";

type nodeState_t = {
  appHome: string;
  appUserData: string;
  electron: {
    BrowserWindow: Pick<typeof import("electron").BrowserWindow, "fromWebContents">;
    dialog: Pick<typeof import("electron").dialog, "showOpenDialog">;
  };
  fileSystem: Pick<typeof import("node:fs/promises"), "cp" | "mkdir" | "stat">;
  path: Pick<typeof import("node:path"), "dirname" | "join">;
  webContents?: WebContents;
};
type ProducerSlices = AccountSlice
  & AccountsSlice
  & AuthSessionsSlice
  & ConnectionSlice
  & GlobalSettingsSlice
  & RateLimitsSlice
  & SchedulerSlice
  & UsageSlice;
type AccountListSlice = {
  accountListActions: {
    accountDelete(input: unknown): Promise<void>;
    authSessionsRead(input: unknown): Promise<void>;
    codexHomeDefaultRestore(): Promise<void>;
    codexHomeSelect(): Promise<void>;
    communicationStart(): () => void;
    enabledSet(input: unknown): Promise<void>;
    initialize(): Promise<void>;
    pause(): Promise<void>;
    rateLimitsRead(input: unknown): Promise<void>;
    refresh(): Promise<void>;
    resume(): void;
    runNow(): Promise<void>;
    start(): void;
    stop(): void;
    usageRead(input: unknown): Promise<void>;
  };
};

const request = {
  accountDelete: z.object({ input: accounts.input.accountDelete, method: z.literal("accountDelete") }),
  authSessionsRead: z.object({ input: authSessions.input.command, method: z.literal("authSessionsRead") }),
  codexHomeDefaultRestore: z.object({ method: z.literal("codexHomeDefaultRestore") }),
  codexHomeSelect: z.object({ method: z.literal("codexHomeSelect") }),
  enabledSet: z.object({ input: account.input.enabledSet, method: z.literal("enabledSet") }),
  rateLimitsRead: z.object({ input: rateLimits.input.command, method: z.literal("rateLimitsRead") }),
  runNow: z.object({ method: z.literal("runNow") }),
  usageRead: z.object({ input: usage.input.command, method: z.literal("usageRead") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.accountDelete,
  request.authSessionsRead,
  request.codexHomeDefaultRestore,
  request.codexHomeSelect,
  request.enabledSet,
  request.rateLimitsRead,
  request.runNow,
  request.usageRead,
]);
const result = { command: z.object({ ok: z.literal(true) }) };
const accountList = {
  channel: "accountList",
  request,
  requestValidator,
  result,
} as const;

const accountListStore: ImmerStateCreator<
  AccountListSlice,
  ProducerSlices & nodeState_t
> = (_set, get, api) => {
  let refreshing: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeSettings: (() => void) | undefined;
  const errorText = (error: unknown): string => error instanceof Error
    ? error.message
    : String(error);
  const authFileRead = (accountId: string): string => get().path.join(
    get().appUserData,
    "codex-account-auth",
    accountId,
    "auth.json",
  );
  const pathExists = async (value: string): Promise<boolean> => {
    try {
      await get().fileSystem.stat(value);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  const authFileCopy = async (source: string, target: string): Promise<void> => {
    await get().fileSystem.mkdir(get().path.dirname(target), { recursive: true });
    await get().fileSystem.cp(source, target, { force: true });
  };
  const timerClear = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (): void => {
    timerClear();
    const settings = get().globalSettings;
    if (!settings.maintenanceEnabled) return;
    const state = get().scheduler;
    const retry = Boolean(state.error)
      && state.consecutiveFailures <= settings.maintenanceRetryCount;
    const delay = retry
      ? settings.maintenanceRetryIntervalMinutes * 60_000
      : settings.maintenanceIntervalHours * 3_600_000;
    const lastRunAt = state.lastRunAt ? Date.parse(state.lastRunAt) : Number.NaN;
    const nextRunAt = Number.isFinite(lastRunAt)
      ? Math.max(Date.now(), lastRunAt + delay)
      : Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      void get().accountListActions.refresh().finally(schedule);
    }, Math.min(Math.max(0, nextRunAt - Date.now()), 2_147_000_000));
  };
  const schedulingStart = (): void => {
    unsubscribeSettings?.();
    unsubscribeSettings = api.subscribe((state, previous) => {
      if (state.globalSettings !== previous.globalSettings) schedule();
    });
    schedule();
  };
  const schedulingStop = (): void => {
    timerClear();
    unsubscribeSettings?.();
    unsubscribeSettings = undefined;
  };
  const queryStateClear = (): void => {
    for (const accountId of Object.keys(get().authSessions.byAccountId)) {
      get().authSessionsActions.accountDelete({ accountId });
    }
    for (const accountId of Object.keys(get().rateLimits.byAccountId)) {
      get().rateLimitsActions.accountDelete({ accountId });
    }
    for (const accountId of Object.keys(get().usage.byAccountId)) {
      get().usageActions.accountDelete({ accountId });
    }
  };
  const dataMissing = (): boolean => get().accounts.order.some(accountId => (
    Boolean(get().account[accountId])
    && (
      !get().authSessions.byAccountId[accountId]
      || !get().rateLimits.byAccountId[accountId]
      || !get().usage.byAccountId[accountId]
    )
  ));

  return {
    accountListActions: {
      async accountDelete(input) {
        const value = accounts.input.accountDelete.parse(input);
        const current = get().account[value.accountId];
        if (current?.enabled) {
          const replacement = get().accounts.order.find(
            accountId => accountId !== value.accountId && get().account[accountId],
          );
          if (replacement) {
            await get().accountListActions.enabledSet({
              accountId: replacement,
              enabled: true,
            });
          }
        }
        get().accountsActions.accountDelete(value);
        get().accountActions.accountDelete(value);
        get().authSessionsActions.accountDelete(value);
        get().rateLimitsActions.accountDelete(value);
        get().usageActions.accountDelete(value);
      },
      async authSessionsRead(input) {
        const value = authSessions.input.command.parse(input);
        const account = get().account[value.accountId];
        if (!account) throw new Error(`账号不存在：${value.accountId}`);
        get().authSessionsActions.loadingSet(value);
        try {
          const result = await get().connectionActions.request({
            accountId: value.accountId,
            authFile: authFileRead(value.accountId),
            materializedCodexHome: account.enabled
              ? get().globalSettings.codexHome ?? undefined
              : undefined,
            method: "account/read",
            params: { refreshToken: false },
            resultValidator: authSessions.accountReadResultValidator,
          });
          get().authSessionsActions.resultSet({
            accountId: value.accountId,
            checkedAt: new Date().toISOString(),
            result,
          });
        } catch (error) {
          get().authSessionsActions.errorSet({
            accountId: value.accountId,
            checkedAt: new Date().toISOString(),
            error: errorText(error),
          });
          throw error;
        }
      },
      async codexHomeDefaultRestore() {
        await get().accountListActions.pause();
        try {
          await get().globalSettingsActions.codexHomeMove({
            codexHome: get().path.join(get().appHome, ".codex"),
          });
        } finally {
          get().accountListActions.resume();
        }
      },
      async codexHomeSelect() {
        const contents = get().webContents;
        if (!contents || contents.isDestroyed()) {
          throw new Error("CodexAppServer WebContents 不可用");
        }
        const parent = get().electron.BrowserWindow.fromWebContents(contents);
        if (!parent) throw new Error("无法取得账号管理窗口");
        const selected = await get().electron.dialog.showOpenDialog(parent, {
          buttonLabel: "选择",
          defaultPath: get().globalSettings.codexHome ?? undefined,
          properties: ["openDirectory", "createDirectory"],
          title: "选择 CODEX_HOME",
        });
        const codexHome = selected.filePaths[0];
        if (selected.canceled || !codexHome) return;
        await get().accountListActions.pause();
        try {
          await get().globalSettingsActions.codexHomeMove({ codexHome });
        } finally {
          get().accountListActions.resume();
        }
      },
      communicationStart() {
        const contents = get().webContents;
        if (!contents || contents.isDestroyed()) {
          throw new Error("CodexAppServer WebContents 不可用");
        }
        contents.ipc.handle(accountList.channel, async (_event, input: unknown) => {
          const requestValue = accountList.requestValidator.parse(input);
          switch (requestValue.method) {
          case "accountDelete":
            await get().accountListActions.accountDelete(requestValue.input);
            break;
          case "authSessionsRead":
            await get().accountListActions.authSessionsRead(requestValue.input);
            break;
          case "codexHomeDefaultRestore":
            await get().accountListActions.codexHomeDefaultRestore();
            break;
          case "codexHomeSelect":
            await get().accountListActions.codexHomeSelect();
            break;
          case "enabledSet":
            await get().accountListActions.enabledSet(requestValue.input);
            break;
          case "rateLimitsRead":
            await get().accountListActions.rateLimitsRead(requestValue.input);
            break;
          case "runNow":
            await get().accountListActions.runNow();
            break;
          case "usageRead":
            await get().accountListActions.usageRead(requestValue.input);
            break;
          }
          return accountList.result.command.parse({ ok: true });
        });
        return () => contents.ipc.removeHandler(accountList.channel);
      },
      async enabledSet(input) {
        const value = account.input.enabledSet.parse(input);
        if (!value.enabled) return;
        const selected = get().account[value.accountId];
        if (!selected) throw new Error(`账号不存在：${value.accountId}`);
        const codexHome = get().globalSettings.codexHome;
        if (!codexHome) throw new Error("请先配置 CODEX_HOME");
        const materializedAuth = get().path.join(codexHome, "auth.json");
        const current = Object.values(get().account).find(item => item.enabled);
        if (
          current
          && current.id !== value.accountId
          && await pathExists(materializedAuth)
        ) {
          await authFileCopy(materializedAuth, authFileRead(current.id));
        }
        await authFileCopy(authFileRead(value.accountId), materializedAuth);
        get().accountActions.enabledSet(value);
      },
      async initialize() {
        get().accountActions.normalize();
        const enabled = Object.values(get().account).find(value => value.enabled);
        const codexHome = get().globalSettings.codexHome;
        if (!enabled || !codexHome) return;
        const materializedAuth = get().path.join(codexHome, "auth.json");
        const backupAuth = authFileRead(enabled.id);
        if (!await pathExists(materializedAuth) && await pathExists(backupAuth)) {
          await authFileCopy(backupAuth, materializedAuth);
        }
      },
      async rateLimitsRead(input) {
        const value = rateLimits.input.command.parse(input);
        const account = get().account[value.accountId];
        if (!account) throw new Error(`账号不存在：${value.accountId}`);
        get().rateLimitsActions.loadingSet(value);
        try {
          const result = await get().connectionActions.request({
            accountId: value.accountId,
            authFile: authFileRead(value.accountId),
            materializedCodexHome: account.enabled
              ? get().globalSettings.codexHome ?? undefined
              : undefined,
            method: "account/rateLimits/read",
            resultValidator: rateLimits.resultValidator,
          });
          get().rateLimitsActions.resultSet({
            accountId: value.accountId,
            result,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          get().rateLimitsActions.errorSet({
            accountId: value.accountId,
            error: errorText(error),
          });
          throw error;
        }
      },
      refresh() {
        if (refreshing) return refreshing;
        refreshing = (async () => {
          get().schedulerActions.runStart();
          let refreshError: string | null = null;
          for (const accountId of get().accounts.order) {
            if (!get().account[accountId]) continue;
            if (get().authSessions.byAccountId[accountId]?.status === "requiresLogin") {
              continue;
            }
            try {
              await get().accountListActions.authSessionsRead({ accountId });
              await get().accountListActions.rateLimitsRead({ accountId });
              await get().accountListActions.usageRead({ accountId });
            } catch (error) {
              refreshError ??= errorText(error);
            }
          }
          get().schedulerActions.runFinish({
            error: refreshError,
            lastRunAt: new Date().toISOString(),
          });
        })().finally(() => {
          refreshing = undefined;
        });
        return refreshing;
      },
      async pause() {
        schedulingStop();
        await refreshing;
      },
      resume() {
        schedulingStart();
      },
      async runNow() {
        timerClear();
        try {
          await get().accountListActions.refresh();
        } finally {
          schedule();
        }
      },
      start() {
        queryStateClear();
        get().schedulerActions.normalize();
        schedulingStart();
        if (dataMissing()) void get().accountListActions.refresh();
      },
      stop() {
        schedulingStop();
      },
      async usageRead(input) {
        const value = usage.input.command.parse(input);
        const account = get().account[value.accountId];
        if (!account) throw new Error(`账号不存在：${value.accountId}`);
        get().usageActions.loadingSet(value);
        try {
          const result = await get().connectionActions.request({
            accountId: value.accountId,
            authFile: authFileRead(value.accountId),
            materializedCodexHome: account.enabled
              ? get().globalSettings.codexHome ?? undefined
              : undefined,
            method: "account/usage/read",
            resultValidator: usage.resultValidator,
          });
          get().usageActions.resultSet({
            accountId: value.accountId,
            result,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          get().usageActions.errorSet({
            accountId: value.accountId,
            error: errorText(error),
          });
          throw error;
        }
      },
    },
  };
};

export { accountList, type AccountListSlice, type nodeState_t };
export default accountListStore;
