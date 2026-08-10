import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { cookieImport as producer } from "login-main/cookieImport/public.ts";
import { browser } from "browser-partition-main/browser/public.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";

type BrowserApplications = ReturnType<typeof browser.browserApplicationsValidator.parse>;

type CookieImportSlice = {
  cookieImport: ReturnType<typeof producer.cookieImportValidator.parse>;
  cookieImportActions: {
    applicationsRead(): Promise<BrowserApplications>;
    cancel(): Promise<void>;
    connect(): () => void;
    start(input: ReturnType<typeof producer.input.create.parse>): Promise<void>;
    stateSet(input: ReturnType<typeof producer.cookieImportValidator.parse>): void;
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
        channel: browser.channel.applicationsRead,
        input: {},
        inputValidator: browser.input.command,
        resultValidator: browser.browserApplicationsValidator,
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
