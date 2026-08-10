import type { BrowserSlice } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";
import { accounts, type Account, type AccountsSlice } from "../accounts/store.ts";
import {
  cookieImport,
  type CookieImportSlice,
} from "../cookieImport/store.ts";
import type { LoginSlice } from "../login/store.ts";

const request = {
  cookieImportCancel: z.object({ method: z.literal("cookieImportCancel") }),
  cookieImportConsume: z.object({ method: z.literal("cookieImportConsume") }),
  cookieImportStart: z.object({
    input: cookieImport.input.create,
    method: z.literal("cookieImportStart"),
  }),
  loginStart: z.object({ method: z.literal("loginStart") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.cookieImportCancel,
  request.cookieImportConsume,
  request.cookieImportStart,
  request.loginStart,
]);
const result = {
  account: z.object({ account: accounts.accountValidator.nullable() }),
  cancel: z.object({ canceled: z.boolean() }),
  command: z.object({ completed: z.boolean() }),
};

type ProducerSlices = AccountsSlice & BrowserSlice & CookieImportSlice & LoginSlice;
type nodeState_t = { webContents?: WebContents };
type AccountAddSlice = {
  accountAddActions: {
    communicationStart(): () => void;
    cookieImportCancel(): boolean;
    cookieImportConsume(): Promise<Account>;
    cookieImportStart(browserId: string): Promise<boolean>;
    dispose(): void;
    loginStart(): Promise<boolean>;
  };
};

const accountAdd = {
  channel: "accountAdd",
  request,
  requestValidator,
  result,
} as const;

const accountAddStore: ImmerStateCreator<
  AccountAddSlice,
  ProducerSlices & nodeState_t
> = (_set, get) => {
  let active: AbortController | undefined;
  const canceled = (error: unknown): boolean => (
    error instanceof Error && error.name === "AbortError"
  );
  const errorText = (error: unknown): string => error instanceof Error
    ? error.message
    : String(error);

  return {
    accountAddActions: {
      communicationStart() {
        const contents = get().webContents;
        if (!contents || contents.isDestroyed()) throw new Error("Login WebContents 不可用");
        contents.ipc.handle(accountAdd.channel, async (_event, input: unknown) => {
          const requestValue = accountAdd.requestValidator.parse(input);
          switch (requestValue.method) {
          case "cookieImportCancel":
            return accountAdd.result.cancel.parse({
              canceled: get().accountAddActions.cookieImportCancel(),
            });
          case "cookieImportConsume":
            return accountAdd.result.account.parse({
              account: await get().accountAddActions.cookieImportConsume(),
            });
          case "cookieImportStart":
            return accountAdd.result.command.parse({
              completed: await get().accountAddActions.cookieImportStart(
                requestValue.input.browserId,
              ),
            });
          case "loginStart":
            return accountAdd.result.command.parse({
              completed: await get().accountAddActions.loginStart(),
            });
          }
        });
        return () => contents.ipc.removeHandler(accountAdd.channel);
      },
      cookieImportCancel() {
        if (!active || active.signal.aborted) return false;
        active.abort();
        get().cookieImportActions.operationCancel();
        return true;
      },
      async cookieImportConsume() {
        const candidate = get().cookieImport.candidate;
        if (get().cookieImport.status !== "ready" || !candidate) {
          throw new Error("没有待识别的浏览器登录态");
        }
        const value = await get().accountsActions.candidateConsume({
          partition: candidate.partition,
          source: {
            browserId: candidate.browserId,
            browserName: candidate.browserName,
          },
        });
        get().cookieImportActions.candidateClear({ partition: candidate.partition });
        return value;
      },
      async cookieImportStart(browserId) {
        if (active) throw new Error("已有 Cookie 导入操作正在进行");
        const input = cookieImport.input.create.parse({ browserId });
        const controller = new AbortController();
        active = controller;
        let connection: Awaited<ReturnType<
          CookieImportSlice["cookieImportActions"]["connectionOpen"]
        >> | undefined;
        let openedWindow: Awaited<ReturnType<
          BrowserSlice["browserActions"]["windowOpen"]
        >> | undefined;
        let partition: string | undefined;
        try {
          const previousPartition = get().cookieImport.status === "ready"
            ? get().cookieImport.candidate?.partition
            : undefined;
          if (previousPartition) {
            get().cookieImportActions.candidateClear({ partition: previousPartition });
            await get().cookieImportActions.partitionClear(previousPartition)
              .catch(() => undefined);
          }
          get().cookieImportActions.operationStart(input);
          const application = await get().browserActions.applicationRead(input);
          const debug = await get().browserActions.remoteDebugRead(
            application.executablePath,
            application.launchArguments,
          );
          const timeoutMs = get().cookieImport.authorizationTimeoutSeconds * 1_000;
          const deadline = Date.now() + timeoutMs;
          get().cookieImportActions.authorizationStart({
            expiresAt: new Date(deadline).toISOString(),
          });
          let endpoint: string | undefined;
          try {
            try {
              endpoint = await get().cookieImportActions.endpointRead(
                debug.devToolsActivePortPath,
              );
            } catch (error) {
              if (canceled(error)) throw error;
            }
            if (!endpoint) {
              openedWindow = await get().browserActions.windowOpen(
                application.executablePath,
                debug.inspectUrl,
                application.launchArguments,
                controller.signal,
              );
              endpoint = await get().cookieImportActions.endpointWait({
                activePortPath: debug.devToolsActivePortPath,
                signal: controller.signal,
                timeoutMs: Math.max(1, deadline - Date.now()),
              });
            }
            connection = await get().cookieImportActions.connectionOpen({
              endpoint,
              signal: controller.signal,
              timeoutMs: Math.max(1, deadline - Date.now()),
            });
          } finally {
            get().cookieImportActions.authorizationFinish();
          }
          partition = await get().cookieImportActions.webAccessCreate({
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
          get().cookieImportActions.operationSucceed(candidate);
          return true;
        } catch (error) {
          connection?.dispose();
          await openedWindow?.close().catch(() => false);
          if (partition) {
            await get().cookieImportActions.partitionClear(partition).catch(() => undefined);
          }
          if (canceled(error)) {
            get().cookieImportActions.operationCancel();
            return false;
          }
          get().cookieImportActions.operationFail({ error: errorText(error) });
          throw error;
        } finally {
          if (active === controller) active = undefined;
        }
      },
      dispose() {
        get().accountAddActions.cookieImportCancel();
      },
      async loginStart() {
        try {
          const candidate = await get().loginActions.create();
          if (!await get().accountsActions.loginIdentify(candidate.partition)) {
            throw new Error("未检测到有效的 ChatGPT 登录态");
          }
          return true;
        } catch (error) {
          if (canceled(error)) return false;
          throw error;
        }
      },
    },
  };
};

export { accountAdd, type AccountAddSlice, type nodeState_t };
export default accountAddStore;
