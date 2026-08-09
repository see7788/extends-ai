import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { cookieImport as producer } from "login-main/cookieImport/store.ts";
import { browser } from "browser-partition-main/browser/store.ts";
import { invoke } from "browser-partition-renderer/public.ts";

type BrowserApplications = ReturnType<typeof browser.browserApplicationsValidator.parse>;

type CookieImportSlice = {
  cookieImport: ReturnType<typeof producer.cookieImportValidator.parse>;
  cookieImportActions: {
    applicationsRead(): Promise<BrowserApplications>;
    cancel(): Promise<void>;
    start(input: ReturnType<typeof producer.input.create.parse>): Promise<void>;
    stateSet(input: ReturnType<typeof producer.cookieImportValidator.parse>): void;
  };
};

const cookieImportStore: ImmerStateCreator<CookieImportSlice> = set => ({
  cookieImport: structuredClone(producer.initial),
  cookieImportActions: {
    async applicationsRead() {
      return invoke({
        channel: browser.channel.applicationsRead,
        input: {},
        inputValidator: browser.input.command,
        resultValidator: browser.browserApplicationsValidator,
      });
    },
    async cancel() {
      await invoke({
        channel: producer.channel.cancel,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.cancel,
      });
    },
    async start(input) {
      await invoke({
        channel: producer.channel.start,
        input,
        inputValidator: producer.input.create,
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
