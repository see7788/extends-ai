import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  type BrowserApplications,
  cookieImport as producer,
  type CookieImport,
  type CookieImportCreateInput,
} from "chatgtp-com-login-main/cookieImport/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { browser } from "browser-partition-main/browser/store.ts";
import { accountAdd } from "chatgtp-com-login-main/accountAdd/store.ts";

type CookieImportSlice = {
  cookieImport: CookieImport;
  cookieImportActions: {
    applicationsRead(): Promise<BrowserApplications>;
    cancel(): Promise<void>;
    connect(): () => void;
    start(input: CookieImportCreateInput): Promise<void>;
    stateSet(input: CookieImport): void;
  };
};

const cookieImportStore: ImmerStateCreator<
  CookieImportSlice,
  IpcSlice
> = (set, get) => ({
  cookieImport: structuredClone(producer.initial),
  cookieImportActions: {
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
        input: { method: "cookieImportCancel" as const },
        inputValidator: accountAdd.request.cookieImportCancel,
        resultValidator: accountAdd.result.cancel,
      });
    },
    connect() {
      const ipc = get().ipcActions;
      const stateSet = get().cookieImportActions.stateSet;
      void ipc.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.request.stateRead,
        resultValidator: producer.cookieImportValidator,
      }).then(stateSet).catch(console.error);
      return ipc.subscribe({
        channel: producer.channel,
        resultValidator: producer.cookieImportValidator,
        run: stateSet,
      });
    },
    async start(input) {
      await get().ipcActions.invoke({
        channel: accountAdd.channel,
        input: { input, method: "cookieImportStart" as const },
        inputValidator: accountAdd.request.cookieImportStart,
        resultValidator: accountAdd.result.command,
      });
    },
    stateSet(input) {
      set(state => {
        state.cookieImport = structuredClone(input);
      });
    },
  },
});

export { producer as cookieImport };
export default cookieImportStore;
