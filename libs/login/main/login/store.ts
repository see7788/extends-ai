import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { randomUUID } from "node:crypto";
import type { BrowserWindow as ElectronBrowserWindow } from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import { z } from "zod";

const loginValidator = z.object({
  partition: z.string().trim().min(1).nullable(),
  status: z.enum(["idle", "open"]),
});
const operationStartValidator = loginValidator.pick({ partition: true });
const commandValidator = z.object({});
type Login = z.infer<typeof loginValidator>;
type Identify = (partition: string) => Promise<boolean>;
type LoginSlice = {
  login: Login;
  loginActions: {
    cancel(): boolean;
    create(
      parent: ElectronBrowserWindow,
      identify: Identify,
    ): Promise<{ partition: string }>;
    operationCancel(): void;
    operationSucceed(): void;
    operationStart(input: z.infer<typeof operationStartValidator>): void;
  };
};

const initial: Login = { partition: null, status: "idle" };
const login = {
  channel: {
    cancel: "login:login:cancel",
    start: "login:login:start",
    stateRead: "login:login:state-read",
    stateUpdated: "login:login:state-updated",
  },
  initial,
  input: {
    command: commandValidator,
    operationStart: operationStartValidator,
  },
  loginValidator,
  result: {
    cancel: z.object({ canceled: z.boolean() }),
    start: z.object({ completed: z.boolean() }),
  },
};

const canceledError = (): Error => {
  const error = new Error("内嵌登录已取消");
  error.name = "AbortError";
  return error;
};
type Active = { cancel(): void };
let active: Active | undefined;

const loginStore: ImmerStateCreator<LoginSlice> = (set, get) => ({
  login: structuredClone(initial),
  loginActions: {
    cancel() {
      if (!active) return false;
      active.cancel();
      return true;
    },
    create(parent, identify) {
      if (active) throw new Error("已有内嵌登录窗口正在使用");
      const partition = `persist:login.chatgpt.${randomUUID()}`;
      get().loginActions.operationStart({ partition });
      return new Promise((resolve, reject) => {
        let identifying = false;
        let settled = false;
        let watchingStop = (): void => undefined;
        let window: Awaited<ReturnType<typeof BrowserPartitionWindow.open>> | undefined;
        const finish = (error?: Error): void => {
          if (settled) return;
          settled = true;
          watchingStop();
          active = undefined;
          if (error) {
            get().loginActions.operationCancel();
            window?.dispose();
            void BrowserPartitionWindow.storageClear(partition).catch(() => undefined);
            reject(error);
          } else {
            get().loginActions.operationSucceed();
            resolve({ partition });
          }
        };
        const identifyRun = async (): Promise<void> => {
          if (identifying || settled) return;
          identifying = true;
          try {
            if (await identify(partition)) {
              finish();
              window?.dispose();
            }
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          } finally {
            identifying = false;
          }
        };
        active = { cancel: () => finish(canceledError()) };
        void BrowserPartitionWindow.open({
          height: 760,
          minHeight: 520,
          minWidth: 760,
          onClose: () => finish(canceledError()),
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
    },
    operationCancel() {
      set(state => {
        state.login = structuredClone(initial);
      });
    },
    operationSucceed() {
      set(state => {
        if (state.login.status === "open" && state.login.partition) {
          state.login = structuredClone(initial);
        }
      });
    },
    operationStart(input) {
      const value = operationStartValidator.parse(input);
      set(state => {
        state.login = { partition: value.partition, status: "open" };
      });
    },
  },
});

export { login };
export default loginStore;
