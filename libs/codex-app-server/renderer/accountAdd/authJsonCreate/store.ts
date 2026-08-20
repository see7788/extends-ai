import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  authJsonCreate as producer,
  type AuthJsonCreate,
  type AuthJsonCreateInput,
} from "codex-app-server-main/accountAdd/authJsonCreate/store.ts";
import {
  browser,
  type BrowserApplications,
} from "browser-partition-main/browser/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountAdd } from "codex-app-server-main/accountAdd/store.ts";

type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    applicationsRead(): Promise<BrowserApplications>;
    cancel(): Promise<void>;
    connect(): () => void;
    create(input: AuthJsonCreateInput): Promise<void>;
    stateSet(input: AuthJsonCreate): void;
  };
};

const authJsonCreateStore: ImmerStateCreator<
  AuthJsonCreateSlice,
  IpcSlice
> = (set, get) => ({
  authJsonCreate: structuredClone(producer.initial),
  authJsonCreateActions: {
    async applicationsRead() {
      return get().ipcActions.invoke({
        channel: browser.channel,
        input: { method: "applicationsRead" as const },
        inputValidator: browser.request.applicationsRead,
        resultValidator: browser.result.applicationsRead,
      });
    },
    async cancel() {
      await get().ipcActions.invoke({
        channel: accountAdd.channel,
        input: { method: "authJsonCreateCancel" as const },
        inputValidator: accountAdd.request.authJsonCreateCancel,
        resultValidator: accountAdd.result.cancel,
      });
    },
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.authJsonCreateValidator,
      }).then(get().authJsonCreateActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().authJsonCreateActions.stateSet(message.value),
      });
    },
    async create(input) {
      await get().ipcActions.invoke({
        channel: accountAdd.channel,
        input: { input, method: "authJsonCreate" as const },
        inputValidator: accountAdd.request.authJsonCreate,
        resultValidator: accountAdd.result.create,
      });
    },
    stateSet(input) {
      set(state => {
        state.authJsonCreate = structuredClone(input);
      });
    },
  },
});

export { producer as authJsonCreate };
export default authJsonCreateStore;
