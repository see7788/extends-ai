import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  type BrowserWindow as ElectronBrowserWindow,
  type WebContents,
} from "electron";
import { z } from "zod";
import { loginOpen } from "./process.ts";
import { login, operationStartValidator } from "./public.ts";

type Login = z.infer<typeof login.loginValidator>;
type Identify = (partition: string) => Promise<boolean>;
type LoginSlice = {
  login: Login;
  loginActions: {
    cancel(): boolean;
    create(
      parent: ElectronBrowserWindow,
      identify: Identify,
    ): Promise<{ partition: string }>;
    install(parent: ElectronBrowserWindow, identify: Identify): () => void;
    operationCancel(): void;
    operationSucceed(): void;
    operationStart(input: z.infer<typeof operationStartValidator>): void;
  };
};

type Active = { cancel(): void };
let active: Active | undefined;

const loginStore: ImmerStateCreator<
  LoginSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    login.channel.stateUpdated,
    login.loginValidator.parse(get().login),
  );
  return ({
  login: structuredClone(login.initial),
  loginActions: {
    cancel() {
      if (!active) return false;
      active.cancel();
      return true;
    },
    async create(parent, identify) {
      if (active) throw new Error("已有内嵌登录窗口正在使用");
      const partition = `persist:login.chatgpt.${crypto.randomUUID()}`;
      get().loginActions.operationStart({ partition });
      const operation = loginOpen({ identify, parent, partition });
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
    install(parent, identify) {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) {
        throw new Error("Login WebContents 不可用");
      }
      contents.ipc.handle(login.channel.cancel, (_event, input: unknown) => {
        login.input.command.parse(input);
        return login.result.cancel.parse({
          canceled: get().loginActions.cancel(),
        });
      });
      contents.ipc.handle(login.channel.start, async (_event, input: unknown) => {
        login.input.command.parse(input);
        try {
          await get().loginActions.create(parent, identify);
          return login.result.start.parse({ completed: true });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return login.result.start.parse({ completed: false });
          }
          throw error;
        }
      });
      contents.ipc.handle(login.channel.stateRead, () => (
        login.loginValidator.parse(get().login)
      ));
      return () => {
        get().loginActions.cancel();
        contents.ipc.removeHandler(login.channel.cancel);
        contents.ipc.removeHandler(login.channel.start);
        contents.ipc.removeHandler(login.channel.stateRead);
      };
    },
    operationCancel() {
      set(state => {
        state.login = structuredClone(login.initial);
      });
      stateSend();
    },
    operationSucceed() {
      set(state => {
        if (state.login.status === "open" && state.login.partition) {
          state.login = structuredClone(login.initial);
        }
      });
      stateSend();
    },
    operationStart(input) {
      const value = operationStartValidator.parse(input);
      set(state => {
        state.login = { partition: value.partition, status: "open" };
      });
      stateSend();
    },
  },
  });
};

export { login };
export default loginStore;
