import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { login as producer } from "login-main/login/public.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";

type LoginSlice = {
  login: ReturnType<typeof producer.loginValidator.parse>;
  loginActions: {
    cancel(): Promise<void>;
    connect(): () => void;
    start(): Promise<void>;
    stateSet(input: ReturnType<typeof producer.loginValidator.parse>): void;
  };
};

const loginStore: ImmerStateCreator<
  LoginSlice,
  IpcSlice
> = (set, get) => ({
  login: structuredClone(producer.initial),
  loginActions: {
    async cancel() {
      await get().ipcActions.invoke({
        channel: producer.channel.cancel,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.cancel,
      });
    },
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: producer.channel.stateRead,
        stateSet: get().loginActions.stateSet,
        stateUpdatedChannel: producer.channel.stateUpdated,
        validator: producer.loginValidator,
      });
    },
    async start() {
      await get().ipcActions.invoke({
        channel: producer.channel.start,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.start,
      });
    },
    stateSet(input) {
      set(state => {
        state.login = structuredClone(input);
      });
    },
  },
});

export { producer as login };
export default loginStore;
