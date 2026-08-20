import type { IpcSlice } from "browser-partition-renderer/public.ts";
import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import { login as producer, type LoginState } from "chatgtp-com-login-main/login/store.ts";
import { accountAdd } from "chatgtp-com-login-main/accountAdd/store.ts";
type LoginSlice = {
  login: LoginState;
  loginActions: {
    cancel(): Promise<void>;
    connect(): () => void;
    start(): Promise<void>;
    stateSet(input: LoginState): void;
  };
};

const loginStore: ImmerStateCreator<LoginSlice, IpcSlice> = (set, get) => ({
  login: structuredClone(producer.initial),
  loginActions: {
    async cancel() {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "cancel" as const },
        inputValidator: producer.request.cancel,
        resultValidator: producer.result.cancel,
      });
    },
    connect() {
      const ipc = get().ipcActions;
      const stateSet = get().loginActions.stateSet;
      void ipc.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.request.stateRead,
        resultValidator: producer.loginValidator,
      }).then(stateSet).catch(console.error);
      return ipc.subscribe({
        channel: producer.channel,
        resultValidator: producer.loginValidator,
        run: stateSet,
      });
    },
    async start() {
      await get().ipcActions.invoke({
        channel: accountAdd.channel,
        input: { method: "loginStart" as const },
        inputValidator: accountAdd.request.loginStart,
        resultValidator: accountAdd.result.command,
      });
    },
    stateSet(input) {
      const value = producer.loginValidator.parse(input);
      set(state => {
        state.login = structuredClone(value);
      });
    },
  },
});

export { producer as login };
export default loginStore;
