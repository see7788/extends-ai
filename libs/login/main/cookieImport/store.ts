import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import type { BrowserSlice } from "browser-partition-main/browser/store.ts";
import { z } from "zod";
import {
  connect,
  partitionClear,
  webAccessCreate,
} from "./process.ts";
import {
  authorizationStartValidator,
  authorizationTimeoutSecondsSetValidator,
  candidateClearValidator,
  cookieImport,
  createValidator,
  operationFailValidator,
} from "./public.ts";

type CookieImport = z.infer<typeof cookieImport.cookieImportValidator>;
type BrowserImport = {
  browserName: string;
  dispose(): Promise<void>;
  webAccessCreate(): Promise<string>;
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
    }): Promise<z.infer<typeof cookieImport.candidateValidator>>;
    dispose(): void;
    install(): () => void;
    importOpen(
      browserId: string,
      signal: AbortSignal,
      authorizationTimeoutMs: number,
    ): Promise<BrowserImport>;
    historyRemove(input: z.infer<typeof createValidator>): string | undefined;
    operationCancel(): void;
    operationFail(input: z.infer<typeof operationFailValidator>): void;
    operationStart(input: z.infer<typeof createValidator>): void;
    operationSucceed(input: z.infer<typeof cookieImport.candidateValidator>): void;
    start(browserId: string): Promise<boolean>;
  };
};

let active: AbortController | undefined;


const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);


const cookieImportStore: ImmerStateCreator<
  CookieImportSlice,
  { webContents?: WebContents } & BrowserSlice
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    cookieImport.channel,
    cookieImport.cookieImportValidator.parse(get().cookieImport),
  );
  return ({
  cookieImport: structuredClone(cookieImport.initial),
  cookieImportActions: {
    async create(input) {
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
        );
      } finally {
        get().cookieImportActions.authorizationFinish();
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
        if (partition) {
          await partitionClear(partition).catch(() => undefined);
        }
      }
    },
    async importOpen(browserId, signal, authorizationTimeoutMs) {
      const input = createValidator.parse({ browserId });
      const application = await get().browserActions.applicationRead(input);
      const debug = await get().browserActions.remoteDebugRead(
        application.executablePath,
        application.launchArguments,
      );
      const connected = await connect(
        application.executablePath,
        application.launchArguments,
        debug,
        signal,
        authorizationTimeoutMs,
        get().browserActions.windowOpen,
        input => cookieImport.devToolsMessageValidator.parse(input),
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
          {
            attached: input => cookieImport.devToolsAttachedValidator.parse(input),
            cookies: input => cookieImport.cookiesValidator.parse(input),
            message: input => cookieImport.devToolsMessageValidator.parse(input),
            targets: input => cookieImport.devToolsTargetsValidator.parse(input),
          },
        ),
      };
    },
    authorizationFinish() {
      set(state => {
        state.cookieImport.authorizationExpiresAt = null;
      });
      stateSend();
    },
    authorizationStart(input) {
      const value = authorizationStartValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationExpiresAt = value.expiresAt;
      });
      stateSend();
    },
    authorizationTimeoutSecondsSet(input) {
      const value = authorizationTimeoutSecondsSetValidator.parse(input);
      set(state => {
        state.cookieImport.authorizationTimeoutSeconds = value.authorizationTimeoutSeconds;
      });
      stateSend();
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
      stateSend();
      return cleared;
    },
    historyRemove(input) {
      const { browserId } = createValidator.parse(input);
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
      stateSend();
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
    install() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) {
        throw new Error("Login WebContents 不可用");
      }
      contents.ipc.handle(cookieImport.channel, async (_event, input: unknown) => {
        const request = cookieImport.requestValidator.parse(input);
        switch (request.method) {
        case "authorizationTimeoutSecondsSet":
          get().cookieImportActions.authorizationTimeoutSecondsSet(
            request.input,
          );
          return cookieImport.result.setting.parse({ updated: true });
        case "cancel":
          return cookieImport.result.cancel.parse({
            canceled: get().cookieImportActions.cancel(),
          });
        case "start":
          return cookieImport.result.start.parse({
            completed: await get().cookieImportActions.start(request.input.browserId),
          });
        case "stateRead":
          return cookieImport.cookieImportValidator.parse(get().cookieImport);
        }
      });
      return () => {
        get().cookieImportActions.dispose();
        contents.ipc.removeHandler(cookieImport.channel);
      };
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
      stateSend();
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
      stateSend();
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
      stateSend();
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
      stateSend();
    },
    async start(browserId) {
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
            await partitionClear(previousPartition).catch(() => undefined);
          }
          const candidate = await actions.create({
            authorizationTimeoutSeconds: get().cookieImport.authorizationTimeoutSeconds,
            browserId: input.browserId,
            signal: controller.signal,
          });
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
};

export { cookieImport };
export default cookieImportStore;
