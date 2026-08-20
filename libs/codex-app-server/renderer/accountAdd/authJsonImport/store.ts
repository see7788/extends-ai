import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  authJsonImport as producer,
  type AuthJsonImport,
} from "codex-app-server-main/accountAdd/authJsonImport/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountAdd } from "codex-app-server-main/accountAdd/store.ts";

type AuthJsonImportSlice = {
  authJsonImport: AuthJsonImport;
  authJsonImportActions: {
    clipboard(): Promise<void>;
    connect(): () => void;
    default(): Promise<void>;
    select(): Promise<void>;
    stateSet(input: AuthJsonImport): void;
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
        channel: accountAdd.channel,
        input: { method: "authJsonImportClipboard" as const },
        inputValidator: accountAdd.request.authJsonImportClipboard,
        resultValidator: accountAdd.result.import,
      });
    },
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.authJsonImportValidator,
      }).then(get().authJsonImportActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().authJsonImportActions.stateSet(message.value),
      });
    },
    async default() {
      await get().ipcActions.invoke({
        channel: accountAdd.channel,
        input: { method: "authJsonImportDefault" as const },
        inputValidator: accountAdd.request.authJsonImportDefault,
        resultValidator: accountAdd.result.import,
      });
    },
    async select() {
      await get().ipcActions.invoke({
        channel: accountAdd.channel,
        input: { method: "authJsonImportSelect" as const },
        inputValidator: accountAdd.request.authJsonImportSelect,
        resultValidator: accountAdd.result.import,
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
