import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { authJsonImport as producer } from "codex-app-server-main/accountAdd/authJsonImport/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";

type AuthJsonImportSlice = {
  authJsonImport: ReturnType<typeof producer.authJsonImportValidator.parse>;
  authJsonImportActions: {
    clipboard(): Promise<void>;
    connect(): () => void;
    default(): Promise<void>;
    select(): Promise<void>;
    stateSet(input: ReturnType<typeof producer.authJsonImportValidator.parse>): void;
  };
};

const authJsonImportStore: ImmerStateCreator<
  AuthJsonImportSlice,
  IpcSlice
> = (set, get) => ({
  authJsonImport: structuredClone(producer.initial),
  authJsonImportActions: {
    async clipboard() {
      await get().ipcActions.invoke({
        channel: producer.channel.clipboard,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.import,
      });
    },
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: producer.channel.stateRead,
        stateSet: get().authJsonImportActions.stateSet,
        stateUpdatedChannel: producer.channel.stateUpdated,
        validator: producer.authJsonImportValidator,
      });
    },
    async default() {
      await get().ipcActions.invoke({
        channel: producer.channel.default,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.import,
      });
    },
    async select() {
      await get().ipcActions.invoke({
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
