import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  type BrowserApplications,
  cookieImport as producer,
  type CookieImport,
  type CookieImportCreateInput,
} from "login-main/cookieImport/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";

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
        channel: producer.channel,
        input: { method: "applicationsRead" as const },
        inputValidator: producer.request.applicationsRead,
        resultValidator: producer.result.applicationsRead,
      });
    },
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
        channel: producer.channel,
        input: { input, method: "start" as const },
        inputValidator: producer.request.start,
        resultValidator: producer.result.start,
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
