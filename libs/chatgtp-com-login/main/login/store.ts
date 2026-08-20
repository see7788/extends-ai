import type BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import type {
  BrowserWindow as ElectronBrowserWindow,
  session as electronSession,
} from "electron";
import { z } from "zod";

const loginValidator = z.object({
  partition: z.string().trim().min(1).nullable(),
  status: z.enum(["idle", "open"]),
});
const operationStartValidator = loginValidator.pick({ partition: true });
const accountSessionValidator = z.object({
  user: z.object({ email: z.string().email() }).passthrough().nullable().optional(),
}).passthrough();
const request = {
  cancel: z.object({ method: z.literal("cancel") }),
  stateRead: z.object({ method: z.literal("stateRead") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.cancel,
  request.stateRead,
]);
const result = {
  cancel: z.object({ canceled: z.boolean() }),
};

type LoginState = z.infer<typeof loginValidator>;
type LoginContract = {
  channel: "login";
  initial: LoginState;
  loginValidator: typeof loginValidator;
  request: typeof request;
  requestValidator: typeof requestValidator;
  result: typeof result;
};
type LoginOpen = {
  cancel(): void;
  result: Promise<void>;
};
type nodeState_t = {
  browserPartitionWindow_open_nodestate: typeof BrowserPartitionWindow.open;
  browserPartitionWindow_storageClear_nodestate: typeof BrowserPartitionWindow.storageClear;
  loginWindow_nodestate?: ElectronBrowserWindow;
  session_fromPartition_nodestate: typeof electronSession.fromPartition;
};
type LoginSlice = {
  login: LoginState;
  loginActions: {
    cancel(): boolean;
    communicationStart(): () => void;
    create(): Promise<{ partition: string }>;
    operationCancel(): void;
    operationSucceed(): void;
    operationStart(input: z.infer<typeof operationStartValidator>): void;
  };
  loginPrivateActions: {
    canceledError(): Error;
    identify(partition: string): Promise<boolean>;
    open(partition: string): LoginOpen;
    stateSend(): void;
  };
};

const initial = { partition: null, status: "idle" } satisfies LoginState;
const login = {
  channel: "login",
  initial,
  loginValidator,
  request,
  requestValidator,
  result,
} satisfies LoginContract;

const loginStore: ImmerStateCreator<LoginSlice, nodeState_t> = (set, get) => {
  let active: LoginOpen | undefined;

  return {
    login: structuredClone(initial),
    loginActions: {
      cancel() {
        if (!active) return false;
        active.cancel();
        return true;
      },
      communicationStart() {
        const contents = get().loginWindow_nodestate?.webContents;
        if (!contents || contents.isDestroyed()) throw new Error("Login WebContents 不可用");
        contents.ipc.handle(login.channel, (_event, input: unknown) => {
          const requestValue = login.requestValidator.parse(input);
          switch (requestValue.method) {
          case "cancel":
            return login.result.cancel.parse({ canceled: get().loginActions.cancel() });
          case "stateRead":
            return login.loginValidator.parse(get().login);
          }
        });
        return () => contents.ipc.removeHandler(login.channel);
      },
      async create() {
        if (active) throw new Error("已有内嵌登录窗口正在使用");
        const partition = `persist:login.chatgpt.${crypto.randomUUID()}`;
        get().loginActions.operationStart({ partition });
        const operation = get().loginPrivateActions.open(partition);
        active = operation;
        try {
          await operation.result;
          get().loginActions.operationSucceed();
          return { partition };
        } catch (error) {
          get().loginActions.operationCancel();
          throw error;
        } finally {
          if (active === operation) active = undefined;
        }
      },
      operationCancel() {
        set(state => {
          state.login = structuredClone(initial);
        });
        get().loginPrivateActions.stateSend();
      },
      operationSucceed() {
        set(state => {
          if (state.login.status === "open" && state.login.partition) {
            state.login = structuredClone(initial);
          }
        });
        get().loginPrivateActions.stateSend();
      },
      operationStart(input) {
        const value = operationStartValidator.parse(input);
        set(state => {
          state.login = { partition: value.partition, status: "open" };
        });
        get().loginPrivateActions.stateSend();
      },
    },
    loginPrivateActions: {
      canceledError() {
        const error = new Error("内嵌登录已取消");
        error.name = "AbortError";
        return error;
      },
      async identify(partition) {
        try {
          const response = await get().session_fromPartition_nodestate(partition).fetch(
            "https://chatgpt.com/api/auth/session",
            { credentials: "include" },
          );
          if (!response.ok) return false;
          return Boolean(accountSessionValidator.parse(
            await response.json() as unknown,
          ).user);
        } catch {
          return false;
        }
      },
      open(partition) {
        const parent = get().loginWindow_nodestate;
        if (!parent || parent.isDestroyed()) throw new Error("Login 父窗口不可用");
        let finish: (error?: Error) => void = () => undefined;
        const resultPromise = new Promise<void>((resolve, reject) => {
          let identifying = false;
          let settled = false;
          let watchingStop = (): void => undefined;
          let window: Awaited<ReturnType<typeof BrowserPartitionWindow.open>> | undefined;

          finish = (error?: Error): void => {
            if (settled) return;
            settled = true;
            watchingStop();
            window?.dispose();
            if (error) {
              void get().browserPartitionWindow_storageClear_nodestate(partition).catch(() => undefined);
              reject(error);
              return;
            }
            resolve();
          };

          const identifyRun = async (): Promise<void> => {
            if (identifying || settled) return;
            identifying = true;
            try {
              if (await get().loginPrivateActions.identify(partition)) finish();
            } catch (error) {
              finish(error instanceof Error ? error : new Error(String(error)));
            } finally {
              identifying = false;
            }
          };

          void get().browserPartitionWindow_open_nodestate({
            height: 760,
            minHeight: 520,
            minWidth: 760,
            onClose: () => finish(get().loginPrivateActions.canceledError()),
            parent,
            partition,
            title: "ChatGPT.com",
            url: "https://chatgpt.com/",
            width: 920,
          }).then(value => {
            window = value;
            if (settled) {
              value.dispose();
              return;
            }
            const contents = value.value.webContents;
            const cookies = contents.session.cookies;
            const identifySchedule = (): void => {
              void identifyRun();
            };
            contents.on("did-stop-loading", identifySchedule);
            cookies.on("changed", identifySchedule);
            watchingStop = () => {
              contents.removeListener("did-stop-loading", identifySchedule);
              cookies.removeListener("changed", identifySchedule);
            };
            void identifyRun();
          }).catch(error => finish(
            error instanceof Error ? error : new Error(String(error)),
          ));
        });

        return {
          cancel: () => finish(get().loginPrivateActions.canceledError()),
          result: resultPromise,
        };
      },
      stateSend() {
        const contents = get().loginWindow_nodestate?.webContents;
        if (!contents || contents.isDestroyed()) return;
        contents.send(login.channel, loginValidator.parse(get().login));
      },
    },
  };
};

export { login, type LoginSlice, type LoginState, type nodeState_t };
export default loginStore;
