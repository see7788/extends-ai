import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { authJsonImport as producer } from "codex-app-server-main/accountAdd/authJsonImport/store.ts";
import { invoke } from "browser-partition-renderer/public.ts";

type AuthJsonImportSlice = {
  authJsonImport: ReturnType<typeof producer.authJsonImportValidator.parse>;
  authJsonImportActions: {
    clipboard(): Promise<void>;
    default(): Promise<void>;
    select(): Promise<void>;
    stateSet(input: ReturnType<typeof producer.authJsonImportValidator.parse>): void;
  };
};

const authJsonImportStore: ImmerStateCreator<AuthJsonImportSlice> = set => ({
  authJsonImport: structuredClone(producer.initial),
  authJsonImportActions: {
    async clipboard() {
      await invoke({
        channel: producer.channel.clipboard,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.import,
      });
    },
    async default() {
      await invoke({
        channel: producer.channel.default,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.import,
      });
    },
    async select() {
      await invoke({
        channel: producer.channel.select,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.import,
      });
    },
    stateSet(input) {
      set(state => {
        state.authJsonImport = structuredClone(input);
      });
    },
  },
});

export { producer as authJsonImport };
export default authJsonImportStore;
