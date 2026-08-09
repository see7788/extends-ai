import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { login as producer } from "login-main/login/store.ts";
import { invoke } from "browser-partition-renderer/public.ts";

type LoginSlice = {
  login: ReturnType<typeof producer.loginValidator.parse>;
  loginActions: {
    cancel(): Promise<void>;
    start(): Promise<void>;
    stateSet(input: ReturnType<typeof producer.loginValidator.parse>): void;
  };
};

const loginStore: ImmerStateCreator<LoginSlice> = set => ({
  login: structuredClone(producer.initial),
  loginActions: {
    async cancel() {
      await invoke({
        channel: producer.channel.cancel,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.cancel,
      });
    },
    async start() {
      await invoke({
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
