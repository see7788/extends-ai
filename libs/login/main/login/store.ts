import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const loginValidator = z.object({
  partition: z.string().trim().min(1).nullable(),
  status: z.enum(["idle", "open"]),
});
const operationStartValidator = loginValidator.pick({ partition: true });
const commandValidator = z.object({});
type Login = z.infer<typeof loginValidator>;
type Identify = (partition: string) => Promise<boolean>;
type LoginWindow = {
  dispose(): void;
  contents: {
    cookies: {
      on(event: "changed", listener: () => void): void;
      removeListener(event: "changed", listener: () => void): void;
    };
    on(event: "did-stop-loading", listener: () => void): void;
    removeListener(event: "did-stop-loading", listener: () => void): void;
  };
};
type LoginRuntime = {
  idCreate(): string;
  storageClear(partition: string): Promise<void>;
  windowOpen(input: {
    onClose(): void;
    parent: unknown;
    partition: string;
  }): Promise<LoginWindow>;
};
type LoginSlice = {
  login: Login;
  loginActions: {
    cancel(): boolean;
    create(
      parent: unknown,
      identify: Identify,
      runtime: LoginRuntime,
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
    create(parent, identify, runtime) {
      if (active) throw new Error("已有内嵌登录窗口正在使用");
      const partition = `persist:login.chatgpt.${runtime.idCreate()}`;
      get().loginActions.operationStart({ partition });
      return new Promise((resolve, reject) => {
        let identifying = false;
        let settled = false;
        let watchingStop = (): void => undefined;
        let window: LoginWindow | undefined;
        const finish = (error?: Error): void => {
          if (settled) return;
          settled = true;
          watchingStop();
          active = undefined;
          if (error) {
            get().loginActions.operationCancel();
            window?.dispose();
            void runtime.storageClear(partition).catch(() => undefined);
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
        void runtime.windowOpen({
          onClose: () => finish(canceledError()),
          parent,
          partition,
        }).then(value => {
          window = value;
          if (settled) {
            value.dispose();
            return;
          }
          const contents = value.contents;
          const cookies = contents.cookies;
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
